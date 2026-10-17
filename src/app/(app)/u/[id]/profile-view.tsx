"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAccountStatusActions } from "@/components/account-status-actions";
import { FeedList } from "@/components/feed-list";
import { FollowButton } from "@/components/follow-button";
import { ReportDialog } from "@/components/report-dialog";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge, VerifiedMark } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/lib/trpc";

export function ProfileView({ id }: { id: string }) {
  const trpc = useTRPC();
  const profile = useQuery(trpc.profile.get.queryOptions({ id }));

  if (profile.isError)
    return (
      <EmptyState
        icon="person_off"
        title="Profile not found"
        body="This person isn't part of your university, or the link is wrong."
      />
    );
  if (!profile.data)
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );

  const u = profile.data;
  const stats = [
    [u.postCount, u.postCount === 1 ? "Post" : "Posts", "forum"],
    [u.commentCount, u.commentCount === 1 ? "Reply" : "Replies", "chat"],
    [u.followers, u.followers === 1 ? "Follower" : "Followers", "group"],
    [u.following, "Following", "person_add"],
  ] as const;
  const meta = [
    u.department,
    u.batchNumber != null && `Batch ${u.batchNumber}`,
    u.graduationYear != null && `Class of ${u.graduationYear}`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3 pt-4">
      {/* Hero: brand banner with the avatar overlapping its edge. */}
      <section className="overflow-hidden rounded-[2rem] bg-surface">
        <div
          aria-hidden
          className="relative isolate h-28 overflow-hidden bg-primary sm:h-36 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]"
        >
          <div className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-violet-500/50 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-10 -z-10 h-48 w-80 rounded-full bg-cyan-400/30 blur-3xl" />
        </div>
        <div className="px-5 pb-6 sm:px-7">
          <div className="relative z-10 -mt-12 flex items-end gap-3 sm:-mt-14">
            <Avatar
              name={u.name}
              src={u.avatarKey ? `/api/files/${u.avatarKey}` : null}
              size={96}
              className="shrink-0 ring-4 ring-[var(--surface-1)]"
            />
            <div className="ml-auto flex items-center gap-1 pb-1">
              {u.isMe ? (
                <ButtonLink href="/settings" variant="tonal" icon="edit">
                  Edit profile
                </ButtonLink>
              ) : (
                <OtherUserActions u={u} />
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {u.name}
              </h1>
              <VerifiedMark />
              <RoleBadge role={u.role} title={u.title} />
            </div>
            {meta.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {meta.map((m, i) => (
                  <span key={m} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden>·</span>}
                    {m}
                  </span>
                ))}
              </p>
            )}
            {u.bio ? (
              <p className="mt-2 max-w-prose text-sm leading-relaxed whitespace-pre-line">
                {u.bio}
              </p>
            ) : (
              u.isMe && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Add a short bio so students know what to ask you.
                </p>
              )
            )}
          </div>
        </div>
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([n, label, icon]) => (
          <li
            key={label}
            className="flex flex-col gap-3 rounded-3xl bg-surface p-4 sm:p-5"
          >
            <Icon name={icon} size={20} className="text-primary" />
            <span>
              <span className="block text-2xl font-bold tracking-tight tabular-nums">
                {n}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </span>
          </li>
        ))}
      </ul>

      <section aria-label="Posts" className="mt-5 flex flex-col gap-3">
        <h2 className="px-1 text-lg font-semibold tracking-tight">Posts</h2>
        <FeedList
          input={{ authorId: u.id }}
          empty={
            <EmptyState
              icon="forum"
              title="No posts yet"
              body={
                u.isMe
                  ? "Your questions and announcements show up here."
                  : undefined
              }
            />
          }
        />
      </section>
    </div>
  );
}

/** Follow + overflow menu (report; suspend/ban/restore for mods). */
function OtherUserActions({
  u,
}: {
  u: { id: string; name: string; isFollowing: boolean } & {
    moderation: {
      status: string;
      suspendedUntil: Date | string | null;
    } | null;
  };
}) {
  const [reporting, setReporting] = useState(false);
  // Hook lives out here, not in the menu: menu items unmount on close and
  // would take their dialogs with them.
  const mod = useAccountStatusActions({
    ...u,
    status: u.moderation?.status ?? "PENDING",
    suspendedUntil: u.moderation?.suspendedUntil,
  });
  return (
    <>
      <FollowButton userId={u.id} following={u.isFollowing} />
      <Menu.Root>
        <Menu.Trigger
          render={<IconButton icon="more_vert" label="Profile actions" />}
        />
        <MenuContent>
          <MenuItem icon="flag" onClick={() => setReporting(true)}>
            Report user
          </MenuItem>
          {u.moderation && mod.items}
        </MenuContent>
      </Menu.Root>
      <ReportDialog
        targetType="USER"
        targetId={u.id}
        open={reporting}
        onOpenChange={setReporting}
      />
      {mod.dialogs}
    </>
  );
}
