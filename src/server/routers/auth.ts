import { TRPCError } from "@trpc/server";
import { and, count, eq, gt, or, type SQL, sql } from "drizzle-orm";
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

const year = new Date().getFullYear();

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
          .max(year + 8),
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
        if (
          (await recent(eq(auditLog.ip, ctx.ip))) >= 10 ||
          (await recent(
            sql`${auditLog.meta}->>'idHashPrefix' = ${idHash.slice(0, 12)}`,
          )) >= 5
        ) {
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
        const [dup] = await tx
          .select({ id: user.id })
          .from(user)
          .where(
            or(eq(user.email, input.email), eq(user.studentIdHash, idHash)),
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
          if (!row)
            return fail(
              "BAD_REQUEST",
              "Student ID not found in the university roster",
              "roster",
            );
          if (row.batchYear !== input.batchYear)
            return fail(
              "BAD_REQUEST",
              "Batch year does not match university records",
              "batch",
            );
          role = roleFor({
            graduated: row.graduated,
            batchYear: input.batchYear,
          });
          status = "ACTIVE";
        } else {
          role = roleFor({ graduated: null, batchYear: input.batchYear });
          status = "PENDING";
        }

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
