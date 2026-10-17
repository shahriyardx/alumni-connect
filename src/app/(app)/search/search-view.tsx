"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FeedList } from "@/components/feed-list";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { useTRPC } from "@/lib/trpc";

const RANGE_ITEMS = [
  { value: "any", label: "Any time" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
] as const;
const KIND_ITEMS = [
  { value: "", label: "All kinds" },
  { value: "QUESTION", label: "Questions" },
  { value: "ANNOUNCEMENT", label: "Announcements" },
] as const;

export function SearchView() {
  const router = useRouter();
  const trpc = useTRPC();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [value, setValue] = useState(q);
  const tags = useQuery(trpc.post.tags.queryOptions());
  const departments = useQuery(trpc.departments.list.queryOptions());

  const tag = params.get("tag") ?? "";
  const department = params.get("department") ?? "";
  const kind = params.get("kind") ?? "";
  const range = (params.get("range") ??
    "any") as (typeof RANGE_ITEMS)[number]["value"];
  const solved = params.get("solved") === "1";
  const alumni = params.get("alumni") === "1";

  const setParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(params);
    if (!val) next.delete(key);
    else next.set(key, val);
    const qs = next.toString();
    router.replace(qs ? `/search?${qs}` : "/search");
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: setParam is stable in effect; only value/q should retrigger it
  useEffect(() => {
    const next = value.trim();
    if (next === q) return;
    const t = setTimeout(() => setParam("q", next || null), 300);
    return () => clearTimeout(t);
  }, [value, q]);

  const searchInput = {
    q,
    ...(tag && { tag }),
    ...(department && { department }),
    ...(kind && { kind: kind as "QUESTION" | "ANNOUNCEMENT" }),
    ...(range !== "any" && { range }),
    ...(solved && { solved: true }),
    ...(alumni && { hasAlumniAnswer: true }),
  };

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
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Kind"
              hideLabel
              value={kind}
              onValueChange={(v) => setParam("kind", v || null)}
              items={KIND_ITEMS}
              className="w-auto"
            />
            {!!tags.data?.length && (
              <Select
                label="Tag"
                hideLabel
                value={tag}
                onValueChange={(v) => setParam("tag", v || null)}
                items={[
                  { value: "", label: "All tags" },
                  ...tags.data.map((t) => ({
                    value: t.name,
                    label: `#${t.name}`,
                  })),
                ]}
                className="w-auto"
              />
            )}
            {!!departments.data?.length && (
              <Select
                label="Department"
                hideLabel
                value={department}
                onValueChange={(v) => setParam("department", v || null)}
                items={[
                  { value: "", label: "All departments" },
                  ...departments.data.map((d) => ({ value: d, label: d })),
                ]}
                className="w-auto"
              />
            )}
            <Select
              label="Date"
              hideLabel
              value={range}
              onValueChange={(v) => setParam("range", v === "any" ? null : v)}
              items={RANGE_ITEMS}
              className="w-auto"
            />
            <Chip
              label="Solved"
              icon="check_circle"
              selected={solved}
              onClick={() => setParam("solved", solved ? null : "1")}
            />
            <Chip
              label="Alumni answered"
              icon="school"
              selected={alumni}
              onClick={() => setParam("alumni", alumni ? null : "1")}
            />
          </div>
          <FeedList
            key={JSON.stringify(searchInput)}
            input={searchInput}
            empty={
              <EmptyState
                icon="search_off"
                title={`Nothing matches “${q}”`}
                body="Try fewer or different words, or clear a filter."
              />
            }
          />
        </>
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
