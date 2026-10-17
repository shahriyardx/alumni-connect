import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db, type Tx, withTenant } from "@/db";
import {
  broadcast,
  comment,
  invite,
  platformAdmin,
  platformAudit,
  post,
  ROLES,
  type Role,
  session,
  UNIVERSITY_STATUSES,
  type UniversityStatus,
  university,
  user,
} from "@/db/schema";
import { env } from "@/env";
import { publish } from "../events";
import {
  hashInviteToken,
  INVITE_TTL_MS,
  newInviteToken,
} from "../invite-token";
import { sendMail } from "../mail";
import { envPlatformAdmins, lockPlatformAdmin } from "../super-admin";
import { audit, platformProcedure, router } from "../trpc";
import { insertUniversity, transferOwner } from "../university";
import { escapeLike } from "./admin";

export const optionalUrl = z
  .union([z.literal(""), z.string().url().max(200)])
  .optional()
  .transform((v) => v || null);

const uniInput = z.object({ universityId: z.string().uuid() });

async function logPlatform(
  tx: Tx | typeof db,
  actorId: string,
  action: string,
  target: string | null,
  meta: Record<string, unknown>,
  ip: string,
) {
  await tx.insert(platformAudit).values({ actorId, action, target, meta, ip });
}

async function getUniversity(universityId: string) {
  const [uni] = await db
    .select()
    .from(university)
    .where(eq(university.id, universityId));
  if (!uni) throw new TRPCError({ code: "NOT_FOUND" });
  return uni;
}

async function pendingUniversity(universityId: string) {
  const uni = await getUniversity(universityId);
  if (uni.status !== "PENDING")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Application already decided",
    });
  return uni;
}

/** from → to; the status guard makes concurrent decisions fail cleanly. */
async function setStatus(
  tx: Tx,
  id: string,
  from: UniversityStatus,
  to: UniversityStatus,
  message: string,
) {
  const [row] = await tx
    .update(university)
    .set({ status: to })
    .where(and(eq(university.id, id), eq(university.status, from)))
    .returning({ id: university.id });
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Env-listed, or holds a platform_admin row (verified or not). */
const adminFilter = () =>
  or(
    envPlatformAdmins.size
      ? inArray(sql`lower(${user.email})`, [...envPlatformAdmins])
      : sql`false`,
    sql`exists (select 1 from platform_admin pa where pa.user_id = ${user.id})`,
  );

const roleCounts = (rows: { role: Role; n: number }[]) => {
  const out = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<
    Role,
    number
  >;
  for (const r of rows) out[r.role] = Number(r.n);
  return out;
};

const ownerJson = sql<{
  name: string;
  email: string;
  verified: boolean;
} | null>`(select json_build_object('name', o.name, 'email', o.email, 'verified', o.email_verified) from "user" o where o.university_id = ${university.id} and o.role = 'OWNER' order by o.email_verified desc, o.created_at limit 1)`;

export const platformRouter = router({
  overview: platformProcedure.query(async () => {
    const byStatus = await db
      .select({ status: university.status, n: count() })
      .from(university)
      .groupBy(university.status);
    const universities = Object.fromEntries(
      UNIVERSITY_STATUSES.map((s) => [s, 0]),
    ) as Record<UniversityStatus, number>;
    for (const r of byStatus) universities[r.status] = r.n;

    const users = roleCounts(
      await db
        .select({ role: user.role, n: count() })
        .from(user)
        .where(isNotNull(user.universityId))
        .groupBy(user.role),
    );
    // Cross-tenant counts only: a SECURITY DEFINER function (migration 0011)
    // so app_user never reads tenant rows outside RLS.
    const [content] = await db.execute<{ posts: string; comments: string }>(
      sql`select * from platform_content_counts()`,
    );
    const days = await db.execute<{ day: string; n: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day,
        (select count(*)::int from "user" u
          where u.university_id is not null
            and u.created_at >= d and u.created_at < d + interval '1 day') as n
      from generate_series(current_date - 29, current_date, interval '1 day') d
      order by d`);
    const signupsPerDay = days.map((d) => ({ day: d.day, n: Number(d.n) }));
    const sum = (k: number) =>
      signupsPerDay.slice(-k).reduce((n, d) => n + d.n, 0);
    return {
      universities,
      users,
      posts: Number(content?.posts ?? 0),
      comments: Number(content?.comments ?? 0),
      pendingApplications: universities.PENDING,
      signups7: sum(7),
      signups30: sum(30),
      signupsPerDay,
    };
  }),

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
          owner: ownerJson,
        })
        .from(university)
        .leftJoin(members, eq(members.universityId, university.id))
        .where(input.status ? eq(university.status, input.status) : undefined)
        .orderBy(desc(university.createdAt));
      return rows;
    }),

  university: platformProcedure.input(uniInput).query(async ({ input }) => {
    const uni = await getUniversity(input.universityId);
    const [owner] = await db
      .select({
        name: user.name,
        email: user.email,
        verified: user.emailVerified,
      })
      .from(user)
      .where(and(eq(user.universityId, uni.id), eq(user.role, "OWNER")))
      .orderBy(desc(user.emailVerified), user.createdAt)
      .limit(1);
    const members = roleCounts(
      await db
        .select({ role: user.role, n: count() })
        .from(user)
        .where(eq(user.universityId, uni.id))
        .groupBy(user.role),
    );
    const activity = await withTenant(uni.id, async (tx) => {
      const [p] = await tx
        .select({ n: count(), last: sql<Date | null>`max(${post.createdAt})` })
        .from(post)
        .where(isNull(post.deletedAt));
      const [c] = await tx
        .select({ last: sql<Date | null>`max(${comment.createdAt})` })
        .from(comment);
      return { posts: p.n, last: [p.last, c.last] };
    });
    const last = activity.last
      .filter((d): d is Date => !!d)
      .map((d) => new Date(d))
      .sort((a, b) => +b - +a)[0];
    return {
      id: uni.id,
      name: uni.name,
      status: uni.status,
      website: uni.website,
      hasLogo: !!uni.logoKey,
      createdAt: uni.createdAt,
      owner: owner ?? null,
      members,
      posts: activity.posts,
      lastActivity: last ?? null,
    };
  }),

  approve: platformProcedure
    .input(uniInput)
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
        await setStatus(
          tx,
          uni.id,
          "PENDING",
          "ACTIVE",
          "Application already decided",
        );
        const meta = { name: uni.name };
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.approve",
          uni.id,
          meta,
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          "university.approve",
          uni.id,
          meta,
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  reject: platformProcedure.input(uniInput).mutation(async ({ ctx, input }) => {
    const uni = await pendingUniversity(input.universityId);
    await withTenant(uni.id, async (tx) => {
      await setStatus(
        tx,
        uni.id,
        "PENDING",
        "REJECTED",
        "Application already decided",
      );
      // The owner keeps their account — they're blocked from every
      // university-scoped route by the REJECTED status, not deleted.
      const meta = { name: uni.name };
      await audit(
        tx,
        uni.id,
        ctx.me.id,
        "university.reject",
        uni.id,
        meta,
        ctx.ip,
      );
      await logPlatform(
        tx,
        ctx.me.id,
        "university.reject",
        uni.id,
        meta,
        ctx.ip,
      );
    });
    return { ok: true };
  }),

  /** ACTIVE → SUSPENDED: members are blocked like REJECTED; hidden from sign-up. */
  suspend: platformProcedure
    .input(uniInput)
    .mutation(async ({ ctx, input }) => {
      const uni = await getUniversity(input.universityId);
      const [admin] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.universityId, uni.id), adminFilter()))
        .limit(1);
      if (admin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A platform admin belongs to this university",
        });
      await withTenant(uni.id, async (tx) => {
        await setStatus(
          tx,
          uni.id,
          "ACTIVE",
          "SUSPENDED",
          "Only an active university can be suspended",
        );
        const meta = { name: uni.name };
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.suspend",
          uni.id,
          meta,
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          "university.suspend",
          uni.id,
          meta,
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  reactivate: platformProcedure
    .input(uniInput)
    .mutation(async ({ ctx, input }) => {
      const uni = await getUniversity(input.universityId);
      await withTenant(uni.id, async (tx) => {
        await setStatus(
          tx,
          uni.id,
          "SUSPENDED",
          "ACTIVE",
          "Only a suspended university can be reactivated",
        );
        const meta = { name: uni.name };
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.reactivate",
          uni.id,
          meta,
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          "university.reactivate",
          uni.id,
          meta,
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  transferOwnership: platformProcedure
    .input(uniInput.extend({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const uni = await getUniversity(input.universityId);
      await withTenant(uni.id, async (tx) => {
        const from = await transferOwner(tx, uni.id, input.userId);
        const meta = { name: uni.name, from };
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "owner.transfer",
          input.userId,
          meta,
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          "owner.transfer",
          input.userId,
          { ...meta, universityId: uni.id },
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
      const token = newInviteToken();
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
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
        const meta = { name: uni.name, ownerEmail: input.ownerEmail };
        await audit(
          tx,
          uni.id,
          ctx.me.id,
          "university.create",
          uni.id,
          meta,
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          "university.create",
          uni.id,
          meta,
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

  /** Search across every university (or one, for the owner picker). */
  users: platformProcedure
    .input(
      z.object({
        q: z.string().trim().max(100).default(""),
        universityId: z.string().uuid().optional(),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const limit = 50;
      const needle = `%${escapeLike(input.q)}%`;
      const rows = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          verified: user.emailVerified,
          createdAt: user.createdAt,
          universityId: user.universityId,
          universityName: university.name,
          isPlatformAdmin: sql<boolean>`${adminFilter()}`,
        })
        .from(user)
        .leftJoin(university, eq(university.id, user.universityId))
        .where(
          and(
            input.q
              ? or(ilike(user.name, needle), ilike(user.email, needle))
              : undefined,
            input.universityId
              ? eq(user.universityId, input.universityId)
              : undefined,
          ),
        )
        .orderBy(desc(user.createdAt))
        .limit(limit + 1)
        .offset(input.cursor);
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? input.cursor + limit : null,
      };
    }),

  setBanned: platformProcedure
    .input(z.object({ userId: z.string().min(1), banned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await db
        .select({
          id: user.id,
          email: user.email,
          status: user.status,
          universityId: user.universityId,
          isAdmin: sql<boolean>`${adminFilter()}`,
        })
        .from(user)
        .where(eq(user.id, input.userId));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      // A university-less account is a (possibly stale) super admin claim.
      if (target.isAdmin || !target.universityId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Platform admins can't be banned",
        });
      if (input.banned === (target.status === "BANNED"))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: input.banned ? "Already banned" : "Not banned",
        });
      const status = input.banned ? "BANNED" : "ACTIVE";
      await withTenant(target.universityId, async (tx) => {
        await tx
          .update(user)
          .set({ status, suspendedUntil: null })
          .where(eq(user.id, target.id));
        if (input.banned)
          await tx.delete(session).where(eq(session.userId, target.id));
        await audit(
          tx,
          target.universityId as string,
          ctx.me.id,
          "user.status",
          target.id,
          { status, by: "platform" },
          ctx.ip,
        );
        await logPlatform(
          tx,
          ctx.me.id,
          input.banned ? "user.ban" : "user.unban",
          target.id,
          { email: target.email },
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  audit: platformProcedure
    .input(
      z.object({
        action: z.string().min(1).max(100).optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const limit = 50;
      const rows = await db
        .select({
          id: platformAudit.id,
          action: platformAudit.action,
          target: platformAudit.target,
          meta: platformAudit.meta,
          ip: platformAudit.ip,
          createdAt: platformAudit.createdAt,
          actorName: user.name,
          actorEmail: user.email,
        })
        .from(platformAudit)
        .leftJoin(user, eq(user.id, platformAudit.actorId))
        .where(
          and(
            input.action ? eq(platformAudit.action, input.action) : undefined,
            input.from ? gte(platformAudit.createdAt, input.from) : undefined,
            input.to ? lt(platformAudit.createdAt, input.to) : undefined,
          ),
        )
        .orderBy(desc(platformAudit.createdAt))
        .limit(limit + 1)
        .offset(input.cursor);
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? input.cursor + limit : null,
      };
    }),

  admins: platformProcedure.query(async () => {
    const rows = await db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        verified: user.emailVerified,
        createdAt: platformAdmin.createdAt,
      })
      .from(platformAdmin)
      .innerJoin(user, eq(user.id, platformAdmin.userId))
      .orderBy(platformAdmin.createdAt);
    const envUsers = envPlatformAdmins.size
      ? await db
          .select({
            userId: user.id,
            name: user.name,
            email: user.email,
            verified: user.emailVerified,
          })
          .from(user)
          .where(inArray(sql`lower(${user.email})`, [...envPlatformAdmins]))
      : [];
    const fromEnv = [...envPlatformAdmins].map((email) => {
      const u = envUsers.find((x) => x.email.toLowerCase() === email);
      return {
        userId: u?.userId ?? null,
        name: u?.name ?? null,
        email,
        verified: u?.verified ?? false,
        createdAt: null,
        fromEnv: true,
      };
    });
    return [
      ...fromEnv,
      ...rows
        .filter((r) => !envPlatformAdmins.has(r.email.toLowerCase()))
        .map((r) => ({ ...r, fromEnv: false })),
    ];
  }),

  addAdmin: platformProcedure
    .input(
      z.object({
        email: z
          .string()
          .trim()
          .email()
          .max(200)
          .transform((e) => e.toLowerCase()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [target] = await db
        .select({ id: user.id, isAdmin: sql<boolean>`${adminFilter()}` })
        .from(user)
        .where(and(eq(user.email, input.email), eq(user.emailVerified, true)));
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No verified account with that email",
        });
      if (target.isAdmin)
        throw new TRPCError({ code: "CONFLICT", message: "Already an admin" });
      await db.transaction(async (tx) => {
        await tx
          .insert(platformAdmin)
          .values({ userId: target.id })
          .onConflictDoNothing();
        await logPlatform(
          tx,
          ctx.me.id,
          "admin.add",
          target.id,
          { email: input.email },
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  removeAdmin: platformProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.me.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't remove yourself",
        });
      await db.transaction(async (tx) => {
        await lockPlatformAdmin(tx);
        const [target] = await tx
          .select({ email: user.email })
          .from(platformAdmin)
          .innerJoin(user, eq(user.id, platformAdmin.userId))
          .where(eq(platformAdmin.userId, input.userId));
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        if (envPlatformAdmins.has(target.email.toLowerCase()))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Listed in .env — remove it there",
          });
        // Verified admins left after this removal (rows + env accounts).
        const [left] = await tx
          .select({ n: count() })
          .from(user)
          .where(
            and(
              eq(user.emailVerified, true),
              adminFilter(),
              sql`${user.id} <> ${input.userId}`,
            ),
          );
        if (left.n === 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Can't remove the last admin",
          });
        await tx
          .delete(platformAdmin)
          .where(eq(platformAdmin.userId, input.userId));
        await logPlatform(
          tx,
          ctx.me.id,
          "admin.remove",
          input.userId,
          { email: target.email },
          ctx.ip,
        );
      });
      return { ok: true };
    }),

  /** One notification per ACTIVE, verified member of every ACTIVE university. */
  broadcast: platformProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(120),
        body: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [b] = await tx
          .insert(broadcast)
          .values({ ...input, actorId: ctx.me.id })
          .returning({ id: broadcast.id });
        // Cross-tenant INSERT..SELECT: SECURITY DEFINER (migration 0011).
        const [{ n }] = await tx.execute<{ n: number }>(
          sql`select platform_broadcast(${b.id}) as n`,
        );
        await tx
          .update(broadcast)
          .set({ recipients: n })
          .where(eq(broadcast.id, b.id));
        const unis = await tx
          .select({ id: university.id })
          .from(university)
          .where(eq(university.status, "ACTIVE"));
        // No userId: everyone in that university refetches notifications.
        for (const u of unis)
          await publish(tx, { universityId: u.id, kind: "notification" });
        await logPlatform(
          tx,
          ctx.me.id,
          "broadcast.send",
          b.id,
          { title: input.title, recipients: n },
          ctx.ip,
        );
        return { recipients: n };
      });
    }),

  broadcasts: platformProcedure.query(() =>
    db
      .select({
        id: broadcast.id,
        title: broadcast.title,
        body: broadcast.body,
        recipients: broadcast.recipients,
        createdAt: broadcast.createdAt,
        actorName: user.name,
      })
      .from(broadcast)
      .leftJoin(user, eq(user.id, broadcast.actorId))
      .orderBy(desc(broadcast.createdAt))
      .limit(50),
  ),
});
