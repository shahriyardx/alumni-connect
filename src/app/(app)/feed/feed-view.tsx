"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { FeedList } from "@/components/feed-list";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { focusRing } from "@/components/ui/styles";
import { Tab, TabsList, TabsRoot } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { useNewPosts } from "@/lib/live";
import { useTRPC } from "@/lib/trpc";

export function FeedView() {
  const trpc = useTRPC();
  const router = useRouter();
  const sort = useSearchParams().get("sort") === "top" ? "top" : "new";
  const tags = useQuery(trpc.post.tags.queryOptions());
  const qc = useQueryClient();
  const [newPosts, clearNewPosts] = useNewPosts();
  // Only count posts that arrive while the feed is on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on mount only
  useEffect(() => clearNewPosts(), []);

  return (
    <div className="flex flex-col gap-5 pt-4">
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
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] min-[840px]:mx-0 min-[840px]:flex-wrap min-[840px]:px-0"
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
  );
}
