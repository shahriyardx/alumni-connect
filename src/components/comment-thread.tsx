"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { buildTree, type TreeNode } from "@/lib/comment-tree";
import { useTRPC } from "@/lib/trpc";
import type { CommentItem } from "@/server/routers/comment";
import { AttachmentList } from "./attachments";
import { AuthorLine } from "./author-line";
import { CommentForm } from "./comment-form";
import { Markdown } from "./markdown";
import { ReportDialog } from "./report-dialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Icon } from "./ui/icon";
import { useToast } from "./ui/toast";
import { useMe } from "./user-menu";
import { VoteButtons } from "./vote-buttons";

const MAX_DEPTH = 6;
type Node = TreeNode<CommentItem>;

export function CommentThread({
  postId,
  comments,
  isQuestion,
  isAuthor,
  acceptedCommentId,
}: {
  postId: string;
  comments: CommentItem[];
  isQuestion: boolean;
  isAuthor: boolean;
  acceptedCommentId: string | null;
}) {
  const roots = buildTree(comments);
  // Pin the accepted reply first among top-level replies.
  const ordered = acceptedCommentId
    ? [...roots].sort((a, b) =>
        a.id === acceptedCommentId ? -1 : b.id === acceptedCommentId ? 1 : 0,
      )
    : roots;
  const canAccept = isQuestion && isAuthor;
  return (
    <div className="flex flex-col gap-1">
      {ordered.map((n) => (
        <Comment
          key={n.id}
          node={n}
          depth={0}
          postId={postId}
          canAccept={canAccept}
          accepted={n.id === acceptedCommentId}
        />
      ))}
    </div>
  );
}

function Comment({
  node,
  depth,
  postId,
  replyingTo,
  canAccept,
  accepted,
}: {
  node: Node;
  depth: number;
  postId: string;
  replyingTo?: string;
  canAccept: boolean;
  accepted: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useMe();
  const [mode, setMode] = useState<"idle" | "reply" | "edit">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation(
    trpc.comment.remove.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries(trpc.comment.list.queryFilter({ postId }));
        void qc.invalidateQueries(trpc.post.pathFilter());
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const accept = useMutation(
    trpc.post.accept.mutationOptions({
      onSuccess: () => void qc.invalidateQueries(trpc.post.pathFilter()),
      onError: (e) => toast.error(e.message),
    }),
  );

  // Below MAX_DEPTH, replies stop indenting and render flat with a pointer.
  const nested = depth < MAX_DEPTH;
  const children = node.children.map((c) => (
    <Comment
      key={c.id}
      node={c}
      depth={nested ? depth + 1 : depth}
      postId={postId}
      replyingTo={nested ? undefined : (node.author?.name ?? "[removed]")}
      canAccept={false}
      accepted={false}
    />
  ));
  const alumnus = node.author?.role === "ALUMNUS";

  return (
    <>
      <article
        id={`c-${node.id}`}
        className={cn(
          "flex flex-col gap-2 rounded-2xl py-3 pr-2 pl-3",
          alumnus && "bg-tonal/40",
        )}
      >
        {replyingTo && (
          <span className="text-xs font-medium text-muted-foreground">
            ↳ replying to {replyingTo}
          </span>
        )}
        {node.author ? (
          <AuthorLine author={node.author} at={node.createdAt} size={32} />
        ) : (
          <span className="text-sm text-muted-foreground">Removed comment</span>
        )}
        {accepted && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Icon name="check_circle" filled size={14} />
            Accepted
          </span>
        )}
        {mode === "edit" ? (
          <CommentForm
            postId={postId}
            editing={{ id: node.id, body: node.body }}
            autoFocus
            onDone={() => setMode("idle")}
          />
        ) : (
          <Markdown
            className={cn(
              "text-sm",
              node.deleted && "text-muted-foreground italic",
            )}
          >
            {node.body}
          </Markdown>
        )}
        {mode !== "edit" && <AttachmentList items={node.attachments} />}
        {!node.deleted && mode !== "edit" && (
          <div className="-ml-2 flex flex-wrap items-center gap-0.5 text-sm">
            <VoteButtons
              targetType="COMMENT"
              targetId={node.id}
              score={node.score}
              myVote={node.myVote}
              disabled={me?.id === node.author?.id}
              className="mr-1"
            />
            <Button
              variant="ghost"
              size="sm"
              icon="reply"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "reply" ? "idle" : "reply")}
            >
              Reply
            </Button>
            {canAccept && (
              <Button
                variant="ghost"
                size="sm"
                icon={accepted ? "cancel" : "check_circle"}
                className={
                  accepted
                    ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "text-muted-foreground hover:text-foreground"
                }
                loading={accept.isPending}
                onClick={() =>
                  accept.mutate({
                    postId,
                    commentId: accepted ? null : node.id,
                  })
                }
              >
                {accepted ? "Unaccept" : "Accept"}
              </Button>
            )}
            {node.author && me?.id !== node.author.id && (
              <ReportDialog
                targetType="COMMENT"
                targetId={node.id}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="flag"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Report
                  </Button>
                }
              />
            )}
            {node.canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("edit")}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="delete"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
                <Dialog.Root
                  open={confirmDelete}
                  onOpenChange={setConfirmDelete}
                >
                  <DialogContent
                    title="Delete this comment?"
                    description="Replies stay visible under a removed placeholder. This can't be undone."
                  >
                    <div className="flex justify-end gap-2">
                      <Dialog.Close render={<Button variant="ghost" />}>
                        Cancel
                      </Dialog.Close>
                      <Button
                        variant="destructive"
                        loading={remove.isPending}
                        onClick={() =>
                          remove.mutate(
                            { id: node.id },
                            { onSettled: () => setConfirmDelete(false) },
                          )
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog.Root>
              </>
            )}
          </div>
        )}
        {mode === "reply" && (
          <CommentForm
            postId={postId}
            parentId={node.id}
            autoFocus
            onDone={() => setMode("idle")}
          />
        )}
      </article>
      {children.length > 0 &&
        (nested ? (
          <div className="ml-2 flex flex-col gap-1 border-l border-border pl-1 sm:ml-5 sm:pl-3">
            {children}
          </div>
        ) : (
          children
        ))}
    </>
  );
}
