"use client";
import Link from "next/link";
import type { PostListItem } from "@/server/queries/posts";
import { AuthorLine } from "./author-line";
import { BookmarkButton } from "./bookmark-button";
import { Card } from "./ui/card";
import { Icon } from "./ui/icon";
import { useMe } from "./user-menu";
import { VoteButtons } from "./vote-buttons";

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium";

export function PostCard({ post }: { post: PostListItem }) {
  const { me } = useMe();
  return (
    <Card interactive className="flex flex-col gap-3 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <AuthorLine author={post.author} at={post.createdAt} size={36} />
        <BookmarkButton
          postId={post.id}
          bookmarked={post.bookmarked}
          className="relative z-10 -mt-1 -mr-2 size-9 shrink-0"
        />
      </div>

      <div className="flex flex-col gap-1">
        {/* Stretched link: the whole card opens the post; nested links sit above it. */}
        <Link
          href={`/p/${post.id}`}
          className="text-[17px] leading-snug font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {post.title}
        </Link>
        {post.excerpt && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}
      </div>

      <div
        data-slot="post-actions"
        className="flex flex-wrap items-center gap-2 text-muted-foreground"
      >
        <VoteButtons
          targetType="POST"
          targetId={post.id}
          score={post.score}
          myVote={post.myVote}
          disabled={me?.id === post.author.id}
          className="bg-surface-high"
        />
        <span className={`${pill} bg-surface-high`}>
          <Icon name="chat_bubble" size={16} />
          {post.commentCount}
        </span>
        {post.hasAlumnusReply && (
          <span className={`${pill} bg-tonal text-tonal-fg`}>
            <Icon name="school" size={16} filled />
            Alumni replied
          </span>
        )}
        {post.tags.length > 0 && (
          <span className="relative z-10 ml-auto flex flex-wrap gap-x-2.5 gap-y-1 text-xs max-sm:w-full max-sm:pt-1">
            {post.tags.slice(0, 3).map((t) => (
              <Link
                key={t}
                href={`/t/${t}`}
                className="rounded-full outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                #{t}
              </Link>
            ))}
          </span>
        )}
      </div>
    </Card>
  );
}
