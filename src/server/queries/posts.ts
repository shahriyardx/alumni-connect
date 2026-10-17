import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { type PostKind, post, type Role, user } from "@/db/schema";

export type AuthorInfo = {
  id: string;
  name: string;
  role: Role;
  batchNumber: number | null;
  department: string | null;
  avatarKey: string | null;
};

export type PostListItem = {
  id: string;
  kind: PostKind;
  title: string;
  excerpt: string;
  createdAt: Date;
  updatedAt: Date;
  score: number;
  commentCount: number;
  tags: string[];
  author: AuthorInfo;
  myVote: -1 | 0 | 1;
  bookmarked: boolean;
  hasAlumnusReply: boolean;
  acceptedCommentId: string | null;
  /** Non-image attachments on the post itself. */
  fileCount: number;
};

const excerptOf = (body: string) =>
  body.replace(/[#*_>`[\]()!]/g, "").slice(0, 240);

/**
 * True when a non-deleted comment by an ALUMNUS exists on this post.
 * Shared between the `hasAlumnusReply` select column below and
 * `post.search`'s `hasAlumniAnswer` filter (both query an unaliased `post`).
 */
export const hasAlumniReplySQL = sql<boolean>`exists (select 1 from comment c join "user" u on u.id = c.author_id and u.university_id = c.university_id where c.post_id = post.id and c.deleted_at is null and u.role = 'ALUMNUS')`;

/**
 * "Most relevant" score for the viewer: same department as the author, a
 * followed tag or author, a tag named after the viewer's department, plus a
 * little score and a recency decay (~3 days) so it doesn't go stale.
 * ponytail: computed per row at query time; precompute if the feed gets big.
 */
function relevanceSQL(meId: string, department: string | null) {
  const dept = department?.trim().toLowerCase() || null;
  return sql`(
    (case when ${dept}::text is not null and lower(${user.department}) = ${dept} then 3 else 0 end)
    + (case when exists (select 1 from follow_tag ft join post_tag pt on pt.tag_id = ft.tag_id where pt.post_id = post.id and ft.user_id = ${meId}) then 3 else 0 end)
    + (case when exists (select 1 from follow_user fu where fu.followee_id = post.author_id and fu.follower_id = ${meId}) then 3 else 0 end)
    + (case when ${dept}::text is not null and exists (select 1 from post_tag pt join tag t on t.id = pt.tag_id where pt.post_id = post.id and t.name = ${dept}) then 2 else 0 end)
    + least(greatest(${post.score}, 0), 20) / 10.0
    + 4 * exp(-extract(epoch from (now() - ${post.createdAt})) / 259200.0)
  )`;
}

export async function listPosts(
  tx: Tx,
  meId: string,
  opts: {
    where?: SQL;
    orderBy: "new" | "top" | "rank" | "relevant";
    rankQuery?: string;
    /** The viewer's department, for orderBy "relevant". */
    department?: string | null;
    offset: number;
    limit?: number;
  },
): Promise<{ items: PostListItem[]; nextCursor: number | null }> {
  const limit = opts.limit ?? 20;
  const order: SQL[] =
    opts.orderBy === "new"
      ? [desc(post.createdAt)]
      : opts.orderBy === "top"
        ? [desc(post.score), desc(post.createdAt)]
        : opts.orderBy === "relevant"
          ? [
              desc(relevanceSQL(meId, opts.department ?? null)),
              desc(post.createdAt),
            ]
          : [
              // Solved posts get a small boost over plain text rank.
              desc(
                sql`ts_rank(${post.search}, websearch_to_tsquery('english', ${opts.rankQuery ?? ""})) + (case when ${post.acceptedCommentId} is not null then 0.05 else 0 end)`,
              ),
            ];

  const rows = await tx
    .select({
      id: post.id,
      kind: post.kind,
      title: post.title,
      body: post.body,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      score: post.score,
      commentCount: post.commentCount,
      acceptedCommentId: post.acceptedCommentId,
      author: {
        id: user.id,
        name: user.name,
        role: user.role,
        batchNumber: user.batchNumber,
        department: user.department,
        avatarKey: user.avatarKey,
      },
      tags: sql<
        string[]
      >`coalesce((select array_agg(t.name order by t.name) from post_tag pt join tag t on t.id = pt.tag_id where pt.post_id = post.id), '{}')`,
      myVote: sql<
        number | null
      >`(select value from vote where target_type = 'POST' and target_id = post.id and user_id = ${meId})`,
      bookmarked: sql<boolean>`exists (select 1 from bookmark where post_id = post.id and user_id = ${meId})`,
      hasAlumnusReply: hasAlumniReplySQL,
      fileCount: sql<number>`(select count(*)::int from attachment a where a.post_id = post.id and a.kind = 'DOCUMENT')`,
    })
    .from(post)
    .innerJoin(
      user,
      and(eq(user.id, post.authorId), eq(user.universityId, post.universityId)),
    )
    .where(and(isNull(post.deletedAt), ...(opts.where ? [opts.where] : [])))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(opts.offset);

  const items: PostListItem[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    excerpt: excerptOf(r.body),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    score: r.score,
    commentCount: r.commentCount,
    tags: r.tags,
    author: r.author,
    myVote: (r.myVote ?? 0) as -1 | 0 | 1,
    bookmarked: !!r.bookmarked,
    hasAlumnusReply: !!r.hasAlumnusReply,
    acceptedCommentId: r.acceptedCommentId,
    fileCount: r.fileCount,
  }));

  return {
    items,
    nextCursor: rows.length > limit ? opts.offset + limit : null,
  };
}
