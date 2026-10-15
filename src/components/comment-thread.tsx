"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { buildTree, type TreeNode } from "@/lib/comment-tree";
import { useTRPC } from "@/lib/trpc";
import type { CommentItem } from "@/server/routers/comment";
import { AuthorLine } from "./author-line";
import { CommentForm } from "./comment-form";
import { Markdown } from "./markdown";
import { ReportDialog } from "./report-dialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { useMe } from "./user-menu";
import { VoteButtons } from "./vote-buttons";

const MAX_DEPTH = 6;
type Node = TreeNode<CommentItem>;

export function CommentThread({
  postId,
  comments,
}: {
  postId: string;
  comments: CommentItem[];
}) {
  const roots = buildTree(comments);
  return (
    <div className="flex flex-col gap-1">
      {roots.map((n) => (
        <Comment key={n.id} node={n} depth={0} postId={postId} />
      ))}
    </div>
  );
}

function Comment({
  node,
  depth,
  postId,
  replyingTo,
}: {
  node: Node;
  depth: number;
  postId: string;
  replyingTo?: string;
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

  // Below MAX_DEPTH, replies stop indenting and render flat with a pointer.
  const nested = depth < MAX_DEPTH;
  const children = node.children.map((c) => (
    <Comment
      key={c.id}
      node={c}
      depth={nested ? depth + 1 : depth}
      postId={postId}
      replyingTo={nested ? undefined : (node.author?.name ?? "[removed]")}
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
              onClick={() => setMode(mode === "reply" ? "idle" : "reply")}
            >
              Reply
            </Button>
            {node.author && me?.id !== node.author.id && (
              <ReportDialog
                targetType="COMMENT"
                targetId={node.id}
                trigger={
                  <Button variant="ghost" size="sm" icon="flag">
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
