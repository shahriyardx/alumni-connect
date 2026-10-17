import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { broadcast, notification, post, user } from "@/db/schema";
import { memberProcedure, router } from "../trpc";

const PAGE_SIZE = 30;

export const notificationRouter = router({
  list: memberProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: notification.id,
          type: notification.type,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
          commentId: notification.commentId,
          actor: {
            id: user.id,
            name: user.name,
            role: user.role,
            batchNumber: user.batchNumber,
            department: user.department,
            avatarKey: user.avatarKey,
          },
          post: { id: post.id, title: post.title },
          broadcast: { title: broadcast.title, body: broadcast.body },
        })
        .from(notification)
        // No actor on a platform broadcast.
        .leftJoin(
          user,
          and(
            eq(user.id, notification.actorId),
            eq(user.universityId, notification.universityId),
          ),
        )
        .leftJoin(
          post,
          and(
            eq(post.id, notification.postId),
            eq(post.universityId, notification.universityId),
            isNull(post.deletedAt),
          ),
        )
        .leftJoin(broadcast, eq(broadcast.id, notification.broadcastId))
        .where(eq(notification.userId, ctx.me.id))
        .orderBy(desc(notification.createdAt))
        .limit(PAGE_SIZE + 1)
        .offset(input.cursor);

      return {
        items: rows.slice(0, PAGE_SIZE),
        nextCursor: rows.length > PAGE_SIZE ? input.cursor + PAGE_SIZE : null,
      };
    }),

  unreadCount: memberProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(notification)
      .where(
        and(eq(notification.userId, ctx.me.id), isNull(notification.readAt)),
      );
    return Number(row.c);
  }),

  markRead: memberProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const conds = [eq(notification.userId, ctx.me.id)];
      if (input.ids) conds.push(inArray(notification.id, input.ids));
      await ctx.db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(...conds));
      return { ok: true as const };
    }),

  /** `ctx.me` already carries these columns — no extra query. */
  prefs: memberProcedure.query(({ ctx }) => ({
    notifyReplyPost: ctx.me.notifyReplyPost,
    notifyReplyComment: ctx.me.notifyReplyComment,
    notifyAnnouncements: ctx.me.notifyAnnouncements,
    notifyFollowedTag: ctx.me.notifyFollowedTag,
    notifyAcceptedAnswer: ctx.me.notifyAcceptedAnswer,
  })),

  updatePrefs: memberProcedure
    .input(
      z.object({
        notifyReplyPost: z.boolean(),
        notifyReplyComment: z.boolean(),
        notifyAnnouncements: z.boolean(),
        notifyFollowedTag: z.boolean(),
        notifyAcceptedAnswer: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Explicit university_id filter, per house rule, alongside id.
      // memberProcedure already rejects no-university accounts (super
      // admins can't reach this procedure), so ctx.me.universityId is never
      // null here — isNull is the defensive fallback if that ever changes.
      await ctx.db
        .update(user)
        .set(input)
        .where(
          and(
            eq(user.id, ctx.me.id),
            ctx.me.universityId
              ? eq(user.universityId, ctx.me.universityId)
              : isNull(user.universityId),
          ),
        );
      return { ok: true as const };
    }),
});
