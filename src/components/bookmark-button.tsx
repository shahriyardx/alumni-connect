"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { IconButton } from "./ui/icon-button";
import { useToast } from "./ui/toast";

export function BookmarkButton({
  postId,
  bookmarked,
  className,
}: {
  postId: string;
  bookmarked: boolean;
  className?: string;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? bookmarked;
  const mutation = useMutation(
    trpc.social.bookmark.mutationOptions({
      onError: (e) => {
        setLocal(null);
        toast.error(e.message);
      },
      onSettled: async () => {
        await qc.invalidateQueries(trpc.post.pathFilter());
        await qc.invalidateQueries(trpc.social.bookmarks.pathFilter());
        setLocal(null);
      },
    }),
  );
  return (
    <IconButton
      icon="bookmark"
      label={on ? "Remove bookmark" : "Bookmark"}
      selected={on}
      onClick={() => {
        // One request in flight at a time: concurrent toggles can land out of order.
        if (mutation.isPending) return;
        setLocal(!on);
        mutation.mutate({ postId, on: !on });
      }}
      className={className}
    />
  );
}
