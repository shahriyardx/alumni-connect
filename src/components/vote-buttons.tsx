"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { IconButton, Tip } from "./ui/icon-button";
import { useToast } from "./ui/toast";

type Vote = -1 | 0 | 1;

export function VoteButtons({
  targetType,
  targetId,
  score,
  myVote,
  disabled,
  className,
}: {
  targetType: "POST" | "COMMENT";
  targetId: string;
  score: number;
  myVote: Vote;
  disabled?: boolean;
  className?: string;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  // Optimistic overlay on top of the server value; cleared once the
  // owning query has refetched (or on error, which rolls back).
  const [local, setLocal] = useState<{ score: number; myVote: Vote } | null>(
    null,
  );
  const cur = local ?? { score, myVote };

  const vote = useMutation(
    trpc.social.vote.mutationOptions({
      onError: (e) => {
        setLocal(null);
        toast.error(e.message);
      },
      onSuccess: (r) => setLocal({ score: r.score, myVote: r.myVote }),
      onSettled: async () => {
        await qc.invalidateQueries(
          targetType === "POST"
            ? trpc.post.pathFilter()
            : trpc.comment.list.pathFilter(),
        );
        if (targetType === "POST")
          await qc.invalidateQueries(trpc.social.bookmarks.pathFilter());
        setLocal(null);
      },
    }),
  );

  const cast = (dir: 1 | -1) => {
    // One request in flight at a time: concurrent votes can land out of order.
    if (vote.isPending) return;
    const next: Vote = cur.myVote === dir ? 0 : dir;
    setLocal({ score: cur.score - cur.myVote + next, myVote: next });
    vote.mutate({ targetType, targetId, value: next });
  };

  const group = (
    <span
      className={cn(
        "relative z-10 inline-flex items-center rounded-full",
        className,
      )}
    >
      <IconButton
        icon="arrow_upward"
        label="Upvote"
        selected={cur.myVote === 1}
        disabled={disabled}
        onClick={() => cast(1)}
        className="size-8"
      />
      <span
        key={cur.score}
        className={cn(
          "min-w-5 text-center text-xs font-semibold tabular-nums",
          local && "animate-pop",
          cur.myVote === 1 && "text-primary",
          cur.myVote === -1 && "text-destructive",
        )}
      >
        {cur.score}
      </span>
      <IconButton
        icon="arrow_downward"
        label="Downvote"
        selected={cur.myVote === -1}
        disabled={disabled}
        onClick={() => cast(-1)}
        className={cn("size-8", cur.myVote === -1 && "text-destructive")}
      />
    </span>
  );
  return disabled ? (
    <Tip
      label={
        targetType === "POST"
          ? "You can't vote on your own post"
          : "You can't vote on your own comment"
      }
    >
      {group}
    </Tip>
  ) : (
    group
  );
}
