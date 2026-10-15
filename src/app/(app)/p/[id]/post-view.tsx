"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthorLine } from "@/components/author-line";
import { CommentForm } from "@/components/comment-form";
import { CommentThread } from "@/components/comment-thread";
import { Markdown } from "@/components/markdown";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useTRPC } from "@/lib/trpc";

export function PostView({ id }: { id: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const post = useQuery(trpc.post.byId.queryOptions({ id }));
  const comments = useQuery(trpc.comment.list.queryOptions({ postId: id }));
  const remove = useMutation(
    trpc.post.remove.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries(trpc.post.pathFilter());
        toast.success("Post deleted");
        router.push("/feed");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (post.isError)
    return (
      <EmptyState
        icon="search_off"
        title="Post not found"
        body="It may have been removed, or the link is wrong."
        action={
          <ButtonLink href="/feed" variant="tonal" icon="arrow_back">
            Back to feed
          </ButtonLink>
        }
      />
    );
  if (!post.data)
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );

  const p = post.data;
  return (
    <article className="flex flex-col gap-5 py-4">
      <AuthorLine author={p.author} at={p.createdAt} />
      <h1 className="text-[clamp(24px,5vw,30px)] leading-tight font-semibold tracking-tight">
        {p.title}
      </h1>
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {p.tags.map((t) => (
            <Chip key={t} label={`#${t}`} href={`/t/${t}`} />
          ))}
        </div>
      )}
      <Markdown>{p.body}</Markdown>

      {p.attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {p.attachments.map((a) => (
            <a
              key={a.id}
              href={`/api/files/${a.key}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* biome-ignore lint/performance/noImgElement: auth-gated proxy, next/image can't optimise it */}
              <img
                src={`/api/files/${a.key}`}
                alt="Attachment"
                loading="lazy"
                className="aspect-square w-full rounded-[16px] bg-surface-container object-cover"
              />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Votes + bookmark land in Task 10. */}
        <div
          data-slot="post-actions"
          className="flex items-center gap-4 text-sm font-medium text-on-surface-variant"
        >
          <span className="flex items-center gap-1">
            <Icon name="arrow_upward" size={18} />
            {p.score}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="chat_bubble" size={18} />
            {p.commentCount}
          </span>
        </div>
        <div className="ml-auto">
          <Menu.Root>
            <Menu.Trigger
              render={<IconButton icon="more_vert" label="Post actions" />}
            />
            <MenuContent>
              {p.canEdit && (
                <MenuItem
                  icon="edit"
                  onClick={() => router.push(`/p/${p.id}/edit`)}
                >
                  Edit
                </MenuItem>
              )}
              {p.canEdit && (
                <MenuItem
                  icon="delete"
                  destructive
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </MenuItem>
              )}
              {/* Report dialog is wired in Task 12. */}
              <MenuItem
                icon="flag"
                onClick={() => toast.success("Reporting arrives soon")}
              >
                Report
              </MenuItem>
            </MenuContent>
          </Menu.Root>
        </div>
      </div>

      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Delete this post?"
          description="It will be removed from the feed for everyone. This can't be undone."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="text" />}>
              Cancel
            </Dialog.Close>
            <Button
              loading={remove.isPending}
              onClick={() => remove.mutate({ id: p.id })}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>

      <section aria-label="Comments" className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">
          {p.commentCount === 1 ? "1 reply" : `${p.commentCount} replies`}
        </h2>
        <CommentForm postId={p.id} />
        {comments.data ? (
          <CommentThread postId={p.id} comments={comments.data} />
        ) : (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        )}
      </section>
    </article>
  );
}
