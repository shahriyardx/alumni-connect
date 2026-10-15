import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { post, type Role, user } from "@/db/schema";

export type AuthorInfo = {
  id: string;
  name: string;
  role: Role;
  batchYear: number;
  department: string;
  avatarKey: string | null;
};

export type PostListItem = {
  id: string;
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
};

const excerptOf = (body: string) =>
  body.replace(/[#*_>`[\]()!]/g, "").slice(0, 240);

export async function listPosts(
  tx: Tx,
  meId: string,
  opts: {
    where?: SQL;
    orderBy: "new" | "top" | "rank";
    rankQuery?: string;
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
        : [
            desc(
              sql`ts_rank(${post.search}, websearch_to_tsquery('english', ${opts.rankQuery ?? ""}))`,
            ),
          ];

  const rows = await tx
    .select({
      id: post.id,
      title: post.title,
      body: post.body,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      score: post.score,
      commentCount: post.commentCount,
      author: {
        id: user.id,
        name: user.name,
        role: user.role,
        batchYear: user.batchYear,
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
      hasAlumnusReply: sql<boolean>`exists (select 1 from comment c join "user" u on u.id = c.author_id where c.post_id = post.id and c.deleted_at is null and u.role = 'ALUMNUS')`,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .where(and(isNull(post.deletedAt), ...(opts.where ? [opts.where] : [])))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(opts.offset);

  const items: PostListItem[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
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
  }));

  return {
    items,
    nextCursor: rows.length > limit ? opts.offset + limit : null,
  };
}
