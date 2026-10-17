"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

/** A profile's follow/unfollow button (used on the user profile page). */
export function FollowButton({
  userId,
  following,
}: {
  userId: string;
  following: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? following;
  const follow = useMutation(
    trpc.social.followUser.mutationOptions({
      onError: (e) => {
        setLocal(null);
        toast.error(e.message);
      },
      onSettled: async () => {
        await qc.invalidateQueries(trpc.profile.get.pathFilter());
        setLocal(null);
      },
    }),
  );

  return (
    <Button
      variant={on ? "outlined" : "tonal"}
      icon={on ? "check" : "add"}
      aria-pressed={on}
      onClick={() => {
        // One request in flight at a time: concurrent toggles can land out of order.
        if (follow.isPending) return;
        setLocal(!on);
        follow.mutate({ userId, on: !on });
      }}
    >
      {on ? "Following" : "Follow"}
    </Button>
  );
}

type TagBellState = "none" | "notify" | "muted";

const tagBellStateOf = (row: { notify: boolean } | undefined): TagBellState =>
  !row ? "none" : row.notify ? "notify" : "muted";

/** Clicking the bell cycles: unfollowed -> follow+notify -> follow muted -> unfollowed. */
const nextTagBellState: Record<TagBellState, TagBellState> = {
  none: "notify",
  notify: "muted",
  muted: "none",
};

const TAG_BELL: Record<
  TagBellState,
  { variant: "tonal" | "outlined"; icon: string; label: string }
> = {
  none: { variant: "tonal", icon: "add", label: "Follow" },
  notify: { variant: "outlined", icon: "notifications", label: "Notifying" },
  muted: { variant: "outlined", icon: "notifications_off", label: "Muted" },
};

/**
 * Tag page header: a single bell button cycling through the tag's three
 * follow states (unfollowed / following+notified / following but muted).
 */
export function TagBell({ tag }: { tag: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<TagBellState | null>(null);
  const tags = useQuery(trpc.social.followedTags.queryOptions());
  const follow = useMutation(
    trpc.social.followTag.mutationOptions({
      onError: (e) => {
        setLocal(null);
        toast.error(e.message);
      },
      onSettled: async () => {
        await qc.invalidateQueries(trpc.social.followedTags.pathFilter());
        setLocal(null);
      },
    }),
  );

  if (!tags.data) return null;
  const state = local ?? tagBellStateOf(tags.data.find((t) => t.name === tag));
  const { variant, icon, label } = TAG_BELL[state];

  return (
    <Button
      variant={variant}
      icon={icon}
      aria-label={`${label} — click to change`}
      onClick={() => {
        if (follow.isPending) return;
        const next = nextTagBellState[state];
        setLocal(next);
        follow.mutate({ tag, on: next !== "none", notify: next === "notify" });
      }}
    >
      {label}
    </Button>
  );
}
