import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import {
  auditLog,
  comment,
  post,
  type Role,
  report,
  session,
  user,
} from "@/db/schema";
import type { AuthorInfo } from "../queries/posts";
import {
  audit,
  isAdmin,
  isMod,
  type Me,
  memberProcedure,
  modProcedure,
  router,
} from "../trpc";

type TargetType = "POST" | "COMMENT" | "USER";

type Preview = {
  title?: string;
  body?: string;
  userName?: string;
  authorId?: string;
  postId?: string;
} | null;

async function targetExists(
  tx: Tx,
  universityId: string,
  targetType: TargetType,
  targetId: string,
): Promise<boolean> {
  if (targetType === "POST") {
    const [row] = await tx
      .select({ id: post.id })
      .from(post)
      .where(and(eq(post.id, targetId), isNull(post.deletedAt)));
    return !!row;
  }
  if (targetType === "COMMENT") {
    const [row] = await tx
      .select({ id: comment.id })
      .from(comment)
      .where(and(eq(comment.id, targetId), isNull(comment.deletedAt)));
    return !!row;
  }
  const [row] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, targetId), eq(user.universityId, universityId)));
  return !!row;
}

async function loadPreview(
  tx: Tx,
  universityId: string,
  targetType: TargetType,
  targetId: string,
): Promise<Preview> {
  if (targetType === "POST") {
    const [row] = await tx
      .select({ title: post.title, authorId: post.authorId })
      .from(post)
      .where(eq(post.id, targetId));
    return row ? { title: row.title, authorId: row.authorId } : null;
  }
  if (targetType === "COMMENT") {
    const [row] = await tx
      .select({
        body: comment.body,
        authorId: comment.authorId,
        postId: comment.postId,
      })
      .from(comment)
      .where(eq(comment.id, targetId));
    return row
      ? { body: row.body, authorId: row.authorId, postId: row.postId }
      : null;
  }
  const [row] = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.id, targetId), eq(user.universityId, universityId)));
  return row ? { userName: row.name, authorId: row.id } : null;
}

/**
 * The reported authors' profiles, for the "who" block on each report card —
 * one `inArray` query for the whole page rather than one per card. `user`
 * has no RLS, so it's filtered on `universityId` explicitly.
 */
async function loadReportedAuthors(
  tx: Tx,
  universityId: string,
  authorIds: string[],
): Promise<Map<string, AuthorInfo>> {
  if (authorIds.length === 0) return new Map();
  const rows = await tx
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      batchNumber: user.batchNumber,
      department: user.department,
      avatarKey: user.avatarKey,
    })
    .from(user)
    .where(
      and(inArray(user.id, authorIds), eq(user.universityId, universityId)),
    );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Prior strikes against each of the given users: posts/comments removed by
 * moderators, plus past suspensions/bans — whether they came through a
 * report or a direct admin/mod action. One grouped query for the whole page
 * rather than one per card. Reuses audit_log rather than a new table;
 * `report.remove` / `report.suspend` / `report.ban` carry the content
 * author's id in `meta.authorId` (see `resolve` below), and a direct
 * `setUserStatus` call writes `user.status` straight on the target.
 */
async function countStrikesMany(
  tx: Tx,
  universityId: string,
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  // `report.*` rows carry the user in `meta.authorId`; a direct
  // `user.status` change carries it in `target` instead — coalesce so both
  // kinds of strike group onto the same key.
  const userKey = sql`coalesce(${auditLog.meta} ->> 'authorId', ${auditLog.target})`;
  const rows = await tx
    .select({ userId: sql<string>`${userKey}`, c: sql<number>`count(*)` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.universityId, universityId),
        or(
          and(
            inArray(auditLog.action, [
              "report.remove",
              "report.suspend",
              "report.ban",
            ]),
            inArray(sql`${auditLog.meta} ->> 'authorId'`, userIds),
          ),
          and(
            eq(auditLog.action, "user.status"),
            inArray(auditLog.target, userIds),
            sql`${auditLog.meta} ->> 'status' in ('SUSPENDED', 'BANNED')`,
          ),
        ),
      ),
    )
    .groupBy(sql`${userKey}`);
  return new Map(rows.map((r) => [r.userId, Number(r.c)]));
}

/** Author of the post/comment, or the user themself for a USER report target. */
async function resolveTargetUserId(
  tx: Tx,
  targetType: TargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "USER") return targetId;
  if (targetType === "POST") {
    const [row] = await tx
      .select({ authorId: post.authorId })
      .from(post)
      .where(eq(post.id, targetId));
    return row?.authorId ?? null;
  }
  const [row] = await tx
    .select({ authorId: comment.authorId })
    .from(comment)
    .where(eq(comment.id, targetId));
  return row?.authorId ?? null;
}

/** Nobody acts on themselves or the OWNER; ADMINs only by the OWNER; a MODERATOR not on MODERATOR/ADMIN. */
function assertCanAct(me: Me, target: { id: string; role: Role }) {
  if (target.id === me.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can't do this to your own account",
    });
  }
  if (target.role === "OWNER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The owner's account can't be moderated",
    });
  }
  if (me.role === "ADMIN" && target.role === "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the owner can act on admins",
    });
  }
  if (me.role === "MODERATOR" && isMod(target.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Moderators can't act on moderators or admins",
    });
  }
}

/** Soft-delete the reported post/comment, keeping comment counts consistent. */
async function removeTarget(
  tx: Tx,
  targetType: "POST" | "COMMENT",
  targetId: string,
) {
  if (targetType === "POST") {
    await tx
      .update(post)
      .set({ deletedAt: new Date() })
      .where(and(eq(post.id, targetId), isNull(post.deletedAt)));
    return;
  }
  const [removed] = await tx
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.id, targetId), isNull(comment.deletedAt)))
    .returning({ postId: comment.postId });
  if (removed) {
    await tx
      .update(post)
      .set({ commentCount: sql`${post.commentCount} - 1` })
      .where(eq(post.id, removed.postId));
  }
}

export const moderationRouter = router({
  report: memberProcedure
    .input(
      z.object({
        targetType: z.enum(["POST", "COMMENT", "USER"]),
        targetId: z.string().min(1),
        reason: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await targetExists(
        ctx.db,
        ctx.me.universityId,
        input.targetType,
        input.targetId,
      );
      if (!exists) throw new TRPCError({ code: "NOT_FOUND" });

      const [existing] = await ctx.db
        .select({ id: report.id })
        .from(report)
        .where(
          and(
            eq(report.reporterId, ctx.me.id),
            eq(report.targetType, input.targetType),
            eq(report.targetId, input.targetId),
            eq(report.status, "OPEN"),
          ),
        );
      if (existing) return { id: existing.id };

      const [row] = await ctx.db
        .insert(report)
        .values({
          universityId: ctx.me.universityId,
          reporterId: ctx.me.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
        })
        .returning({ id: report.id });

      return { id: row.id };
    }),

  queue: modProcedure
    .input(
      z.object({
        status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = 30;
      const rows = await ctx.db
        .select({
          id: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          status: report.status,
          createdAt: report.createdAt,
          resolvedBy: report.resolvedBy,
          reporter: {
            id: user.id,
            name: user.name,
            role: user.role,
            batchNumber: user.batchNumber,
            department: user.department,
            avatarKey: user.avatarKey,
          },
        })
        .from(report)
        .innerJoin(
          user,
          and(
            eq(user.id, report.reporterId),
            eq(user.universityId, ctx.me.universityId),
          ),
        )
        .where(eq(report.status, input.status))
        .orderBy(
          input.status === "OPEN"
            ? asc(report.createdAt)
            : desc(report.createdAt),
        )
        .limit(limit + 1)
        .offset(input.cursor);

      const page = rows.slice(0, limit);
      // Previews differ per target type (post/comment/user) and still need
      // one lookup each, but the reported-author profiles and their strike
      // counts are each fetched in one batched query for the whole page.
      const previews = await Promise.all(
        page.map((r) =>
          loadPreview(ctx.db, ctx.me.universityId, r.targetType, r.targetId),
        ),
      );
      const authorIds = [
        ...new Set(
          previews.map((p) => p?.authorId).filter((id): id is string => !!id),
        ),
      ];
      const authors = await loadReportedAuthors(
        ctx.db,
        ctx.me.universityId,
        authorIds,
      );
      const strikes = await countStrikesMany(ctx.db, ctx.me.universityId, [
        ...authors.keys(),
      ]);

      const items = page.map((r, i) => {
        const preview = previews[i];
        const reportedAuthor = preview?.authorId
          ? (authors.get(preview.authorId) ?? null)
          : null;
        const priorStrikes = reportedAuthor
          ? (strikes.get(reportedAuthor.id) ?? 0)
          : 0;
        return {
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt,
          reporter: r.reporter as AuthorInfo,
          preview,
          reportedAuthor,
          priorStrikes,
          resolvedBy: r.resolvedBy,
        };
      });

      return {
        items,
        nextCursor: rows.length > limit ? input.cursor + limit : null,
      };
    }),

  resolve: modProcedure
    .input(
      z
        .object({
          reportId: z.string().uuid(),
          action: z.enum(["dismiss", "remove", "suspend", "ban"]),
          days: z.number().int().min(1).max(365).optional(),
          note: z.string().max(500).optional(),
        })
        .superRefine((val, ctx) => {
          if (val.action === "suspend" && val.days === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "days is required for suspend",
              path: ["days"],
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const [rpt] = await ctx.db
        .select()
        .from(report)
        .where(eq(report.id, input.reportId));
      if (!rpt) throw new TRPCError({ code: "NOT_FOUND" });
      if (rpt.status !== "OPEN") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report already handled",
        });
      }

      // The content/account author, recorded on the audit entry below so
      // `countStrikes` can tally prior violations without a new table.
      let authorId: string | null = null;
      // False only for a "suspend" that was a no-op (target already
      // BANNED) — skip the audit row so a repeat/ineffective suspend can't
      // inflate `countStrikes` with a strike that didn't actually happen.
      let didChange = true;

      if (input.action === "remove") {
        if (rpt.targetType === "USER")
          throw new TRPCError({ code: "BAD_REQUEST" });
        await removeTarget(ctx.db, rpt.targetType, rpt.targetId);
        authorId = await resolveTargetUserId(
          ctx.db,
          rpt.targetType,
          rpt.targetId,
        );
      } else if (input.action === "suspend" || input.action === "ban") {
        const targetUserId = await resolveTargetUserId(
          ctx.db,
          rpt.targetType,
          rpt.targetId,
        );
        if (!targetUserId) throw new TRPCError({ code: "NOT_FOUND" });
        authorId = targetUserId;
        const [targetUser] = await ctx.db
          .select({ id: user.id, role: user.role, status: user.status })
          .from(user)
          .where(
            and(
              eq(user.id, targetUserId),
              eq(user.universityId, ctx.me.universityId),
            ),
          );
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });
        assertCanAct(ctx.me, targetUser);
        if (targetUser.status === "PENDING") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Use admin approval for pending accounts",
          });
        }

        if (input.action === "suspend") {
          // Don't let a suspend downgrade an already-banned account: leave
          // it BANNED, but still resolve the report that flagged it.
          if (targetUser.status !== "BANNED") {
            await ctx.db
              .update(user)
              .set({
                status: "SUSPENDED",
                suspendedUntil: new Date(
                  Date.now() + (input.days as number) * 86_400_000,
                ),
              })
              .where(
                and(
                  eq(user.id, targetUserId),
                  eq(user.universityId, ctx.me.universityId),
                ),
              );
          } else {
            didChange = false;
          }
        } else {
          await ctx.db
            .update(user)
            .set({ status: "BANNED", suspendedUntil: null })
            .where(
              and(
                eq(user.id, targetUserId),
                eq(user.universityId, ctx.me.universityId),
              ),
            );
          await ctx.db.delete(session).where(eq(session.userId, targetUserId));
        }
      }

      const newStatus = input.action === "dismiss" ? "DISMISSED" : "RESOLVED";
      await ctx.db
        .update(report)
        .set({
          status: newStatus,
          resolvedBy: ctx.me.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(report.targetType, rpt.targetType),
            eq(report.targetId, rpt.targetId),
            or(eq(report.id, rpt.id), eq(report.status, "OPEN")),
          ),
        );

      if (didChange) {
        await audit(
          ctx.db,
          ctx.me.universityId,
          ctx.me.id,
          `report.${input.action}`,
          `${rpt.targetType}:${rpt.targetId}`,
          {
            reportId: rpt.id,
            days: input.days,
            note: input.note,
            authorId: authorId ?? undefined,
          },
        );
      }

      return { ok: true as const };
    }),

  setUserStatus: modProcedure
    .input(
      z
        .object({
          userId: z.string().min(1),
          status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
          days: z.number().int().min(1).max(365).optional(),
        })
        .superRefine((val, ctx) => {
          if (val.status === "SUSPENDED" && val.days === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "days is required for suspend",
              path: ["days"],
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ id: user.id, role: user.role, status: user.status })
        .from(user)
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      assertCanAct(ctx.me, target);

      // PENDING accounts are an admin-approval concern (workspace.decide),
      // not something a moderator can flip straight to ACTIVE.
      if (target.status === "PENDING") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Use admin approval for pending accounts",
        });
      }
      // A ban is only an admin's to lift — block a MODERATOR from moving a
      // BANNED account to *any* other status (including SUSPENDED, which
      // would otherwise let a mod partially undo a ban one step at a time).
      if (
        target.status === "BANNED" &&
        input.status !== "BANNED" &&
        !isAdmin(ctx.me.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only an admin can lift a ban",
        });
      }
      if (
        input.status === "ACTIVE" &&
        target.status !== "SUSPENDED" &&
        target.status !== "BANNED"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only activate a suspended or banned account",
        });
      }

      const suspendedUntil =
        input.status === "SUSPENDED"
          ? new Date(Date.now() + (input.days as number) * 86_400_000)
          : null;
      await ctx.db
        .update(user)
        .set({ status: input.status, suspendedUntil })
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      if (input.status === "BANNED") {
        await ctx.db.delete(session).where(eq(session.userId, input.userId));
      }

      await audit(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        "user.status",
        input.userId,
        {
          status: input.status,
          days: input.days,
        },
      );
      return { ok: true as const };
    }),
});
