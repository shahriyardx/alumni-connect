import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import {
  bookmark,
  comment,
  followTag,
  followUser,
  post,
  tag,
  user,
  vote,
} from "@/db/schema";
import { listPosts } from "../queries/posts";
import { normalizeTags } from "../tags";
import { memberProcedure, router } from "../trpc";

type TargetType = "POST" | "COMMENT";

/**
 * Loads the vote target and locks its row (`FOR UPDATE`) so concurrent votes
 * on the same target serialize: without this, two transactions can both read
 * the pre-commit vote sum and overwrite each other's `score` update (lost
 * update under READ COMMITTED). Must be called before writing the vote row.
 */
async function loadTarget(tx: Tx, targetType: TargetType, targetId: string) {
  if (targetType === "POST") {
    const [row] = await tx
      .select({ id: post.id, authorId: post.authorId, kind: post.kind })
      .from(post)
      .where(and(eq(post.id, targetId), isNull(post.deletedAt)))
      .for("update");
    return row;
  }
  // A comment's own post may have been (soft-)deleted after the comment was
  // made — treat that as the comment no longer being votable too.
  const [row] = await tx
    .select({ id: comment.id, authorId: comment.authorId })
    .from(comment)
    .innerJoin(post, and(eq(post.id, comment.postId), isNull(post.deletedAt)))
    .where(and(eq(comment.id, targetId), isNull(comment.deletedAt)))
    .for("update");
  return row;
}

async function recomputeScore(
  tx: Tx,
  targetType: TargetType,
  targetId: string,
): Promise<number> {
  const scoreExpr = sql<number>`coalesce((select sum(value) from vote where target_type = ${targetType} and target_id = ${targetId}), 0)`;
  if (targetType === "POST") {
    const [row] = await tx
      .update(post)
      .set({ score: scoreExpr })
      .where(eq(post.id, targetId))
      .returning({ score: post.score });
    return row.score;
  }
  const [row] = await tx
    .update(comment)
    .set({ score: scoreExpr })
    .where(eq(comment.id, targetId))
    .returning({ score: comment.score });
  return row.score;
}

export const socialRouter = router({
  vote: memberProcedure
    .input(
      z.object({
        targetType: z.enum(["POST", "COMMENT"]),
        targetId: z.string().uuid(),
        value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, input.targetType, input.targetId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if ("kind" in target && target.kind === "ANNOUNCEMENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't vote on an announcement",
        });
      }
      if (target.authorId === ctx.me.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can't vote on your own ${input.targetType === "POST" ? "post" : "comment"}`,
        });
      }

      if (input.value === 0) {
        await ctx.db
          .delete(vote)
          .where(
            and(
              eq(vote.userId, ctx.me.id),
              eq(vote.targetType, input.targetType),
              eq(vote.targetId, input.targetId),
            ),
          );
      } else {
        await ctx.db
          .insert(vote)
          .values({
            universityId: ctx.me.universityId,
            userId: ctx.me.id,
            targetType: input.targetType,
            targetId: input.targetId,
            value: input.value,
          })
          .onConflictDoUpdate({
            target: [vote.userId, vote.targetType, vote.targetId],
            set: { value: input.value },
          });
      }

      const score = await recomputeScore(
        ctx.db,
        input.targetType,
        input.targetId,
      );
      return { score, myVote: input.value };
    }),

  bookmark: memberProcedure
    .input(z.object({ postId: z.string().uuid(), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select({ id: post.id })
        .from(post)
        .where(and(eq(post.id, input.postId), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.on) {
        await ctx.db
          .insert(bookmark)
          .values({
            universityId: ctx.me.universityId,
            userId: ctx.me.id,
            postId: input.postId,
          })
          .onConflictDoNothing({ target: [bookmark.userId, bookmark.postId] });
      } else {
        await ctx.db
          .delete(bookmark)
          .where(
            and(
              eq(bookmark.userId, ctx.me.id),
              eq(bookmark.postId, input.postId),
            ),
          );
      }
      return { bookmarked: input.on };
    }),

  bookmarks: memberProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0) }))
    .query(({ ctx, input }) =>
      listPosts(ctx.db, ctx.me.id, {
        where: sql`exists (select 1 from bookmark where post_id = post.id and user_id = ${ctx.me.id})`,
        orderBy: "new",
        offset: input.cursor,
      }),
    ),

  followUser: memberProcedure
    .input(z.object({ userId: z.string().min(1), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.me.id) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const [target] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.id, input.userId),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.on) {
        await ctx.db
          .insert(followUser)
          .values({
            universityId: ctx.me.universityId,
            followerId: ctx.me.id,
            followeeId: input.userId,
          })
          .onConflictDoNothing({
            target: [followUser.followerId, followUser.followeeId],
          });
      } else {
        await ctx.db
          .delete(followUser)
          .where(
            and(
              eq(followUser.followerId, ctx.me.id),
              eq(followUser.followeeId, input.userId),
            ),
          );
      }
      return { following: input.on };
    }),

  followTag: memberProcedure
    .input(z.object({ tag: z.string().min(1), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const name = normalizeTags([input.tag])[0];
      if (!name) throw new TRPCError({ code: "BAD_REQUEST" });

      if (!input.on) {
        // Unfollowing a tag nobody follows must not conjure it into
        // existence — only look it up, never create it.
        const [tagRow] = await ctx.db
          .select({ id: tag.id })
          .from(tag)
          .where(
            and(eq(tag.universityId, ctx.me.universityId), eq(tag.name, name)),
          );
        if (tagRow) {
          await ctx.db
            .delete(followTag)
            .where(
              and(
                eq(followTag.userId, ctx.me.id),
                eq(followTag.tagId, tagRow.id),
              ),
            );
        }
        return { following: false };
      }

      await ctx.db
        .insert(tag)
        .values({ universityId: ctx.me.universityId, name })
        .onConflictDoNothing({ target: [tag.universityId, tag.name] });
      const [tagRow] = await ctx.db
        .select({ id: tag.id })
        .from(tag)
        .where(
          and(eq(tag.universityId, ctx.me.universityId), eq(tag.name, name)),
        );
      await ctx.db
        .insert(followTag)
        .values({
          universityId: ctx.me.universityId,
          userId: ctx.me.id,
          tagId: tagRow.id,
        })
        .onConflictDoNothing({ target: [followTag.userId, followTag.tagId] });
      return { following: true };
    }),

  followedTags: memberProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ name: tag.name })
      .from(followTag)
      .innerJoin(tag, eq(tag.id, followTag.tagId))
      .where(eq(followTag.userId, ctx.me.id))
      .orderBy(asc(tag.name));
    return rows.map((r) => r.name);
  }),
});
