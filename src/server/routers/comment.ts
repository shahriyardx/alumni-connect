import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { comment, notification, post, user } from "@/db/schema";
import { publish } from "../events";
import type { AuthorInfo } from "../queries/posts";
import { memberProcedure, router } from "../trpc";

const isMod = (r: string) => r === "MODERATOR" || r === "ADMIN";

export type CommentItem = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  score: number;
  myVote: -1 | 0 | 1;
  deleted: boolean;
  author: AuthorInfo | null;
  canEdit: boolean;
};

export const commentRouter = router({
  list: memberProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<CommentItem[]> => {
      const [p] = await ctx.db
        .select({ id: post.id })
        .from(post)
        .where(and(eq(post.id, input.postId), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = await ctx.db
        .select({
          id: comment.id,
          parentId: comment.parentId,
          body: comment.body,
          createdAt: comment.createdAt,
          score: comment.score,
          deletedAt: comment.deletedAt,
          authorId: comment.authorId,
          author: {
            id: user.id,
            name: user.name,
            role: user.role,
            batchYear: user.batchYear,
            department: user.department,
            avatarKey: user.avatarKey,
          },
          myVote: sql<
            number | null
          >`(select value from vote where target_type = 'COMMENT' and target_id = comment.id and user_id = ${ctx.me.id})`,
        })
        .from(comment)
        .innerJoin(user, eq(user.id, comment.authorId))
        .where(eq(comment.postId, input.postId))
        .orderBy(asc(comment.createdAt));

      return rows.map((r) => {
        const deleted = !!r.deletedAt;
        return {
          id: r.id,
          parentId: r.parentId,
          body: deleted ? "[removed]" : r.body,
          createdAt: r.createdAt,
          score: r.score,
          myVote: (r.myVote ?? 0) as -1 | 0 | 1,
          deleted,
          author: deleted ? null : (r.author as AuthorInfo),
          canEdit: !deleted && (r.authorId === ctx.me.id || isMod(ctx.me.role)),
        };
      });
    }),

  create: memberProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        parentId: z.string().uuid().optional(),
        body: z.string().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select({
          id: post.id,
          authorId: post.authorId,
          universityId: post.universityId,
        })
        .from(post)
        .where(and(eq(post.id, input.postId), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });

      let recipient: string | null;
      let type: "REPLY_COMMENT" | "REPLY_POST";
      if (input.parentId) {
        const [parent] = await ctx.db
          .select({
            id: comment.id,
            postId: comment.postId,
            authorId: comment.authorId,
          })
          .from(comment)
          .where(eq(comment.id, input.parentId));
        if (!parent || parent.postId !== input.postId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        recipient = parent.authorId;
        type = "REPLY_COMMENT";
      } else {
        recipient = p.authorId;
        type = "REPLY_POST";
      }
      if (recipient === ctx.me.id) recipient = null;

      const [row] = await ctx.db
        .insert(comment)
        .values({
          universityId: p.universityId,
          postId: input.postId,
          parentId: input.parentId,
          authorId: ctx.me.id,
          body: input.body,
        })
        .returning({ id: comment.id });

      await ctx.db
        .update(post)
        .set({ commentCount: sql`${post.commentCount} + 1` })
        .where(eq(post.id, input.postId));

      if (recipient) {
        await ctx.db.insert(notification).values({
          universityId: p.universityId,
          userId: recipient,
          type,
          actorId: ctx.me.id,
          postId: input.postId,
          commentId: row.id,
        });
      }

      await publish(ctx.db, {
        universityId: p.universityId,
        kind: "comment",
        postId: input.postId,
      });
      if (recipient) {
        await publish(ctx.db, {
          universityId: p.universityId,
          kind: "notification",
          userId: recipient,
        });
      }

      return { id: row.id };
    }),

  update: memberProcedure
    .input(
      z.object({ id: z.string().uuid(), body: z.string().min(1).max(10_000) }),
    )
    .mutation(async ({ ctx, input }) => {
      const [c] = await ctx.db
        .select()
        .from(comment)
        .where(and(eq(comment.id, input.id), isNull(comment.deletedAt)));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const canEdit = c.authorId === ctx.me.id || isMod(ctx.me.role);
      if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(comment)
        .set({ body: input.body })
        .where(eq(comment.id, input.id));

      return { id: input.id };
    }),

  remove: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await ctx.db
        .select()
        .from(comment)
        .where(and(eq(comment.id, input.id), isNull(comment.deletedAt)));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const canEdit = c.authorId === ctx.me.id || isMod(ctx.me.role);
      if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(comment)
        .set({ deletedAt: new Date() })
        .where(eq(comment.id, input.id));
      await ctx.db
        .update(post)
        .set({ commentCount: sql`${post.commentCount} - 1` })
        .where(eq(post.id, c.postId));

      return { ok: true as const };
    }),
});
