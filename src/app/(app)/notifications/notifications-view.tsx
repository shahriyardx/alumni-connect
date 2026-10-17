"use client";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/components/author-line";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Item = RouterOutputs["notification"]["list"]["items"][number];

function Text({ n }: { n: Item }) {
  const title = (
    <span className="font-semibold">{n.post?.title ?? "a removed post"}</span>
  );
  const actor = <span className="font-semibold">{n.actor?.name}</span>;
  switch (n.type) {
    case "REPLY_POST":
      return (
        <>
          {actor} replied to your question {title}
        </>
      );
    case "REPLY_COMMENT":
      return (
        <>
          {actor} replied to your comment on {title}
        </>
      );
    case "FOLLOWED_USER_POST":
      return (
        <>
          {actor} posted {title}
        </>
      );
    case "FOLLOWED_TAG_POST":
      return <>New post in a tag you follow: {title}</>;
    case "ANNOUNCEMENT":
      return (
        <>
          {actor} posted an announcement: {title}
        </>
      );
    case "PLATFORM_ANNOUNCEMENT":
      return (
        <>
          <span className="mb-1 flex">
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary/15 pr-2 pl-1.5 text-xs font-medium text-primary">
              <Icon name="campaign" size={12} filled />
              Alumni Connect
            </span>
          </span>
          <span className="font-semibold">{n.broadcast?.title}</span>
          <span className="mt-0.5 block whitespace-pre-line text-muted-foreground">
            {n.broadcast?.body}
          </span>
        </>
      );
  }
}

export function NotificationsView() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const list = useInfiniteQuery(
    trpc.notification.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (l) => l.nextCursor },
    ),
  );
  const markRead = useMutation(
    trpc.notification.markRead.mutationOptions({
      onSettled: () => qc.invalidateQueries(trpc.notification.pathFilter()),
    }),
  );

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    {
      label: "Today",
      items: items.filter((n) => +new Date(n.createdAt) >= startOfToday),
    },
    {
      label: "Earlier",
      items: items.filter((n) => +new Date(n.createdAt) < startOfToday),
    },
  ].filter((g) => g.items.length > 0);
  const anyUnread = items.some((n) => !n.readAt);

  const open = (n: Item) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    if (n.post)
      router.push(`/p/${n.post.id}${n.commentId ? `#c-${n.commentId}` : ""}`);
  };

  return (
    <div className="flex flex-col gap-5 pt-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {anyUnread && (
          <Button
            variant="ghost"
            size="sm"
            icon="done_all"
            loading={markRead.isPending}
            onClick={() => markRead.mutate({})}
          >
            Mark all read
          </Button>
        )}
      </header>

      {list.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          Couldn't load notifications. Try again in a moment.
        </p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="notifications"
          title="You're all caught up"
          body="Replies to your posts and new posts from people and tags you follow show up here."
        />
      ) : (
        groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {g.label}
            </h2>
            {g.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  focusRing,
                  "flex w-full cursor-pointer items-start gap-3 rounded-2xl p-3 text-left text-sm transition-colors duration-150",
                  n.readAt
                    ? "hover:bg-muted"
                    : "bg-primary/8 hover:bg-primary/12",
                )}
              >
                {n.actor ? (
                  <Avatar
                    name={n.actor.name}
                    src={
                      n.actor.avatarKey
                        ? `/api/files/${n.actor.avatarKey}`
                        : null
                    }
                    size={36}
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Icon name="campaign" size={18} />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="leading-snug">
                    <Text n={n} />
                  </span>
                  <time
                    dateTime={new Date(n.createdAt).toISOString()}
                    className="text-xs text-muted-foreground"
                  >
                    {timeAgo(n.createdAt)}
                  </time>
                </span>
                {!n.readAt && (
                  <span
                    role="img"
                    aria-label="Unread"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </button>
            ))}
          </section>
        ))
      )}
      {list.hasNextPage && (
        <Button
          variant="tonal"
          className="self-center"
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
