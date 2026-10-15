"use client";
import { useQuery } from "@tanstack/react-query";
import { FeedList } from "@/components/feed-list";
import { FollowButton } from "@/components/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge, VerifiedMark } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useTRPC } from "@/lib/trpc";

export function ProfileView({ id }: { id: string }) {
  const trpc = useTRPC();
  const toast = useToast();
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
    [u.postCount, u.postCount === 1 ? "post" : "posts"],
    [u.commentCount, u.commentCount === 1 ? "comment" : "comments"],
    [u.followers, u.followers === 1 ? "follower" : "followers"],
    [u.following, "following"],
  ] as const;

  return (
    <div className="flex flex-col gap-8 pt-6">
      <section className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Avatar
            name={u.name}
            src={u.avatarKey ? `/api/files/${u.avatarKey}` : null}
            size={80}
          />
          <div className="ml-auto flex items-center gap-1">
            {u.isMe ? (
              <ButtonLink href="/settings" variant="tonal" icon="edit">
                Edit profile
              </ButtonLink>
            ) : (
              <>
                <FollowButton userId={u.id} following={u.isFollowing} />
                <Menu.Root>
                  <Menu.Trigger
                    render={
                      <IconButton icon="more_vert" label="Profile actions" />
                    }
                  />
                  <MenuContent>
                    {/* Report dialog is wired in Task 12. */}
                    <MenuItem
                      icon="flag"
                      onClick={() => toast.success("Reporting arrives soon")}
                    >
                      Report user
                    </MenuItem>
                  </MenuContent>
                </Menu.Root>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{u.name}</h1>
            <VerifiedMark />
            <RoleBadge role={u.role} />
          </div>
          <p className="text-sm text-muted-foreground">
            Batch {u.batchYear} · {u.department}
          </p>
        </div>
        {u.bio && (
          <p className="text-sm leading-relaxed whitespace-pre-line">{u.bio}</p>
        )}
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {stats.map(([n, label]) => (
            <li key={label}>
              <span className="font-semibold text-foreground tabular-nums">
                {n}
              </span>{" "}
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Posts" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Posts</h2>
        <FeedList
          input={{ authorId: u.id }}
          empty={<EmptyState icon="forum" title="No posts yet" />}
        />
      </section>
    </div>
  );
}
