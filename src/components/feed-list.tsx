"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/lib/trpc";
import { PostCard } from "./post-card";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type FeedInput =
  | { sort?: "new" | "top"; tag?: string; authorId?: string }
  | { q: string };

export function FeedList({
  input,
  empty,
}: {
  input: FeedInput;
  empty: React.ReactNode;
}) {
  const trpc = useTRPC();
  const next = {
    getNextPageParam: (l: { nextCursor: number | null }) => l.nextCursor,
  };
  const query = useInfiniteQuery(
    "q" in input
      ? trpc.post.search.infiniteQueryOptions(input, next)
      : trpc.post.feed.infiniteQueryOptions(input, next),
  );
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = query;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading)
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  if (isError)
    return (
      <p className="py-16 text-center text-sm text-destructive">
        Couldn't load posts. Try again in a moment.
      </p>
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      <div ref={sentinel} />
      {hasNextPage && (
        <Button
          variant="tonal"
          className="self-center"
          loading={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
