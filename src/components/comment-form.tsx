"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

/** New top-level comment, inline reply (parentId), or edit (editing). */
export function CommentForm({
  postId,
  parentId,
  editing,
  autoFocus,
  onDone,
}: {
  postId: string;
  parentId?: string;
  editing?: { id: string; body: string };
  autoFocus?: boolean;
  onDone?(): void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState(editing?.body ?? "");
  const opts = {
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries(trpc.comment.list.queryFilter({ postId }));
      void qc.invalidateQueries(trpc.post.pathFilter());
      onDone?.();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = useMutation(trpc.comment.create.mutationOptions(opts));
  const update = useMutation(trpc.comment.update.mutationOptions(opts));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    if (editing) update.mutate({ id: editing.id, body });
    else create.mutate({ postId, parentId, body });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        aria-label={editing ? "Edit comment" : parentId ? "Reply" : "Comment"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: opened on explicit Reply/Edit click
        autoFocus={autoFocus}
        rows={parentId || editing ? 3 : 4}
        maxLength={10000}
        placeholder={
          parentId ? "Write a reply…" : "Add to the discussion (Markdown works)"
        }
        className="block w-full resize-y rounded-[16px] bg-surface-container-highest px-4 py-3 text-[15px] leading-relaxed text-on-surface caret-primary outline-none transition-shadow duration-200 placeholder:text-on-surface-variant focus:shadow-[inset_0_0_0_2px_var(--md-primary)]"
      />
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button variant="text" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          icon={editing ? "check" : "send"}
          disabled={!body.trim()}
          loading={create.isPending || update.isPending}
        >
          {editing ? "Save" : parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
