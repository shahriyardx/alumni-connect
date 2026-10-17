"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { isMod } from "@/db/schema";
import { useTRPC } from "@/lib/trpc";
import type { PostListItem } from "@/server/queries/posts";
import { AuthorLine } from "./author-line";
import { BookmarkButton } from "./bookmark-button";
import { AnnouncementBadge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent } from "./ui/dialog";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";
import { Menu, MenuContent, MenuItem } from "./ui/menu";
import { useToast } from "./ui/toast";
import { useMe } from "./user-menu";
import { VoteButtons } from "./vote-buttons";

const pill =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium";

export function PostCard({ post }: { post: PostListItem }) {
  const { me } = useMe();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation(
    trpc.post.remove.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries(trpc.post.pathFilter());
        toast.success("Post removed");
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => setConfirmDelete(false),
    }),
  );
  const announcement = post.kind === "ANNOUNCEMENT";
  const canModerate = !!me && isMod(me.role);

  return (
    <Card interactive className="flex flex-col gap-3 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <AuthorLine author={post.author} at={post.createdAt} size={36} />
        <div className="relative z-10 -mt-1 -mr-2 flex shrink-0 items-center">
          <BookmarkButton postId={post.id} bookmarked={post.bookmarked} />
          {canModerate && (
            <Menu.Root>
              <Menu.Trigger
                render={<IconButton icon="more_vert" label="Moderate post" />}
              />
              <MenuContent>
                <MenuItem
                  icon="delete"
                  destructive
                  onClick={() => setConfirmDelete(true)}
                >
                  Remove post
                </MenuItem>
              </MenuContent>
            </Menu.Root>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {announcement && <AnnouncementBadge />}
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
        {!announcement && (
          <VoteButtons
            targetType="POST"
            targetId={post.id}
            score={post.score}
            myVote={post.myVote}
            disabled={me?.id === post.author.id}
            className="bg-surface-high"
          />
        )}
        <span className={`${pill} bg-surface-high`}>
          <Icon name="chat_bubble" size={16} />
          {post.commentCount}
        </span>
        {post.acceptedCommentId ? (
          <span
            className={`${pill} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}
          >
            <Icon name="check_circle" filled size={16} />
            Solved
          </span>
        ) : (
          post.hasAlumnusReply && (
            <span
              className={`${pill} border border-border text-muted-foreground`}
            >
              <Icon name="school" size={16} />
              Alumni replied
            </span>
          )
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

      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Remove this ${announcement ? "announcement" : "post"}?`}
          description="It will be removed from the feed for everyone. This can't be undone."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate({ id: post.id })}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </Card>
  );
}
