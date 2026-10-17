"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { IconButton } from "./ui/icon-button";
import { useToast } from "./ui/toast";

/** Bell on a post: get notified about every new comment. */
export function FollowPostButton({
  postId,
  following,
}: {
  postId: string;
  following: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? following;
  const mutation = useMutation(
    trpc.social.followPost.mutationOptions({
      onSuccess: (r) =>
        toast.success(
          r.following
            ? "You'll be notified about new comments"
            : "Unfollowed this post",
        ),
      onError: (e) => {
        setLocal(null);
        toast.error(e.message);
      },
      onSettled: async () => {
        await qc.invalidateQueries(trpc.post.byId.pathFilter());
        setLocal(null);
      },
    }),
  );
  return (
    <IconButton
      icon={on ? "notifications_active" : "notifications"}
      label={on ? "Unfollow post" : "Follow post"}
      selected={on}
      onClick={() => {
        if (mutation.isPending) return;
        setLocal(!on);
        mutation.mutate({ postId, on: !on });
      }}
    />
  );
}
