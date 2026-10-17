"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Alumnus = RouterOutputs["people"]["alumniInMyDepartment"]["items"][number];

function AlumniCard({ u }: { u: Alumnus }) {
  const askHref = `/new?${new URLSearchParams({
    ...(u.department ? { tag: u.department } : {}),
    mention: u.name,
  }).toString()}`;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <Link href={`/u/${u.id}`} className="flex items-center gap-3">
        <Avatar
          name={u.name}
          src={u.avatarKey ? `/api/files/${u.avatarKey}` : null}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold hover:underline">{u.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {u.title ? `${u.title} · ` : ""}
            {u.graduationYear ? `Class of ${u.graduationYear}` : u.department}
          </p>
        </div>
      </Link>
      <p className="text-xs text-muted-foreground">
        {u.answerCount} {u.answerCount === 1 ? "answer" : "answers"}
      </p>
      <ButtonLink href={askHref} variant="tonal" size="sm" icon="forum">
        Ask them
      </ButtonLink>
    </Card>
  );
}

export function AlumniView() {
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.people.alumniInMyDepartment.infiniteQueryOptions(
      {},
      {
        getNextPageParam: (last: { nextCursor: number | null }) =>
          last.nextCursor,
      },
    ),
  );
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = query;

  if (isLoading)
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  if (isError)
    return (
      <p className="py-16 text-center text-sm text-destructive">
        Couldn't load alumni. Try again in a moment.
      </p>
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0)
    return (
      <EmptyState
        icon="school"
        title="No alumni here yet"
        body="Once someone from your department graduates and joins, they'll show up here."
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((u) => (
          <AlumniCard key={u.id} u={u} />
        ))}
      </div>
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
