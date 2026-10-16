import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import {
  invite,
  pendingSignup,
  UNIVERSITY_STATUSES,
  university,
  user,
} from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "../mail";
import { audit, platformProcedure, router } from "../trpc";

/** Slug from a name; random suffix when taken (the unique index is the backstop). */
export async function uniqueSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "university";
  const [taken] = await db
    .select({ id: university.id })
    .from(university)
    .where(eq(university.slug, base));
  return taken ? `${base}-${randomBytes(3).toString("hex")}` : base;
}

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
          ownerName: sql<
            string | null
          >`(select name from "user" o where o.university_id = ${university.id} and o.role = 'OWNER' order by o.created_at limit 1)`,
          ownerEmail: sql<
            string | null
          >`(select email from "user" o where o.university_id = ${university.id} and o.role = 'OWNER' order by o.created_at limit 1)`,
        })
        .from(university)
        .leftJoin(members, eq(members.universityId, university.id))
        .where(input.status ? eq(university.status, input.status) : undefined)
        .orderBy(desc(university.createdAt));
      return rows.map(({ ownerName, ownerEmail, ...r }) => ({
        ...r,
        owner:
          ownerEmail !== null
            ? { name: ownerName ?? "", email: ownerEmail }
            : null,
      }));
    }),

  approve: platformProcedure
    .input(z.object({ universityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const uni = await pendingUniversity(input.universityId);
      await withTenant(uni.id, async (tx) => {
        await tx
          .update(university)
          .set({ status: "ACTIVE" })
          .where(eq(university.id, uni.id));
        const owners = and(
          eq(user.universityId, uni.id),
          eq(user.role, "OWNER"),
        );
        await tx
          .update(user)
          .set({ status: "ACTIVE", decidedAt: new Date() })
          .where(owners);
        // A rep still mid-sign-up lands ACTIVE when they finish.
        await tx
          .update(pendingSignup)
          .set({ status: "ACTIVE" })
          .where(
            and(
              eq(pendingSignup.universityId, uni.id),
              eq(pendingSignup.role, "OWNER"),
            ),
          );
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
        await tx
          .update(university)
          .set({ status: "REJECTED" })
          .where(eq(university.id, uni.id));
        await tx
          .delete(user)
          .where(and(eq(user.universityId, uni.id), eq(user.role, "OWNER")));
        await tx
          .delete(pendingSignup)
          .where(eq(pendingSignup.universityId, uni.id));
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
      const slug = await uniqueSlug(input.name);
      const id = randomUUID();
      const uni = await withTenant(id, async (tx) => {
        const [uni] = await tx
          .insert(university)
          .values({ id, name: input.name, slug, website: input.website })
          .returning();
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
