import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { attachment, comment, followUser, post, user } from "@/db/schema";
import { isMod, memberProcedure, router } from "../trpc";

export const profileRouter = router({
  get: memberProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          role: user.role,
          batchYear: user.batchYear,
          department: user.department,
          avatarKey: user.avatarKey,
          bio: user.bio,
          createdAt: user.createdAt,
          status: user.status,
          suspendedUntil: user.suspendedUntil,
        })
        .from(user)
        .where(
          and(
            eq(user.id, input.id),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      // Account status is moderation info: only mods/admins get it.
      const { status, suspendedUntil, ...u } = row;

      const [postCount] = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(post)
        .where(and(eq(post.authorId, input.id), isNull(post.deletedAt)));
      const [commentCount] = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(comment)
        .where(and(eq(comment.authorId, input.id), isNull(comment.deletedAt)));
      const [followers] = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(followUser)
        .where(eq(followUser.followeeId, input.id));
      const [following] = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(followUser)
        .where(eq(followUser.followerId, input.id));
      const [isFollowingRow] = await ctx.db
        .select({ x: sql<number>`1` })
        .from(followUser)
        .where(
          and(
            eq(followUser.followerId, ctx.me.id),
            eq(followUser.followeeId, input.id),
          ),
        );

      return {
        ...u,
        postCount: Number(postCount.c),
        commentCount: Number(commentCount.c),
        followers: Number(followers.c),
        following: Number(following.c),
        isFollowing: !!isFollowingRow,
        isMe: input.id === ctx.me.id,
        moderation: isMod(ctx.me.role) ? { status, suspendedUntil } : null,
      };
    }),

  update: memberProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        bio: z.string().min(0).max(500),
        department: z.string().min(2).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({ name: input.name, bio: input.bio, department: input.department })
        .where(
          and(
            eq(user.id, ctx.me.id),
            eq(user.universityId, ctx.me.universityId),
          ),
        );
      return { ok: true as const };
    }),

  setAvatar: memberProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [att] = await ctx.db
        .select({ id: attachment.id })
        .from(attachment)
        .where(
          and(
            eq(attachment.objectKey, input.key),
            eq(attachment.ownerId, ctx.me.id),
          ),
        );
      const kindSegment = input.key.split("/")[1];
      if (!att || kindSegment !== "avatar") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await ctx.db
        .update(user)
        .set({ avatarKey: input.key })
        .where(eq(user.id, ctx.me.id));
      return { ok: true as const };
    }),
});
