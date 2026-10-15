"use client";
import Link from "next/link";
import type { PostListItem } from "@/server/queries/posts";
import { AuthorLine } from "./author-line";
import { Card } from "./ui/card";
import { Chip } from "./ui/chip";
import { Icon } from "./ui/icon";

export function PostCard({ post }: { post: PostListItem }) {
  return (
    <Card variant="filled" interactive className="flex flex-col gap-3 p-5">
      <AuthorLine author={post.author} at={post.createdAt} size={36} />
      {/* Stretched link: the whole card opens the post; nested links sit above it. */}
      <Link
        href={`/p/${post.id}`}
        className="text-lg leading-snug font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:outline-2 focus-visible:after:outline-primary"
      >
        {post.title}
      </Link>
      {post.excerpt && (
        <p className="line-clamp-3 text-sm text-on-surface-variant">
          {post.excerpt}
        </p>
      )}
      {post.tags.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <Chip key={t} label={`#${t}`} href={`/t/${t}`} />
          ))}
        </div>
      )}
      <div
        data-slot="post-actions"
        className="flex items-center gap-4 text-sm font-medium text-on-surface-variant"
      >
        <span className="flex items-center gap-1">
          <Icon name="arrow_upward" size={18} />
          {post.score}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="chat_bubble" size={18} />
          {post.commentCount}
        </span>
        {post.hasAlumnusReply && (
          <span className="flex items-center gap-1 text-tertiary">
            <Icon name="school" size={16} filled />
            Alumni replied
          </span>
        )}
      </div>
    </Card>
  );
}
