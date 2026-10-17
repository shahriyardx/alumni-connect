"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

type TabValue = "new" | "relevant" | "top" | "announcements" | "unanswered";
const TAB_VALUES: TabValue[] = [
  "new",
  "relevant",
  "top",
  "announcements",
  "unanswered",
];

/** Newest announcements as a swipeable, auto-advancing slider. */
function AnnouncementStrip() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.post.announcements.queryOptions({ limit: 5 }));
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const items = data?.items ?? [];
  const n = items.length;

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  // Auto-advance; off when paused, single slide, or reduced motion.
  useEffect(() => {
    if (paused || n < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go((index + 1) % n), 6000);
    return () => clearInterval(t);
  }, [paused, n, index, go]);

  if (!n) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Announcements"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((a, i) => (
          <Link
            key={a.id}
            href={`/p/${a.id}`}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${a.title}`}
            className={cn(
              focusRing,
              "relative isolate flex w-full shrink-0 snap-start flex-col gap-2 overflow-hidden rounded-3xl bg-primary/10 p-5 pb-9 outline-none transition-colors hover:bg-primary/14 sm:p-6 sm:pr-28 sm:pb-9",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-10 -z-10 size-48 rounded-full bg-primary/15 blur-2xl"
            />
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
                <Icon name="campaign" size={13} filled />
                Announcement
              </span>
              <span className="font-medium text-foreground">
                {a.author.name}
              </span>
              <RoleBadge role={a.author.role} />
              <span>· {timeAgo(a.createdAt)}</span>
            </span>
            <span className="line-clamp-1 text-base font-semibold tracking-tight sm:text-lg">
              {a.title}
            </span>
            {a.excerpt && (
              <span className="line-clamp-2 text-sm text-muted-foreground">
                {a.excerpt}
              </span>
            )}
          </Link>
        ))}
      </div>

      {n > 1 && (
        <>
          <div className="absolute top-5 right-5 hidden items-center gap-1 sm:flex">
            {(["prev", "next"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={
                  dir === "prev" ? "Previous announcement" : "Next announcement"
                }
                onClick={() =>
                  go(dir === "prev" ? (index - 1 + n) % n : (index + 1) % n)
                }
                className={cn(
                  focusRing,
                  "grid size-8 cursor-pointer place-items-center rounded-full bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface",
                )}
              >
                <Icon
                  name={dir === "prev" ? "chevron_left" : "chevron_right"}
                  size={18}
                />
              </button>
            ))}
          </div>
          <div className="absolute right-5 bottom-4 flex gap-1.5 sm:right-6 sm:bottom-5">
            {items.map((a, i) => (
              <button
                key={a.id}
                type="button"
                aria-label={`Go to announcement ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-[width,background-color] duration-300",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-primary/30",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
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
      : tab === "relevant"
        ? { sort: "relevant" as const }
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
              <Tab value="relevant">Most relevant</Tab>
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

      {/* mt-14 = header row (h-10 tabs) + gap-4, so the rail lines up with the composer. */}
      <aside className="sticky top-6 mt-14 hidden flex-col gap-3 self-start xl:flex">
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
