"use client";
import Link from "next/link";
import type { PostListItem } from "@/server/queries/posts";
import { AuthorLine } from "./author-line";
import { Card } from "./ui/card";
import { Chip } from "./ui/chip";
import { Icon } from "./ui/icon";

export function PostCard({ post }: { post: PostListItem }) {
  return (
    <Card interactive className="flex flex-col gap-2.5 p-5">
      <AuthorLine author={post.author} at={post.createdAt} size={32} />
      {/* Stretched link: the whole card opens the post; nested links sit above it. */}
      <Link
        href={`/p/${post.id}`}
        className="text-base leading-snug font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        {post.title}
      </Link>
      {post.excerpt && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {post.excerpt}
        </p>
      )}
      {post.tags.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Chip key={t} label={`#${t}`} href={`/t/${t}`} />
          ))}
        </div>
      )}
      <div
        data-slot="post-actions"
        className="mt-0.5 flex items-center gap-4 text-xs font-medium text-muted-foreground"
      >
        <span className="flex items-center gap-1">
          <Icon name="arrow_upward" size={16} />
          {post.score}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="chat_bubble" size={16} />
          {post.commentCount}
        </span>
        {post.hasAlumnusReply && (
          <span className="flex items-center gap-1 text-primary">
            <Icon name="school" size={16} filled />
            Alumni replied
          </span>
        )}
      </div>
    </Card>
  );
}
