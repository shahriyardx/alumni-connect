"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FeedList } from "@/components/feed-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

export function SearchView() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const [value, setValue] = useState(q);

  useEffect(() => {
    const next = value.trim();
    if (next === q) return;
    const t = setTimeout(
      () =>
        router.replace(
          next ? `/search?q=${encodeURIComponent(next)}` : "/search",
        ),
      300,
    );
    return () => clearTimeout(t);
  }, [value, q, router]);

  return (
    <div className="flex flex-col gap-5 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <label className="flex h-11 items-center gap-2.5 rounded-full border border-input bg-surface px-4 text-muted-foreground transition-[box-shadow,border-color] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Icon name="search" size={20} />
        <input
          type="search"
          aria-label="Search posts"
          // biome-ignore lint/a11y/noAutofocus: search is the page's only job
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search posts"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </label>
      {q ? (
        <FeedList
          key={q}
          input={{ q }}
          empty={
            <EmptyState
              icon="search_off"
              title={`Nothing matches “${q}”`}
              body="Try fewer or different words."
            />
          }
        />
      ) : (
        <EmptyState
          icon="travel_explore"
          title="What are you looking for?"
          body="Try a course, a company or a supervisor."
        />
      )}
    </div>
  );
}
