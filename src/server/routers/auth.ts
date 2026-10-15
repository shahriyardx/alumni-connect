import { TRPCError } from "@trpc/server";
import { and, count, eq, gt, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import {
  auditLog,
  pendingSignup,
  rosterEntry,
  university,
  user,
} from "@/db/schema";
import { hashStudentId, roleFor } from "../student-id";
import { audit, publicProcedure, router } from "../trpc";

export const authRouter = router({
  universities: publicProcedure.query(() =>
    db
      .select({
        id: university.id,
        name: university.name,
        emailDomain: university.emailDomain,
      })
      .from(university)
      .orderBy(university.name),
  ),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
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
    return row ?? null;
  }),

  startSignup: publicProcedure
    .input(
      z.object({
        universityId: z.string().uuid(),
        email: z
          .string()
          .email()
          .max(200)
          .transform((e) => e.toLowerCase()),
        studentId: z.string().min(3).max(40),
        batchYear: z
          .number()
          .int()
          .min(1990)
          .refine((y) => y <= new Date().getFullYear() + 8, {
            message: "Invalid batch year",
          }),
        department: z.string().min(2).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [uni] = await db
        .select()
        .from(university)
        .where(eq(university.id, input.universityId));
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

        if (input.email.split("@")[1] !== uni.emailDomain.toLowerCase()) {
          return fail(
            "BAD_REQUEST",
            `Use your institutional email domain (@${uni.emailDomain})`,
            "domain",
          );
        }
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
        let role: "STUDENT" | "ALUMNUS";
        let status: "ACTIVE" | "PENDING";
        if (rosterSize > 0) {
          const [row] = await tx
            .select()
            .from(rosterEntry)
            .where(eq(rosterEntry.studentIdHash, idHash));
          // Same external message for both failure modes so an attacker
          // can't use it as an oracle to confirm a roster ID exists; the
          // internal "reason" still distinguishes them in the audit log.
          const notFound = () =>
            fail(
              "BAD_REQUEST",
              "Student ID or batch year not found in the university roster",
              row ? "batch" : "roster",
            );
          if (!row) return notFound();
          if (row.batchYear !== input.batchYear) return notFound();
          role = roleFor({
            graduated: row.graduated,
            batchYear: input.batchYear,
          });
          status = "ACTIVE";
        } else {
          role = roleFor({ graduated: null, batchYear: input.batchYear });
          status = "PENDING";
        }

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
          email: input.email,
          universityId: uni.id,
          batchYear: input.batchYear,
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
