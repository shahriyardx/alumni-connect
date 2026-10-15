import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import {
  attachment,
  followTag,
  followUser,
  notification,
  post,
  postTag,
  tag,
} from "@/db/schema";
import { publish } from "../events";
import { listPosts } from "../queries/posts";
import { normalizeTags } from "../tags";
import { audit, memberProcedure, router } from "../trpc";

const isMod = (r: string) => r === "MODERATOR" || r === "ADMIN";
const LINK_RE = /https?:\/\/|www\./i;

/** Insert any new tag names for this tenant, then return ids for all names. */
async function tagIdsFor(
  tx: Tx,
  universityId: string,
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  await tx
    .insert(tag)
    .values(names.map((name) => ({ universityId, name })))
    .onConflictDoNothing({ target: [tag.universityId, tag.name] });
  const rows = await tx
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.universityId, universityId), inArray(tag.name, names)));
  return rows.map((r) => r.id);
}

async function setPostTags(
  tx: Tx,
  universityId: string,
  postId: string,
  names: string[],
) {
  await tx.delete(postTag).where(eq(postTag.postId, postId));
  const tagIds = await tagIdsFor(tx, universityId, names);
  if (tagIds.length > 0) {
    await tx
      .insert(postTag)
      .values(tagIds.map((tagId) => ({ universityId, postId, tagId })));
  }
  return tagIds;
}

export const postRouter = router({
  feed: memberProcedure
    .input(
      z.object({
        sort: z.enum(["new", "top"]).default("new"),
        tag: z.string().optional(),
        authorId: z.string().optional(),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) => {
      const conds = [];
      if (input.tag) {
        conds.push(
          sql`exists (select 1 from post_tag pt join tag t on t.id = pt.tag_id where pt.post_id = post.id and t.name = ${input.tag})`,
        );
      }
      if (input.authorId) conds.push(eq(post.authorId, input.authorId));
      return listPosts(ctx.db, ctx.me.id, {
        where: conds.length ? and(...conds) : undefined,
        orderBy: input.sort,
        offset: input.cursor,
      });
    }),

  search: memberProcedure
    .input(
      z.object({
        q: z.string().min(1).max(200),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) =>
      listPosts(ctx.db, ctx.me.id, {
        where: sql`${post.search} @@ websearch_to_tsquery('english', ${input.q})`,
        orderBy: "rank",
        rankQuery: input.q,
        offset: input.cursor,
      }),
    ),

  byId: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { items } = await listPosts(ctx.db, ctx.me.id, {
        where: eq(post.id, input.id),
        orderBy: "new",
        offset: 0,
        limit: 1,
      });
      const item = items[0];
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const [row] = await ctx.db
        .select({ body: post.body, authorId: post.authorId })
        .from(post)
        .where(eq(post.id, input.id));
      const attachments = await ctx.db
        .select({
          id: attachment.id,
          key: attachment.objectKey,
          mime: attachment.mime,
        })
        .from(attachment)
        .where(eq(attachment.postId, input.id));
      const canEdit = row.authorId === ctx.me.id || isMod(ctx.me.role);
      return { ...item, body: row.body, attachments, canEdit };
    }),

  create: memberProcedure
    .input(
      z.object({
        title: z.string().min(5).max(200),
        body: z.string().min(1).max(20000),
        tags: z.array(z.string()).max(10).default([]),
        attachmentIds: z.array(z.string().uuid()).max(6).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountAgeMs = Date.now() - ctx.me.createdAt.getTime();
      if (
        (LINK_RE.test(input.title) || LINK_RE.test(input.body)) &&
        accountAgeMs < 3 * 86_400_000
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "New accounts can post links after 3 days",
        });
      }
      const names = normalizeTags(input.tags);
      const universityId = ctx.me.universityId;

      const [row] = await ctx.db
        .insert(post)
        .values({
          universityId,
          authorId: ctx.me.id,
          title: input.title,
          body: input.body,
        })
        .returning({ id: post.id });

      const tagIds = await setPostTags(ctx.db, universityId, row.id, names);

      if (input.attachmentIds.length > 0) {
        await ctx.db
          .update(attachment)
          .set({ postId: row.id })
          .where(
            and(
              inArray(attachment.id, input.attachmentIds),
              eq(attachment.ownerId, ctx.me.id),
              isNull(attachment.postId),
            ),
          );
      }

      // Dedupe notification recipients: a user following both the author and
      // one of the post's tags gets only FOLLOWED_USER_POST.
      const recipients = new Map<
        string,
        "FOLLOWED_USER_POST" | "FOLLOWED_TAG_POST"
      >();
      const userFollowers = await ctx.db
        .select({ userId: followUser.followerId })
        .from(followUser)
        .where(eq(followUser.followeeId, ctx.me.id));
      for (const { userId } of userFollowers) {
        if (userId !== ctx.me.id) recipients.set(userId, "FOLLOWED_USER_POST");
      }
      if (tagIds.length > 0) {
        const tagFollowers = await ctx.db
          .select({ userId: followTag.userId })
          .from(followTag)
          .where(inArray(followTag.tagId, tagIds));
        for (const { userId } of tagFollowers) {
          if (userId !== ctx.me.id && !recipients.has(userId)) {
            recipients.set(userId, "FOLLOWED_TAG_POST");
          }
        }
      }

      if (recipients.size > 0) {
        await ctx.db.insert(notification).values(
          [...recipients.entries()].map(([userId, type]) => ({
            universityId,
            userId,
            type,
            actorId: ctx.me.id,
            postId: row.id,
          })),
        );
      }

      await publish(ctx.db, { universityId, kind: "post", postId: row.id });
      for (const userId of recipients.keys()) {
        await publish(ctx.db, { universityId, kind: "notification", userId });
      }

      return { id: row.id };
    }),

  update: memberProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(5).max(200),
        body: z.string().min(1).max(20000),
        tags: z.array(z.string()).max(10).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select()
        .from(post)
        .where(and(eq(post.id, input.id), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const canEdit = p.authorId === ctx.me.id || isMod(ctx.me.role);
      if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });

      const names = normalizeTags(input.tags);
      await ctx.db
        .update(post)
        .set({ title: input.title, body: input.body })
        .where(eq(post.id, input.id));
      await setPostTags(ctx.db, p.universityId, input.id, names);

      return { id: input.id };
    }),

  remove: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select()
        .from(post)
        .where(and(eq(post.id, input.id), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const canEdit = p.authorId === ctx.me.id || isMod(ctx.me.role);
      if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(post)
        .set({ deletedAt: new Date() })
        .where(eq(post.id, input.id));

      if (p.authorId !== ctx.me.id) {
        await audit(ctx.db, p.universityId, ctx.me.id, "post.remove", p.id);
      }

      return { ok: true as const };
    }),

  tags: memberProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ name: tag.name, count: sql<number>`count(*)` })
      .from(tag)
      .innerJoin(postTag, eq(postTag.tagId, tag.id))
      .innerJoin(post, and(eq(post.id, postTag.postId), isNull(post.deletedAt)))
      .groupBy(tag.name)
      .orderBy(desc(sql`count(*)`))
      .limit(30);
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  }),
});
