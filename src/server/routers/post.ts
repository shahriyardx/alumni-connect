import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import {
  attachment,
  comment,
  followTag,
  followUser,
  notification,
  POST_KINDS,
  post,
  postTag,
  tag,
  user,
} from "@/db/schema";
import { publish } from "../events";
import { assertCanPostLinks } from "../links";
import { ANNOUNCEMENTS_PREF_SQL } from "../notification-prefs";
import { hasAlumniReplySQL, listPosts } from "../queries/posts";
import { normalizeTags } from "../tags";
import { audit, isMod, isStaff, memberProcedure, router } from "../trpc";

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
        authorId: z.string().min(1).max(64).optional(),
        kind: z.enum(POST_KINDS).optional(),
        /** QUESTIONs with no comments yet, not deleted, tenant-scoped. */
        unanswered: z.boolean().optional(),
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
      if (input.kind) conds.push(eq(post.kind, input.kind));
      if (input.unanswered) {
        conds.push(eq(post.kind, "QUESTION"), eq(post.commentCount, 0));
      }
      return listPosts(ctx.db, ctx.me.id, {
        where: conds.length ? and(...conds) : undefined,
        orderBy: input.sort,
        offset: input.cursor,
      });
    }),

  /** Newest non-deleted announcements of the tenant, for the feed strip. */
  announcements: memberProcedure
    .input(z.object({ limit: z.number().int().min(1).max(10).default(3) }))
    .query(({ ctx, input }) =>
      listPosts(ctx.db, ctx.me.id, {
        where: eq(post.kind, "ANNOUNCEMENT"),
        orderBy: "new",
        offset: 0,
        limit: input.limit,
      }),
    ),

  search: memberProcedure
    .input(
      z.object({
        q: z.string().min(1).max(200),
        tag: z.string().max(80).optional(),
        department: z.string().max(80).optional(),
        hasAlumniAnswer: z.boolean().optional(),
        solved: z.boolean().optional(),
        kind: z.enum(POST_KINDS).optional(),
        range: z.enum(["any", "week", "month", "year"]).default("any"),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(({ ctx, input }) => {
      const conds = [
        sql`${post.search} @@ websearch_to_tsquery('english', ${input.q})`,
      ];
      if (input.tag) {
        conds.push(
          sql`exists (select 1 from post_tag pt join tag t on t.id = pt.tag_id where pt.post_id = post.id and t.name = ${input.tag})`,
        );
      }
      if (input.department) {
        conds.push(sql`lower(${user.department}) = lower(${input.department})`);
      }
      if (input.hasAlumniAnswer) conds.push(hasAlumniReplySQL);
      if (input.solved) conds.push(sql`${post.acceptedCommentId} is not null`);
      if (input.kind) conds.push(eq(post.kind, input.kind));
      if (input.range !== "any") {
        const days = { week: 7, month: 30, year: 365 }[input.range];
        conds.push(
          gte(post.createdAt, new Date(Date.now() - days * 86_400_000)),
        );
      }
      return listPosts(ctx.db, ctx.me.id, {
        where: and(...conds),
        orderBy: "rank",
        rankQuery: input.q,
        offset: input.cursor,
      });
    }),

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
        kind: z.enum(POST_KINDS).default("QUESTION"),
        tags: z.array(z.string()).max(10).default([]),
        attachmentIds: z.array(z.string().uuid()).max(6).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const wantsAnnouncement = input.kind === "ANNOUNCEMENT";
      if (isStaff(ctx.me.role) !== wantsAnnouncement) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: wantsAnnouncement
            ? "Only staff can post announcements"
            : "Staff can only post announcements",
        });
      }
      assertCanPostLinks(ctx.me, input.title, input.body);
      const names = normalizeTags(input.tags);
      const universityId = ctx.me.universityId;

      const [row] = await ctx.db
        .insert(post)
        .values({
          universityId,
          authorId: ctx.me.id,
          kind: input.kind,
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

      if (wantsAnnouncement) {
        // Every active student/alumnus of this tenant gets notified, not
        // just followers: one INSERT ... SELECT, fine at demo scale.
        const rows = await ctx.db.execute<{ user_id: string }>(sql`
          insert into notification (university_id, user_id, type, actor_id, post_id)
          select ${universityId}, id, 'ANNOUNCEMENT', ${ctx.me.id}, ${row.id}
          from "user"
          where university_id = ${universityId}
            and status = 'ACTIVE'
            and role in ('STUDENT', 'ALUMNUS')
            and id <> ${ctx.me.id}
            and ${ANNOUNCEMENTS_PREF_SQL}
          returning user_id
        `);
        await publish(ctx.db, {
          universityId,
          kind: "post",
          postId: row.id,
          authorId: ctx.me.id,
        });
        for (const r of rows) {
          await publish(ctx.db, {
            universityId,
            kind: "notification",
            userId: r.user_id,
          });
        }
        return { id: row.id };
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
          .innerJoin(
            user,
            and(
              eq(user.id, followTag.userId),
              eq(user.universityId, universityId),
            ),
          )
          .where(
            and(
              inArray(followTag.tagId, tagIds),
              eq(followTag.notify, true),
              eq(user.notifyFollowedTag, true),
              eq(user.status, "ACTIVE"),
            ),
          );
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

      await publish(ctx.db, {
        universityId,
        kind: "post",
        postId: row.id,
        authorId: ctx.me.id,
      });
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
      assertCanPostLinks(ctx.me, input.title, input.body);

      const names = normalizeTags(input.tags);
      await ctx.db
        .update(post)
        .set({ title: input.title, body: input.body })
        .where(eq(post.id, input.id));
      await setPostTags(ctx.db, p.universityId, input.id, names);

      if (p.authorId !== ctx.me.id) {
        await audit(ctx.db, p.universityId, ctx.me.id, "post.update", p.id);
      }

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

      // Guard the delete itself against a concurrent remove: only audit when
      // this call is the one that actually flipped deleted_at.
      const [removed] = await ctx.db
        .update(post)
        .set({ deletedAt: new Date() })
        .where(and(eq(post.id, input.id), isNull(post.deletedAt)))
        .returning({ id: post.id });

      if (removed && p.authorId !== ctx.me.id) {
        await audit(ctx.db, p.universityId, ctx.me.id, "post.remove", p.id);
      }

      return { ok: true as const };
    }),

  /** Only the asker, on a QUESTION. `commentId: null` un-accepts. */
  accept: memberProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        commentId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select()
        .from(post)
        .where(and(eq(post.id, input.postId), isNull(post.deletedAt)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (p.authorId !== ctx.me.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (p.kind !== "QUESTION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only questions can have an accepted answer",
        });
      }

      let notifyUserId: string | null = null;
      if (input.commentId) {
        const [c] = await ctx.db
          .select({
            postId: comment.postId,
            authorId: comment.authorId,
            deletedAt: comment.deletedAt,
          })
          .from(comment)
          .where(eq(comment.id, input.commentId));
        if (!c || c.postId !== input.postId || c.deletedAt) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        if (c.authorId !== ctx.me.id) {
          const [author] = await ctx.db
            .select({ pref: user.notifyAcceptedAnswer })
            .from(user)
            .where(
              and(
                eq(user.id, c.authorId),
                eq(user.universityId, p.universityId),
              ),
            );
          if (author?.pref) notifyUserId = c.authorId;
        }
      }

      await ctx.db
        .update(post)
        .set({ acceptedCommentId: input.commentId })
        .where(eq(post.id, input.postId));

      if (notifyUserId) {
        await ctx.db.insert(notification).values({
          universityId: p.universityId,
          userId: notifyUserId,
          type: "ACCEPTED_ANSWER",
          actorId: ctx.me.id,
          postId: input.postId,
          commentId: input.commentId,
        });
      }

      await publish(ctx.db, {
        universityId: p.universityId,
        kind: "post",
        postId: input.postId,
        authorId: ctx.me.id,
      });
      if (notifyUserId) {
        await publish(ctx.db, {
          universityId: p.universityId,
          kind: "notification",
          userId: notifyUserId,
        });
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
