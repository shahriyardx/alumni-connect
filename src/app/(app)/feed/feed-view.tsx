"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { FeedList } from "@/components/feed-list";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { focusRing } from "@/components/ui/styles";
import { Tab, TabsList, TabsRoot } from "@/components/ui/tabs";
import { useMe } from "@/components/user-menu";
import { cn } from "@/lib/cn";
import { useNewPosts } from "@/lib/live";
import { useTRPC } from "@/lib/trpc";

export function FeedView() {
  const trpc = useTRPC();
  const router = useRouter();
  const sort = useSearchParams().get("sort") === "top" ? "top" : "new";
  const tags = useQuery(trpc.post.tags.queryOptions());
  const { me } = useMe();
  const qc = useQueryClient();
  const [newPosts, clearNewPosts] = useNewPosts();
  // Only count posts that arrive while the feed is on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on mount only
  useEffect(() => clearNewPosts(), []);

  return (
    <div className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
          <TabsRoot
            value={sort}
            onValueChange={(v) =>
              router.replace(v === "top" ? "/feed?sort=top" : "/feed")
            }
          >
            <TabsList>
              <Tab value="new">New</Tab>
              <Tab value="top">Top</Tab>
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
              "flex h-11 flex-1 items-center rounded-full bg-surface-high px-4 text-sm text-muted-foreground transition-colors hover:text-foreground",
            )}
          >
            Ask the alumni something…
          </Link>
          <ButtonLink
            href="/new"
            icon="edit"
            size="sm"
            className="max-sm:hidden"
          >
            Ask
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

        <FeedList
          key={sort}
          input={{ sort }}
          empty={
            <EmptyState
              icon="forum"
              title="No questions yet — be the first to ask."
              action={
                <ButtonLink href="/new" icon="edit">
                  Ask a question
                </ButtonLink>
              }
            />
          }
        />
      </div>

      <aside className="sticky top-20 hidden flex-col gap-3 self-start xl:flex">
        <Link
          href="/new"
          className="group relative isolate overflow-hidden rounded-[2rem] bg-primary p-6 text-white outline-none transition-[border-radius] duration-300 hover:rounded-[2.75rem] focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-violet-500/50 blur-3xl"
          />
          <Icon name="school" filled size={28} />
          <p className="mt-8 text-2xl leading-none font-bold tracking-tighter">
            Ask an
            <br />
            alumnus
          </p>
          <Icon
            name="arrow_forward"
            size={22}
            className="absolute right-6 bottom-6 transition-transform group-hover:translate-x-1"
          />
        </Link>

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
