import { TRPCError } from "@trpc/server";
import { and, count, eq, gt, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import {
  auditLog,
  batch,
  pendingSignup,
  rateLimit,
  rosterEntry,
  university,
  user,
} from "@/db/schema";
import { hashStudentId, roleFor } from "../student-id";
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
 * Deletes a stale (unverified) account on this email. If it was the owner
 * of a still-PENDING application, that university is marked REJECTED first
 * (audit rows are append-only, so universities are never deleted).
 */
async function clearStaleUnverified(email: string) {
  const [stale] = await db
    .select({ id: user.id, universityId: user.universityId, role: user.role })
    .from(user)
    .where(and(eq(user.email, email), eq(user.emailVerified, false)));
  if (!stale) return;
  await withTenant(stale.universityId, async (tx) => {
    if (stale.role === "OWNER") {
      const [abandoned] = await tx
        .update(university)
        .set({ status: "REJECTED" })
        .where(
          and(
            eq(university.id, stale.universityId),
            eq(university.status, "PENDING"),
          ),
        )
        .returning({ id: university.id });
      if (abandoned)
        await audit(tx, abandoned.id, null, "university.abandon", email);
    }
    await tx.delete(user).where(eq(user.id, stale.id));
  });
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
      await clearStaleUnverified(input.email);

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
      await db
        .insert(pendingSignup)
        .values(values)
        .onConflictDoUpdate({ target: pendingSignup.email, set: values });
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
          }),
        department: z.string().min(2).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

        const [{ n: rosterSize }] = await tx
          .select({ n: count() })
          .from(rosterEntry);
        // ponytail: interim roster check until sign-up v2 (W3) makes every signup PENDING.
        let graduationYear = input.graduationYear;
        let status: "ACTIVE" | "PENDING";
        if (rosterSize > 0) {
          const [row] = await tx
            .select({
              number: batch.number,
              graduationYear: batch.graduationYear,
            })
            .from(rosterEntry)
            .innerJoin(batch, eq(batch.id, rosterEntry.batchId))
            .where(eq(rosterEntry.studentIdHash, idHash));
          // Same external message for both failure modes so an attacker
          // can't use it as an oracle to confirm a roster ID exists; the
          // internal "reason" still distinguishes them in the audit log.
          const notFound = () =>
            fail(
              "BAD_REQUEST",
              "Student ID or batch not found in the university roster",
              row ? "batch" : "roster",
            );
          if (!row) return notFound();
          if (row.number !== input.batchNumber) return notFound();
          graduationYear = row.graduationYear;
          status = "ACTIVE";
        } else {
          status = "PENDING";
        }
        const role = roleFor({ graduationYear });

        // Clear any *stale* unverified account squatting on this email or ID
        // (e.g. an attacker who started sign-up with the victim's roster ID
        // and email but never verified, past the 15-minute grace period
        // checked above). It never logged in, so nothing of value is lost;
        // session/account rows cascade with it.
        await tx
          .delete(user)
          .where(
            and(
              eq(user.emailVerified, false),
              lt(user.createdAt, unverifiedGraceCutoff),
              or(eq(user.email, input.email), eq(user.studentIdHash, idHash)),
            ),
          );

        const values = {
          ...BLANK_PENDING,
          email: input.email,
          universityId: uni.id,
          batchNumber: input.batchNumber,
          graduationYear,
          department: input.department,
          studentIdHash: idHash,
          role,
          status,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        };
        await tx
          .insert(pendingSignup)
          .values(values)
          .onConflictDoUpdate({ target: pendingSignup.email, set: values });
        await audit(
          tx,
          uni.id,
          null,
          "signup.attempt",
          input.email,
          { ok: true, idHashPrefix: idHash.slice(0, 12) },
          ctx.ip,
        );
        return { role, status };
      });

      if ("error" in outcome) throw outcome.error;
      return outcome;
    }),
});
