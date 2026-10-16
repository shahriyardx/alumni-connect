import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx, withTenant } from "@/db";
import { invite, UNIVERSITY_STATUSES, university, user } from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "../mail";
import { audit, platformProcedure, router } from "../trpc";
import { insertUniversity } from "../university";

export const optionalUrl = z
  .union([z.literal(""), z.string().url().max(200)])
  .optional()
  .transform((v) => v || null);

async function pendingUniversity(universityId: string) {
  const [uni] = await db
    .select()
    .from(university)
    .where(eq(university.id, universityId));
  if (!uni) throw new TRPCError({ code: "NOT_FOUND" });
  if (uni.status !== "PENDING")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Application already decided",
    });
  return uni;
}

/** PENDING → decided; the status guard makes concurrent decisions fail cleanly. */
async function decide(tx: Tx, id: string, status: "ACTIVE" | "REJECTED") {
  const [row] = await tx
    .update(university)
    .set({ status })
    .where(and(eq(university.id, id), eq(university.status, "PENDING")))
    .returning({ id: university.id });
  if (!row)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Application already decided",
    });
}

export const platformRouter = router({
  universities: platformProcedure
    .input(z.object({ status: z.enum(UNIVERSITY_STATUSES).optional() }))
    .query(async ({ input }) => {
      const members = db
        .select({ universityId: user.universityId, n: count().as("n") })
        .from(user)
        .groupBy(user.universityId)
        .as("members");
      const rows = await db
        .select({
          id: university.id,
          name: university.name,
          slug: university.slug,
          status: university.status,
          website: university.website,
          createdAt: university.createdAt,
          members: sql<number>`coalesce(${members.n}, 0)::int`,
          owner: sql<{
            name: string;
            email: string;
            verified: boolean;
          } | null>`(select json_build_object('name', o.name, 'email', o.email, 'verified', o.email_verified) from "user" o where o.university_id = ${university.id} and o.role = 'OWNER' order by o.email_verified desc, o.created_at limit 1)`,
        })
        .from(university)
        .leftJoin(members, eq(members.universityId, university.id))
        .where(input.status ? eq(university.status, input.status) : undefined)
        .orderBy(desc(university.createdAt));
      return rows;
    }),

  approve: platformProcedure
    .input(z.object({ universityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const uni = await pendingUniversity(input.universityId);
      await withTenant(uni.id, async (tx) => {
        // The owner is already ACTIVE (set on sign-up) — only the
        // university's own status is a decision here.
        const owners = await tx
          .select({ verified: user.emailVerified })
          .from(user)
          .where(and(eq(user.universityId, uni.id), eq(user.role, "OWNER")));
        if (owners.length === 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This application has no owner",
          });
        if (!owners.some((o) => o.verified))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Owner hasn't verified their email",
          });
        await decide(tx, uni.id, "ACTIVE");
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.approve",
          uni.id,
          {
            name: uni.name,
          },
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  reject: platformProcedure
    .input(z.object({ universityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const uni = await pendingUniversity(input.universityId);
      await withTenant(uni.id, async (tx) => {
        await decide(tx, uni.id, "REJECTED");
        // The owner keeps their account — they're blocked from every
        // university-scoped route by the REJECTED status, not deleted.
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.reject",
          uni.id,
          {
            name: uni.name,
          },
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  createUniversity: platformProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        website: optionalUrl,
        ownerEmail: z
          .string()
          .trim()
          .email()
          .max(200)
          .transform((e) => e.toLowerCase()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [taken] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.ownerEmail));
      if (taken)
        throw new TRPCError({
          code: "CONFLICT",
          message: "That email already has an account",
        });
      const token = randomBytes(32).toString("base64url");
      const id = randomUUID();
      const uni = await withTenant(id, async (tx) => {
        const uni = await insertUniversity(tx, {
          id,
          name: input.name,
          website: input.website,
        });
        await tx.insert(invite).values({
          universityId: uni.id,
          email: input.ownerEmail,
          role: "OWNER",
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        });
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.create",
          uni.id,
          {
            name: uni.name,
            ownerEmail: input.ownerEmail,
          },
          ctx.ip,
        );
        return uni;
      });
      const inviteUrl = `${env.BETTER_AUTH_URL}/invite/${token}`;
      await sendMail(
        input.ownerEmail,
        `You're invited to run ${uni.name} on Alumni Connect`,
        `You've been invited as the owner of ${uni.name}.\nAccept within 7 days: ${inviteUrl}`,
      );
      return { universityId: uni.id, inviteUrl };
    }),
});
