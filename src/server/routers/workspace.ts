import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { attachment, batch, report, university, user } from "@/db/schema";
import { remove } from "../storage";
import {
  adminProcedure,
  audit,
  isAdmin,
  modProcedure,
  ownerProcedure,
  router,
} from "../trpc";
import { transferOwner } from "../university";
import { clearStaleUnverified } from "./auth";

const CARD_TTL_MS = 30 * 86_400_000;

const count = async (q: Promise<{ c: number }[]>) =>
  Number((await q)[0]?.c ?? 0);

const removeAll = (keys: string[]) =>
  Promise.all(keys.map((k) => remove(k).catch(() => {})));

/** Pending, email-verified student sign-ups in this university. */
const pendingStudents = (universityId: string): SQL =>
  and(
    eq(user.universityId, universityId),
    eq(user.status, "PENDING"),
    eq(user.emailVerified, true),
    inArray(user.role, ["STUDENT", "ALUMNUS"]),
  ) as SQL;

/** The single-item approve/reject code path; shared by `decide` and the bulk mutations below. */
async function decideOne(
  tx: Tx,
  universityId: string,
  actorId: string,
  userId: string,
  action: "approve" | "reject",
): Promise<boolean> {
  // A platform-banned account is the platform's to decide.
  const target = and(
    eq(user.id, userId),
    pendingStudents(universityId),
    eq(user.platformBanned, false),
  );
  const [row] = await tx
    .select({ id: user.id, email: user.email, key: user.idCardKey })
    .from(user)
    .where(target)
    .for("update");
  if (!row) return false;
  if (action === "approve") {
    await tx
      .update(user)
      .set({ status: "ACTIVE", decidedAt: new Date() })
      .where(target);
  } else {
    // Sessions/accounts cascade; the person can sign up again.
    await tx.delete(user).where(target);
  }
  await audit(tx, universityId, actorId, `user.${action}`, row.id, {
    email: row.email,
  });
  if (action === "reject" && row.key) await removeAll([row.key]);
  return true;
}

async function decideMany(
  ctx: { db: Tx; me: { id: string; universityId: string } },
  userIds: string[],
  action: "approve" | "reject",
) {
  const processed: string[] = [];
  const skipped: string[] = [];
  for (const id of new Set(userIds)) {
    const ok = await decideOne(
      ctx.db,
      ctx.me.universityId,
      ctx.me.id,
      id,
      action,
    );
    (ok ? processed : skipped).push(id);
  }
  return { processed, skipped };
}

/**
 * STUDENT -> ALUMNUS for everyone in a batch whose new graduation year has
 * passed; staff roles are never touched. One-way, like every other
 * promotion: an already-ALUMNUS member never reverts to STUDENT, even if the
 * batch's year is edited back into the future.
 */
async function syncBatchMembers(
  tx: Tx,
  universityId: string,
  fromNumber: number,
  to: { number: number; graduationYear: number },
) {
  await tx
    .update(user)
    .set({
      batchNumber: to.number,
      graduationYear: to.graduationYear,
      role: sql`case when ${user.role} = 'ALUMNUS' or ${to.graduationYear} < extract(year from now()) then 'ALUMNUS' else 'STUDENT' end`,
    })
    .where(
      and(
        eq(user.universityId, universityId),
        eq(user.batchNumber, fromNumber),
        inArray(user.role, ["STUDENT", "ALUMNUS"]),
      ),
    );
}

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string }).code === "23505" ||
  (e as { cause?: { code?: string } }).cause?.code === "23505";

export const workspaceRouter = router({
  /** Sidebar badges. Approvals are admin-only, so moderators get 0. */
  counts: modProcedure.query(async ({ ctx }) => ({
    approvals: isAdmin(ctx.me.role)
      ? await count(
          ctx.db
            .select({ c: sql<number>`count(*)` })
            .from(user)
            .where(pendingStudents(ctx.me.universityId)),
        )
      : 0,
    reports: await count(
      ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(report)
        .where(eq(report.status, "OPEN")),
    ),
  })),

  batches: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: batch.id,
        number: batch.number,
        graduationYear: batch.graduationYear,
        rosterCount: sql<number>`(select count(*) from roster_entry r where r.batch_id = "batch"."id")`,
        members: sql<number>`(select count(*) from "user" u where u.university_id = "batch"."university_id" and u.batch_number = "batch"."number" and u.status <> 'PENDING')`,
      })
      .from(batch)
      .orderBy(asc(batch.number));
    return rows.map((r) => ({
      ...r,
      rosterCount: Number(r.rosterCount),
      members: Number(r.members),
    }));
  }),

  saveBatch: adminProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        number: z.number().int().min(1).max(9999),
        graduationYear: z.number().int().min(1950).max(2100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      const [clash] = await ctx.db
        .select({ id: batch.id })
        .from(batch)
        .where(
          and(
            eq(batch.number, input.number),
            input.id ? ne(batch.id, input.id) : undefined,
          ),
        );
      const conflict = () =>
        new TRPCError({
          code: "CONFLICT",
          message: `Batch ${input.number} already exists`,
        });
      if (clash) throw conflict();

      let id = input.id;
      try {
        if (input.id) {
          const [old] = await ctx.db
            .select({ number: batch.number })
            .from(batch)
            .where(and(eq(batch.id, input.id), eq(batch.universityId, uni)));
          if (!old) throw new TRPCError({ code: "NOT_FOUND" });
          await ctx.db
            .update(batch)
            .set({ number: input.number, graduationYear: input.graduationYear })
            .where(and(eq(batch.id, input.id), eq(batch.universityId, uni)));
          await syncBatchMembers(ctx.db, uni, old.number, input);
        } else {
          [{ id }] = await ctx.db
            .insert(batch)
            .values({
              universityId: uni,
              number: input.number,
              graduationYear: input.graduationYear,
            })
            .returning({ id: batch.id });
          // Students who typed this batch at sign-up before it existed.
          await syncBatchMembers(ctx.db, uni, input.number, input);
        }
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict();
        throw e;
      }
      await audit(ctx.db, uni, ctx.me.id, "batch.save", id, {
        number: input.number,
        graduationYear: input.graduationYear,
      });
      return { id: id as string };
    }),

  deleteBatch: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      const [b] = await ctx.db
        .select({ number: batch.number })
        .from(batch)
        .where(and(eq(batch.id, input.id), eq(batch.universityId, uni)));
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });
      const members = await count(
        ctx.db
          .select({ c: sql<number>`count(*)` })
          .from(user)
          .where(
            and(eq(user.universityId, uni), eq(user.batchNumber, b.number)),
          ),
      );
      if (members > 0)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This batch has members; it can't be deleted",
        });
      // Roster rows cascade with the batch.
      await ctx.db
        .delete(batch)
        .where(and(eq(batch.id, input.id), eq(batch.universityId, uni)));
      await audit(ctx.db, uni, ctx.me.id, "batch.delete", input.id, {
        number: b.number,
      });
      return { ok: true as const };
    }),

  approvals: adminProcedure.query(async ({ ctx }) => {
    const uni = ctx.me.universityId;
    // Lazy purge (no cron): ID card photos go 30 days after the decision.
    const expired = await ctx.db
      .select({ id: user.id, key: user.idCardKey })
      .from(user)
      .where(
        and(
          eq(user.universityId, uni),
          isNotNull(user.idCardKey),
          lt(user.decidedAt, new Date(Date.now() - CARD_TTL_MS)),
        ),
      )
      .limit(100)
      .for("update");
    if (expired.length) {
      // Only rows whose object is really gone drop the key; failures stay
      // referenced so the next purge retries them.
      // ponytail: objects go before commit; a rolled-back tx leaves a row pointing at a gone card (404, harmless).
      const results = await Promise.allSettled(
        expired.map((e) => remove(e.key as string)),
      );
      const done = expired.filter((_, i) => results[i].status === "fulfilled");
      if (done.length)
        await ctx.db
          .update(user)
          .set({ idCardKey: null })
          .where(
            and(
              eq(user.universityId, uni),
              inArray(
                user.id,
                done.map((e) => e.id),
              ),
            ),
          );
    }
    // Same lazy purge, for sign-ups that never got past OTP at all: they
    // never enter this list (pendingStudents requires emailVerified), so
    // the purge above never sees their card either. Treat "never verified
    // in 30 days" the same as "decided 30 days ago".
    await removeAll(
      await clearStaleUnverified(
        ctx.db,
        and(
          eq(user.universityId, uni),
          inArray(user.role, ["STUDENT", "ALUMNUS"]),
          lt(user.createdAt, new Date(Date.now() - CARD_TTL_MS)),
        ) as SQL,
        uni,
      ),
    );
    return ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        batchNumber: user.batchNumber,
        graduationYear: user.graduationYear,
        department: user.department,
        studentIdHint: user.studentIdHint,
        rosterMatch: user.rosterMatch,
        hasIdCard: sql<boolean>`${user.idCardKey} is not null`,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(pendingStudents(uni))
      .orderBy(asc(user.createdAt));
  }),

  decide: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        action: z.enum(["approve", "reject"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await decideOne(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        input.userId,
        input.action,
      );
      if (!ok)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No pending account",
        });
      return { ok: true as const };
    }),

  // Same validations and audit trail as `decide`, just over a list. Each id
  // is independent (a bad one is skipped, not a reason to fail the rest) —
  // they all still land in the one transaction the request runs in.
  approveMany: adminProcedure
    .input(z.object({ userIds: z.array(z.string().min(1)).min(1).max(100) }))
    .mutation(async ({ ctx, input }) =>
      decideMany(ctx, input.userIds, "approve"),
    ),

  rejectMany: adminProcedure
    .input(z.object({ userIds: z.array(z.string().min(1)).min(1).max(100) }))
    .mutation(async ({ ctx, input }) =>
      decideMany(ctx, input.userIds, "reject"),
    ),

  transferOwnership: ownerProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      if (input.userId === ctx.me.id)
        throw new TRPCError({ code: "BAD_REQUEST" });
      const from = await transferOwner(ctx.db, uni, input.userId, ctx.me.id);
      await audit(ctx.db, uni, ctx.me.id, "owner.transfer", input.userId, {
        from,
      });
      return { ok: true as const };
    }),

  settings: ownerProcedure.query(async ({ ctx }) => {
    const [u] = await ctx.db
      .select({
        name: university.name,
        website: university.website,
        logoKey: university.logoKey,
        status: university.status,
      })
      .from(university)
      .where(eq(university.id, ctx.me.universityId));
    return u;
  }),

  updateSettings: ownerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        // Omitted keeps the current value; "" or null clears it.
        website: z
          .union([z.literal(""), z.string().url().max(200)])
          .nullable()
          .optional(),
        logoKey: z.string().max(300).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      if (input.logoKey) {
        // Only a confirmed logo upload of this university.
        const [att] = await ctx.db
          .select({ id: attachment.id })
          .from(attachment)
          .where(
            and(
              eq(attachment.objectKey, input.logoKey),
              eq(attachment.universityId, uni),
            ),
          );
        if (!att || !input.logoKey.startsWith(`${uni}/logo/f/`))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Upload not found",
          });
      }
      const [cur] = await ctx.db
        .select({ logoKey: university.logoKey })
        .from(university)
        .where(eq(university.id, uni))
        .for("update");
      await ctx.db
        .update(university)
        .set({
          name: input.name,
          ...(input.website !== undefined && {
            website: input.website || null,
          }),
          ...(input.logoKey !== undefined && { logoKey: input.logoKey }),
        })
        .where(eq(university.id, uni));
      // A replaced or removed logo is gone for good: row and object.
      const old = cur?.logoKey;
      if (input.logoKey !== undefined && old && old !== input.logoKey) {
        await ctx.db
          .delete(attachment)
          .where(
            and(
              eq(attachment.objectKey, old),
              eq(attachment.universityId, uni),
            ),
          );
        await removeAll([old]);
      }
      await audit(ctx.db, uni, ctx.me.id, "settings.update", uni, {
        name: input.name,
      });
      return { ok: true as const };
    }),
});
