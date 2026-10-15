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
    <div className="flex flex-col gap-5 pt-2">
      <label className="flex h-14 items-center gap-3 rounded-full bg-surface-container-high px-5 text-on-surface-variant transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_2px_var(--md-primary)]">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Search posts"
          // biome-ignore lint/a11y/noAutofocus: search is the page's only job
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search posts"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant"
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
        <EmptyState icon="travel_explore" title="Search posts" />
      )}
    </div>
  );
}
