"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { timeAgo } from "@/components/author-line";
import { FeedList } from "@/components/feed-list";
import { FeedRail } from "@/components/feed-rail";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { focusRing } from "@/components/ui/styles";
import { Tab, TabsList, TabsRoot } from "@/components/ui/tabs";
import { useMe } from "@/components/user-menu";
import { isStaff } from "@/db/schema";
import { cn } from "@/lib/cn";
import { useNewPosts } from "@/lib/live";
import { useTRPC } from "@/lib/trpc";

type TabValue = "new" | "top" | "announcements" | "unanswered";
const TAB_VALUES: TabValue[] = ["new", "top", "announcements", "unanswered"];

function AnnouncementStrip() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.post.announcements.queryOptions({ limit: 3 }));
  if (!data?.items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {data.items.map((a) => (
        <Link
          key={a.id}
          href={`/p/${a.id}`}
          className={cn(
            focusRing,
            "flex items-start gap-3 rounded-2xl bg-primary/8 p-4 outline-none transition-colors hover:bg-primary/12",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Icon name="campaign" size={18} filled />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {a.author.name}
              </span>
              <RoleBadge role={a.author.role} />
              <span>· {timeAgo(a.createdAt)}</span>
            </span>
            <span className="truncate text-sm font-semibold">{a.title}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function FeedView() {
  const trpc = useTRPC();
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const tags = useQuery(trpc.post.tags.queryOptions());
  const { me } = useMe();
  const qc = useQueryClient();
  const [newPosts, clearNewPosts] = useNewPosts();
  // Only count posts that arrive while the feed is on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on mount only
  useEffect(() => clearNewPosts(), []);

  const staff = !!me && isStaff(me.role);
  const showUnansweredTab = staff || me?.role === "ALUMNUS";
  const requested: TabValue = TAB_VALUES.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : "new";
  const tab: TabValue =
    requested === "unanswered" && !showUnansweredTab ? "new" : requested;
  const feedInput =
    tab === "top"
      ? { sort: "top" as const }
      : tab === "announcements"
        ? { sort: "new" as const, kind: "ANNOUNCEMENT" as const }
        : tab === "unanswered"
          ? { sort: "new" as const, unanswered: true }
          : { sort: "new" as const };

  const empty =
    tab === "announcements" ? (
      <EmptyState icon="campaign" title="No announcements yet" />
    ) : tab === "unanswered" ? (
      <EmptyState icon="task_alt" title="No unanswered questions" />
    ) : staff ? (
      <EmptyState icon="forum" title="No posts yet" />
    ) : (
      <EmptyState
        icon="forum"
        title="No questions yet — be the first to ask."
        action={
          <ButtonLink href="/new" icon="edit">
            Ask a question
          </ButtonLink>
        }
      />
    );

  return (
    <div className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
          <TabsRoot
            value={tab}
            onValueChange={(v) =>
              router.replace(v === "new" ? "/feed" : `/feed?tab=${v}`)
            }
          >
            <TabsList>
              <Tab value="new">New</Tab>
              <Tab value="top">Top</Tab>
              <Tab value="announcements">Announcements</Tab>
              {showUnansweredTab && <Tab value="unanswered">Unanswered</Tab>}
            </TabsList>
          </TabsRoot>
        </header>

        <Card className="flex items-center gap-3 p-3 pr-4">
          {me ? (
            <Avatar
              name={me.name}
              src={me.avatarKey ? `/api/files/${me.avatarKey}` : null}
              size={40}
            />
          ) : (
            // Same box on server and first client paint: no hydration mismatch.
            <span
              aria-hidden
              className="size-10 shrink-0 rounded-full bg-surface-high"
            />
          )}
          <Link
            href="/new"
            className={cn(
              focusRing,
              "flex h-11 flex-1 items-center gap-2 rounded-full bg-surface-high px-4 text-sm text-muted-foreground transition-colors hover:text-foreground",
            )}
          >
            {staff && <Icon name="campaign" size={18} />}
            {staff ? "Post an announcement…" : "Ask the alumni something…"}
          </Link>
          <ButtonLink
            href="/new"
            icon={staff ? "campaign" : "edit"}
            size="sm"
            className="max-sm:hidden"
          >
            {staff ? "Announce" : "Ask"}
          </ButtonLink>
        </Card>
        {newPosts > 0 && (
          <button
            type="button"
            onClick={() => {
              clearNewPosts();
              window.scrollTo({ top: 0, behavior: "smooth" });
              void qc.invalidateQueries(trpc.post.feed.pathFilter());
            }}
            className={cn(
              focusRing,
              "sticky top-16 z-30 -my-1 flex h-9 animate-rise self-center cursor-pointer items-center gap-1.5 rounded-full bg-tonal pr-4 pl-3 text-sm font-medium text-tonal-fg shadow-md shadow-black/10 transition-[background-color,scale] duration-150 hover:bg-tonal-hover active:scale-[0.97]",
            )}
          >
            <Icon name="arrow_upward" size={18} />
            {newPosts === 1 ? "1 new post" : `${newPosts} new posts`}
          </button>
        )}

        <AnnouncementStrip />

        <FeedRail variant="row" />

        {!!tags.data?.length && (
          <nav
            aria-label="Trending tags"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] min-[840px]:mx-0 min-[840px]:px-0 xl:hidden"
          >
            {tags.data.slice(0, 12).map((t) => (
              <Chip
                key={t.name}
                label={`#${t.name} · ${t.count}`}
                href={`/t/${t.name}`}
              />
            ))}
          </nav>
        )}

        <FeedList key={tab} input={feedInput} empty={empty} />
      </div>

      <aside className="sticky top-20 hidden flex-col gap-3 self-start xl:flex">
        <FeedRail variant="aside" />

        {!!tags.data?.length && (
          <Card className="p-2">
            <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">Trending</h2>
            <nav aria-label="Trending tags" className="flex flex-col">
              {tags.data.slice(0, 8).map((t) => (
                <Link
                  key={t.name}
                  href={`/t/${t.name}`}
                  className={cn(
                    focusRing,
                    "flex items-center justify-between rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-surface-high",
                  )}
                >
                  <span className="truncate">#{t.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t.count}
                  </span>
                </Link>
              ))}
            </nav>
          </Card>
        )}
      </aside>
    </div>
  );
}
