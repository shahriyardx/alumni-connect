import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db, type Tx, withTenant } from "@/db";
import {
  auditLog,
  batch,
  pendingSignup,
  rateLimit,
  rosterEntry,
  university,
  user,
} from "@/db/schema";
import {
  ALLOWED_MIME,
  type AllowedMime,
  EXT_TO_MIME,
  finalKeyFor,
  presignPost,
  promoteUpload,
  remove,
} from "../storage";
import { hashStudentId, normalizeStudentId, roleFor } from "../student-id";
import { audit, isPlatformAdmin, publicProcedure, router } from "../trpc";
import { optionalUrl } from "./platform";

const email = z
  .string()
  .trim()
  .email()
  .max(200)
  .transform((e) => e.toLowerCase());

/**
 * Fixed-window counter on better-auth's rate_limit table (no RLS), for
 * limits that span tenants — audit_log is tenant-scoped, so it can't count
 * one IP's attempts across freshly created universities.
 */
async function overLimit(key: string, max: number, windowMs = 10 * 60_000) {
  const now = Date.now();
  const stale = sql`${rateLimit.lastRequest} < ${now - windowMs}`;
  const [r] = await db
    .insert(rateLimit)
    .values({ id: key, key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${stale} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${stale} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  return r.count > max;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * The ID card's staging key is derived one-way from the signup token's hash:
 * a key issued to another signup (even in the same university) never
 * matches, a replaced or expired signup's staging object can still be
 * found, and the key reveals nothing of the stored hash. Staging lives under
 * its own prefix so a bucket lifecycle rule can expire it.
 */
const idCardStem = (universityId: string, tokenHash: string) =>
  `${universityId}/staging/idcard/${sha256(`idcard-key:${tokenHash}`).slice(0, 32)}`;

/** Every object a pending row's ID card may occupy: its final copy and each possible staging key. */
const cardObjects = (p: {
  universityId: string | null;
  signupTokenHash: string | null;
  idCardKey: string | null;
}) => [
  ...(p.idCardKey ? [p.idCardKey] : []),
  ...(p.universityId && p.signupTokenHash
    ? Object.values(ALLOWED_MIME).map(
        (ext) =>
          `${idCardStem(p.universityId as string, p.signupTokenHash as string)}.${ext}`,
      )
    : []),
];

/**
 * The subset of `keys` nothing still uses: no user row and no live pending
 * row points at it. Call inside the transaction that dropped the old
 * reference, after the write; remove the result only after commit.
 */
async function unreferenced(tx: Tx | typeof db, keys: string[]) {
  if (keys.length === 0) return [];
  const unis = [...new Set(keys.map((k) => k.split("/")[0]))];
  const users = await tx
    .select({ k: user.idCardKey })
    .from(user)
    .where(
      and(inArray(user.universityId, unis), inArray(user.idCardKey, keys)),
    );
  const pending = await tx
    .select({ k: pendingSignup.idCardKey })
    .from(pendingSignup)
    .where(
      and(
        inArray(pendingSignup.idCardKey, keys),
        gt(pendingSignup.expiresAt, new Date()),
      ),
    );
  const used = new Set([...users, ...pending].map((r) => r.k));
  return keys.filter((k) => !used.has(k));
}

const removeAll = (keys: string[]) =>
  Promise.all(keys.map((k) => remove(k).catch(() => {})));

/**
 * Upserts the pending row for `values.email`, returning the card objects of
 * the row it replaced that nothing else references. The old row is read
 * under FOR UPDATE in the same transaction as the write, so a concurrent
 * confirmIdCard / sign-up claim either finished before (and its reference
 * is seen) or sees the new row (and fails its compare). Remove the returned
 * keys after commit.
 */
async function upsertPending(
  tx: Tx,
  values: typeof pendingSignup.$inferInsert,
): Promise<string[]> {
  const [old] = await tx
    .select()
    .from(pendingSignup)
    .where(eq(pendingSignup.email, values.email))
    .for("update");
  await tx
    .insert(pendingSignup)
    .values(values)
    .onConflictDoUpdate({ target: pendingSignup.email, set: values });
  return old ? cardObjects(old) : [];
}

/**
 * Opportunistic purge (no cron): expired pending rows can never complete
 * sign-up, so delete them (100 per call) and their unreferenced card objects.
 */
async function purgeExpiredPending() {
  const orphans = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(pendingSignup)
      .where(
        inArray(
          pendingSignup.email,
          tx
            .select({ email: pendingSignup.email })
            .from(pendingSignup)
            .where(lt(pendingSignup.expiresAt, new Date()))
            .limit(100),
        ),
      )
      .returning();
    return unreferenced(tx, rows.flatMap(cardObjects));
  });
  await removeAll(orphans);
}

const mimeEnum = z.enum(Object.keys(ALLOWED_MIME) as [AllowedMime]);

/** Every optional pending_signup column, nulled: spread first so an upsert fully resets the row. */
const BLANK_PENDING = {
  universityId: null,
  applicationName: null,
  applicationWebsite: null,
  batchNumber: null,
  graduationYear: null,
  title: null,
  studentIdHash: null,
  signupTokenHash: null,
  idCardKey: null,
  rosterMatch: null,
  studentIdHint: null,
} satisfies Partial<typeof pendingSignup.$inferInsert>;

/**
 * Deletes stale (unverified) accounts matching `where`. One that owned a
 * still-PENDING application gets that university REJECTED first, audited in
 * its own tenant (audit rows are append-only, so universities are never
 * deleted). Runs in the caller's transaction and restores its tenant.
 * Returns the deleted users' ID card keys.
 */
async function clearStaleUnverified(tx: Tx, where: SQL): Promise<string[]> {
  const stale = await tx
    .select({
      id: user.id,
      universityId: user.universityId,
      role: user.role,
      idCardKey: user.idCardKey,
    })
    .from(user)
    .where(and(eq(user.emailVerified, false), where));
  if (stale.length === 0) return [];
  const [{ tenant }] = await tx.execute<{ tenant: string | null }>(
    sql`select current_setting('app.university_id', true) as tenant`,
  );
  for (const s of stale) {
    if (s.role !== "OWNER") continue;
    const [abandoned] = await tx
      .update(university)
      .set({ status: "REJECTED" })
      .where(
        and(
          eq(university.id, s.universityId),
          eq(university.status, "PENDING"),
        ),
      )
      .returning({ id: university.id });
    if (!abandoned) continue;
    await tx.execute(
      sql`select set_config('app.university_id', ${abandoned.id}, true)`,
    );
    await audit(tx, abandoned.id, null, "university.reject", s.id, {
      reason: "abandoned",
    });
  }
  await tx.execute(
    sql`select set_config('app.university_id', ${tenant ?? ""}, true)`,
  );
  await tx.delete(user).where(
    inArray(
      user.id,
      stale.map((s) => s.id),
    ),
  );
  // Returned, not removed: the caller deletes the objects after commit.
  return unreferenced(
    tx,
    stale.flatMap((s) => (s.idCardKey ? [s.idCardKey] : [])),
  );
}

export const authRouter = router({
  universities: publicProcedure.query(() =>
    db
      .select({
        id: university.id,
        name: university.name,
        emailDomain: university.emailDomain,
      })
      .from(university)
      .where(eq(university.status, "ACTIVE"))
      .orderBy(university.name),
  ),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        status: user.status,
        suspendedUntil: user.suspendedUntil,
        universityId: user.universityId,
        universityName: university.name,
        avatarKey: user.avatarKey,
      })
      .from(user)
      .innerJoin(university, eq(university.id, user.universityId))
      .where(eq(user.id, ctx.userId));
    if (!row) return null;
    const { emailVerified: _, ...me } = row;
    return { ...me, isPlatformAdmin: isPlatformAdmin(row) };
  }),

  registerUniversity: publicProcedure
    .input(
      z.object({
        universityName: z.string().trim().min(2).max(120),
        website: optionalUrl,
        name: z.string().trim().min(2).max(80),
        title: z.string().trim().min(2).max(80),
        email,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (
        (await overLimit(`app:register-university:ip:${ctx.ip}`, 5)) ||
        (await overLimit(`app:register-university:email:${input.email}`, 3))
      )
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts, try again later",
        });

      // Same squatting rules as startSignup: a verified or fresh account
      // blocks; a stale unverified one is cleared.
      const graceCutoff = new Date(Date.now() - 15 * 60_000);
      const [dup] = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.email, input.email),
            or(eq(user.emailVerified, true), gt(user.createdAt, graceCutoff)),
          ),
        );
      if (dup)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This email is already registered",
        });

      // The university itself is created by the sign-up hook, so an
      // abandoned application leaves nothing behind. Every column is set,
      // so a same-email overwrite never carries stale student fields.
      const values = {
        ...BLANK_PENDING,
        email: input.email,
        applicationName: input.universityName,
        applicationWebsite: input.website,
        department: "Administration",
        title: input.title,
        role: "OWNER" as const,
        status: "PENDING" as const,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      };
      const orphans = await db.transaction(async (tx) => {
        const stale = await clearStaleUnverified(
          tx,
          eq(user.email, input.email),
        );
        const replaced = await upsertPending(tx, values);
        return [...stale, ...(await unreferenced(tx, replaced))];
      });
      await removeAll(orphans);
      return { ok: true };
    }),

  batches: publicProcedure
    .input(z.object({ universityId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [uni] = await db
        .select({ id: university.id })
        .from(university)
        .where(
          and(
            eq(university.id, input.universityId),
            eq(university.status, "ACTIVE"),
          ),
        );
      if (!uni) return [];
      return withTenant(uni.id, (tx) =>
        tx
          .select({
            number: batch.number,
            graduationYear: batch.graduationYear,
          })
          .from(batch)
          .orderBy(batch.number),
      );
    }),

  confirmIdCard: publicProcedure
    .input(
      z.object({
        email,
        signupToken: z.string().min(1).max(100),
        key: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (await overLimit(`app:confirm-idcard:ip:${ctx.ip}`, 20))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts, try again later",
        });
      const [p] = await db
        .select()
        .from(pendingSignup)
        .where(
          and(
            eq(pendingSignup.email, input.email),
            gt(pendingSignup.expiresAt, new Date()),
          ),
        );
      const given = Buffer.from(sha256(input.signupToken), "hex");
      const stored = Buffer.from(p?.signupTokenHash ?? "", "hex");
      if (
        !p?.universityId ||
        stored.length !== given.length ||
        !timingSafeEqual(stored, given)
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sign-up expired, start again",
        });

      const stem = idCardStem(p.universityId, p.signupTokenHash as string);
      const ext = input.key.slice(stem.length + 1);
      const mime = EXT_TO_MIME[ext];
      if (!input.key.startsWith(`${stem}.`) || !mime)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found",
        });
      // Idempotent once this signup's card is stored; never re-copies.
      if (p.idCardKey === finalKeyFor(input.key)) return { ok: true };
      const final = await promoteUpload(input.key, mime);
      // Bound to the token hash: a concurrent restart or sign-up claim wins.
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ idCardKey: pendingSignup.idCardKey })
          .from(pendingSignup)
          .where(
            and(
              eq(pendingSignup.email, input.email),
              eq(pendingSignup.signupTokenHash, p.signupTokenHash as string),
            ),
          )
          .for("update");
        if (!row) return { stored: false, orphans: [final.key] };
        await tx
          .update(pendingSignup)
          .set({ idCardKey: final.key })
          .where(eq(pendingSignup.email, input.email));
        // A card of another type confirmed earlier for this token is replaced.
        const old = row.idCardKey && row.idCardKey !== final.key;
        return { stored: true, orphans: old ? [row.idCardKey as string] : [] };
      });
      await removeAll(await unreferenced(db, outcome.orphans));
      if (!outcome.stored)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sign-up expired, start again",
        });
      return { ok: true };
    }),

  startSignup: publicProcedure
    .input(
      z.object({
        universityId: z.string().uuid(),
        email,
        studentId: z.string().min(3).max(40),
        batchNumber: z.number().int().min(1).max(9999),
        graduationYear: z
          .number()
          .int()
          .min(1990)
          .refine((y) => y <= new Date().getFullYear() + 8, {
            message: "Invalid graduation year",
          })
          .optional(),
        department: z.string().min(2).max(80),
        idCardMime: mimeEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await purgeExpiredPending();
      const [uni] = await db
        .select()
        .from(university)
        .where(
          and(
            eq(university.id, input.universityId),
            eq(university.status, "ACTIVE"),
          ),
        );
      if (!uni)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "University not found",
        });
      const idHash = hashStudentId(uni.id, input.studentId);

      const outcome = await withTenant(uni.id, async (tx) => {
        const since = new Date(Date.now() - 10 * 60_000);
        const recent = (where: SQL) =>
          tx
            .select({ n: count() })
            .from(auditLog)
            .where(
              and(
                eq(auditLog.action, "signup.attempt"),
                gt(auditLog.createdAt, since),
                where,
              ),
            )
            .then((r) => r[0].n);
        const tooMany =
          (await recent(eq(auditLog.ip, ctx.ip))) >= 10 ||
          (await recent(
            sql`${auditLog.meta}->>'idHashPrefix' = ${idHash.slice(0, 12)}`,
          )) >= 5 ||
          // Backstop: repeated attempts for one email, regardless of IP/ID.
          (await recent(eq(auditLog.target, input.email))) >= 5;
        if (tooMany) {
          return {
            error: new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many attempts, try again later",
            }),
          };
        }

        const fail = async (
          code: TRPCError["code"],
          message: string,
          reason: string,
        ) => {
          await audit(
            tx,
            uni.id,
            null,
            "signup.attempt",
            input.email,
            { ok: false, reason, idHashPrefix: idHash.slice(0, 12) },
            ctx.ip,
          );
          return { error: new TRPCError({ code, message }) };
        };

        // A verified account always blocks a signup. An unverified account
        // blocks it too *while it might still be mid-verification* (created
        // in the last 15 minutes) — otherwise an attacker holding either the
        // victim's email or their own roster ID could delete the victim's
        // in-progress signup out from under them (see sweep below). Only an
        // unverified account older than that grace period is fair game: it
        // can't log in, so nothing of value is lost, and it gets swept away
        // once the real owner's signup actually succeeds.
        const unverifiedGraceCutoff = new Date(Date.now() - 15 * 60_000);
        const [dup] = await tx
          .select({ id: user.id })
          .from(user)
          .where(
            and(
              or(eq(user.email, input.email), eq(user.studentIdHash, idHash)),
              or(
                eq(user.emailVerified, true),
                gt(user.createdAt, unverifiedGraceCutoff),
              ),
            ),
          );
        if (dup)
          return fail(
            "CONFLICT",
            "This student ID or email is already registered",
            "duplicate",
          );

        const [b] = await tx
          .select({ id: batch.id, graduationYear: batch.graduationYear })
          .from(batch)
          .where(eq(batch.number, input.batchNumber));
        const graduationYear = b?.graduationYear ?? input.graduationYear;
        if (graduationYear === undefined)
          return fail(
            "BAD_REQUEST",
            "Enter your graduation year",
            "graduation-year",
          );
        // A hint for the approver only — never returned to the applicant.
        const [hit] = b
          ? await tx
              .select({ id: rosterEntry.id })
              .from(rosterEntry)
              .where(
                and(
                  eq(rosterEntry.batchId, b.id),
                  eq(rosterEntry.studentIdHash, idHash),
                ),
              )
          : [];
        const role = roleFor({ graduationYear });

        // Clear any *stale* unverified account squatting on this email or ID
        // (e.g. an attacker who started sign-up with the victim's roster ID
        // and email but never verified, past the 15-minute grace period
        // checked above). It never logged in, so nothing of value is lost;
        // session/account rows cascade with it.
        const staleCards = await clearStaleUnverified(
          tx,
          and(
            lt(user.createdAt, unverifiedGraceCutoff),
            or(eq(user.email, input.email), eq(user.studentIdHash, idHash)),
          ) as SQL,
        );

        const signupToken = randomBytes(32).toString("base64url");
        const values = {
          ...BLANK_PENDING,
          email: input.email,
          universityId: uni.id,
          batchNumber: input.batchNumber,
          graduationYear,
          department: input.department,
          studentIdHash: idHash,
          signupTokenHash: sha256(signupToken),
          rosterMatch: !!hit,
          studentIdHint: normalizeStudentId(input.studentId).slice(-4),
          role,
          status: "PENDING" as const,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        };
        const replaced = await unreferenced(
          tx,
          await upsertPending(tx, values),
        );
        await audit(
          tx,
          uni.id,
          null,
          "signup.attempt",
          input.email,
          { ok: true, idHashPrefix: idHash.slice(0, 12) },
          ctx.ip,
        );
        return {
          role,
          signupToken,
          tokenHash: values.signupTokenHash,
          orphans: [...staleCards, ...replaced],
        };
      });

      if ("error" in outcome) throw outcome.error;
      const { role, signupToken, tokenHash, orphans } = outcome;
      await removeAll(orphans);
      const key = `${idCardStem(uni.id, tokenHash)}.${ALLOWED_MIME[input.idCardMime]}`;
      const post = await presignPost(key, input.idCardMime);
      return { role, signupToken, upload: { key, ...post } };
    }),
});
