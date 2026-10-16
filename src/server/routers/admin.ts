import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  auditLog,
  batch,
  comment,
  post,
  ROLES,
  type Role,
  report,
  rosterEntry,
  user,
} from "@/db/schema";
import type { AuthorInfo } from "../queries/posts";
import { parseRosterCsv } from "../roster-csv";
import { hashStudentId } from "../student-id";
import { adminProcedure, audit, router } from "../trpc";

// Stay under Postgres's ~65535 bind-parameter limit on a single multi-row insert.
const IMPORT_CHUNK = 5000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Escape LIKE/ILIKE metacharacters so user search text is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** ISO-8601 week label ("2026-W42"), matching Postgres's `to_char(..., 'IYYY-"W"IW')`. */
function isoWeekKey(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const adminRouter = router({
  importRoster: adminProcedure
    // ponytail: interim — batch picked by number (created if missing; an existing batch keeps its year). W4 moves this to workspace batches.
    .input(
      z.object({
        csv: z.string().max(2_000_000),
        batchNumber: z.number().int().min(1).max(999),
        graduationYear: z.number().int().min(1950).max(2100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { rows, errors } = parseRosterCsv(input.csv);
      let inserted = 0;
      let updated = 0;
      const [{ id: batchId }] = await ctx.db
        .insert(batch)
        .values({
          universityId: ctx.me.universityId,
          number: input.batchNumber,
          graduationYear: input.graduationYear,
        })
        .onConflictDoUpdate({
          target: [batch.universityId, batch.number],
          set: { number: sql`excluded.number` },
        })
        .returning({ id: batch.id });

      for (const part of chunk(rows, IMPORT_CHUNK)) {
        const results = await ctx.db
          .insert(rosterEntry)
          .values(
            part.map((r) => ({
              universityId: ctx.me.universityId,
              batchId,
              studentIdHash: hashStudentId(ctx.me.universityId, r.studentId),
              department: r.department,
            })),
          )
          .onConflictDoUpdate({
            target: [rosterEntry.universityId, rosterEntry.studentIdHash],
            set: {
              batchId: sql`excluded.batch_id`,
              department: sql`excluded.department`,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        for (const r of results) {
          if (r.inserted) inserted++;
          else updated++;
        }
      }

      await audit(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        "roster.import",
        undefined,
        {
          batchNumber: input.batchNumber,
          inserted,
          updated,
          errors: errors.length,
        },
      );

      return { inserted, updated, errors };
    }),

  rosterStats: adminProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        total: sql<number>`count(*)`,
        graduated: sql<number>`count(*) filter (where ${batch.graduationYear} < extract(year from now()))`,
      })
      .from(rosterEntry)
      .innerJoin(batch, eq(batch.id, rosterEntry.batchId));
    return { total: Number(row.total), graduated: Number(row.graduated) };
  }),

  pendingUsers: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        batchNumber: user.batchNumber,
        graduationYear: user.graduationYear,
        department: user.department,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        and(
          eq(user.universityId, ctx.me.universityId),
          eq(user.status, "PENDING"),
          eq(user.emailVerified, true),
        ),
      )
      .orderBy(asc(user.createdAt));
  }),

  approveUser: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
            eq(user.status, "PENDING"),
          ),
        );
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No pending account",
        });
      }

      await ctx.db
        .update(user)
        .set({ status: "ACTIVE" })
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
            eq(user.status, "PENDING"),
          ),
        );

      await audit(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        "user.approve",
        input.userId,
      );
      return { ok: true as const };
    }),

  users: adminProcedure
    .input(
      z.object({
        q: z.string().min(1).max(200).optional(),
        role: z.enum(ROLES).optional(),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = 50;
      const conds = [eq(user.universityId, ctx.me.universityId)];
      if (input.role) conds.push(eq(user.role, input.role));
      if (input.q) {
        const needle = `%${escapeLike(input.q)}%`;
        const textMatch = or(
          ilike(user.name, needle),
          ilike(user.email, needle),
        );
        if (textMatch) conds.push(textMatch);
      }

      const rows = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          role: user.role,
          batchNumber: user.batchNumber,
          graduationYear: user.graduationYear,
          department: user.department,
          avatarKey: user.avatarKey,
          email: user.email,
          status: user.status,
          suspendedUntil: user.suspendedUntil,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(and(...conds))
        .orderBy(desc(user.createdAt))
        .limit(limit + 1)
        .offset(input.cursor);

      const items: (AuthorInfo & {
        email: string;
        status: string;
        createdAt: Date;
      })[] = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? input.cursor + limit : null,
      };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string().min(1), role: z.enum(ROLES) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.me.id)
        throw new TRPCError({ code: "BAD_REQUEST" });
      const [target] = await ctx.db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      // Ownership only moves via an explicit transfer (W4); nobody edits an OWNER here.
      if (input.role === "OWNER" || target.role === "OWNER")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Ownership can't be changed here",
        });

      await ctx.db
        .update(user)
        .set({ role: input.role })
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
          ),
        );

      await audit(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        "user.role",
        input.userId,
        {
          from: target.role,
          to: input.role,
        },
      );
      return { ok: true as const };
    }),

  audit: adminProcedure
    .input(
      z.object({
        action: z.string().min(1).max(100).optional(),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = 50;
      const conds = input.action ? [eq(auditLog.action, input.action)] : [];

      const rows = await ctx.db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          target: auditLog.target,
          ip: auditLog.ip,
          meta: auditLog.meta,
          createdAt: auditLog.createdAt,
          actorId: user.id,
          actorName: user.name,
        })
        .from(auditLog)
        .leftJoin(
          user,
          and(
            eq(user.id, auditLog.actorId),
            eq(user.universityId, ctx.me.universityId),
          ),
        )
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit + 1)
        .offset(input.cursor);

      const items = rows.slice(0, limit).map((r) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        ip: r.ip,
        meta: r.meta,
        createdAt: r.createdAt,
        actor: r.actorId
          ? { id: r.actorId, name: r.actorName as string }
          : null,
      }));
      return {
        items,
        nextCursor: rows.length > limit ? input.cursor + limit : null,
      };
    }),

  stats: adminProcedure.query(async ({ ctx }) => {
    const roleRows = await ctx.db
      .select({ role: user.role, c: sql<number>`count(*)` })
      .from(user)
      .where(
        and(
          eq(user.universityId, ctx.me.universityId),
          inArray(user.status, ["ACTIVE", "SUSPENDED"]),
        ),
      )
      .groupBy(user.role);
    const members = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<
      Role,
      number
    >;
    for (const row of roleRows) members[row.role] = Number(row.c);

    const [pendingRow] = await ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(user)
      .where(
        and(
          eq(user.universityId, ctx.me.universityId),
          eq(user.status, "PENDING"),
          eq(user.emailVerified, true), // match pendingUsers
        ),
      );

    const weekExpr = sql<string>`to_char(date_trunc('week', ${post.createdAt} at time zone 'UTC'), 'IYYY-"W"IW')`;
    const postWeeks = await ctx.db
      .select({ week: weekExpr, c: sql<number>`count(*)` })
      .from(post)
      .where(
        and(
          isNull(post.deletedAt),
          sql`${post.createdAt} >= now() - interval '8 weeks'`,
        ),
      )
      .groupBy(weekExpr);
    const commentWeekExpr = sql<string>`to_char(date_trunc('week', ${comment.createdAt} at time zone 'UTC'), 'IYYY-"W"IW')`;
    const commentWeeks = await ctx.db
      .select({ week: commentWeekExpr, c: sql<number>`count(*)` })
      .from(comment)
      .where(
        and(
          isNull(comment.deletedAt),
          sql`${comment.createdAt} >= now() - interval '8 weeks'`,
        ),
      )
      .groupBy(commentWeekExpr);
    const postMap = new Map(postWeeks.map((r) => [r.week, Number(r.c)]));
    const commentMap = new Map(commentWeeks.map((r) => [r.week, Number(r.c)]));
    const postsPerWeek = Array.from({ length: 8 }, (_, idx) => {
      const key = isoWeekKey(new Date(Date.now() - (7 - idx) * 7 * 86_400_000));
      return {
        week: key,
        posts: postMap.get(key) ?? 0,
        comments: commentMap.get(key) ?? 0,
      };
    });

    const [totalPostsRow] = await ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(post)
      .where(isNull(post.deletedAt));
    const totalPosts = Number(totalPostsRow.c);
    const [answeredRow] = await ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(post)
      .where(
        and(
          isNull(post.deletedAt),
          sql`exists (select 1 from comment c join "user" u on u.id = c.author_id and u.university_id = c.university_id where c.post_id = post.id and c.deleted_at is null and u.role = 'ALUMNUS')`,
        ),
      );
    const alumniAnsweredPct =
      totalPosts === 0
        ? 0
        : Math.round((Number(answeredRow.c) / totalPosts) * 100);

    const [openReportsRow] = await ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(report)
      .where(eq(report.status, "OPEN"));

    return {
      members,
      pending: Number(pendingRow.c),
      postsPerWeek,
      alumniAnsweredPct,
      openReports: Number(openReportsRow.c),
      totalPosts,
    };
  }),
});
