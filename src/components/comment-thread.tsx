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
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

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
  const [mode, setMode] = useState<"idle" | "reply" | "edit">("idle");
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
          "flex flex-col gap-2 rounded-[20px] py-3 pr-2 pl-3",
          alumnus && "border-l-4 border-tertiary-container",
        )}
      >
        {replyingTo && (
          <span className="text-xs font-medium text-on-surface-variant">
            ↳ replying to {replyingTo}
          </span>
        )}
        {node.author ? (
          <AuthorLine author={node.author} at={node.createdAt} size={32} />
        ) : (
          <span className="text-sm text-on-surface-variant">
            Removed comment
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
              "text-[15px]",
              node.deleted && "text-on-surface-variant italic",
            )}
          >
            {node.body}
          </Markdown>
        )}
        {!node.deleted && mode !== "edit" && (
          <div className="-ml-3 flex flex-wrap items-center gap-1 text-sm">
            {/* Votes land in Task 10. */}
            <span
              data-slot="comment-actions"
              className="px-3 font-medium text-on-surface-variant"
            >
              {node.score} pts
            </span>
            <Button
              variant="text"
              size="sm"
              icon="reply"
              onClick={() => setMode(mode === "reply" ? "idle" : "reply")}
            >
              Reply
            </Button>
            {node.canEdit && (
              <>
                <Button
                  variant="text"
                  size="sm"
                  icon="edit"
                  onClick={() => setMode("edit")}
                >
                  Edit
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  icon="delete"
                  loading={remove.isPending}
                  className="text-error!"
                  onClick={() => {
                    if (confirm("Delete this comment?"))
                      remove.mutate({ id: node.id });
                  }}
                >
                  Delete
                </Button>
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
          <div className="ml-2 flex flex-col gap-1 border-l border-outline-variant pl-1 sm:ml-5 sm:pl-3">
            {children}
          </div>
        ) : (
          children
        ))}
    </>
  );
}
