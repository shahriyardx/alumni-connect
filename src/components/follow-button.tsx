"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

type Target = { userId: string } | { tag: string };

export function FollowButton({
  following,
  ...target
}: Target & { following: boolean }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? following;
  const opts = {
    onError: (e: { message: string }) => {
      setLocal(null);
      toast.error(e.message);
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries(trpc.profile.get.pathFilter()),
        qc.invalidateQueries(trpc.social.followedTags.pathFilter()),
      ]);
      setLocal(null);
    },
  };
  const user = useMutation(trpc.social.followUser.mutationOptions(opts));
  const tag = useMutation(trpc.social.followTag.mutationOptions(opts));

  return (
    <Button
      variant={on ? "outlined" : "tonal"}
      icon={on ? "check" : "add"}
      aria-pressed={on}
      onClick={() => {
        // One request in flight at a time: concurrent toggles can land out of order.
        if (user.isPending || tag.isPending) return;
        setLocal(!on);
        if ("userId" in target) user.mutate({ userId: target.userId, on: !on });
        else tag.mutate({ tag: target.tag, on: !on });
      }}
    >
      {on ? "Following" : "Follow"}
    </Button>
  );
}

/** Tag page header: looks up whether the viewer already follows `tag`. */
export function TagFollowButton({ tag }: { tag: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.social.followedTags.queryOptions());
  if (!data) return null;
  return <FollowButton tag={tag} following={data.includes(tag)} />;
}
