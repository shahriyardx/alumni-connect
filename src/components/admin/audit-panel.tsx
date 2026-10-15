"use client";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";

// Every action string the server writes (grep `audit(` in src/server).
const ACTIONS = [
  "report.dismiss",
  "report.remove",
  "report.suspend",
  "report.ban",
  "user.status",
  "user.approve",
  "user.role",
  "roster.import",
  "post.update",
  "post.remove",
  "comment.update",
  "comment.remove",
  "signup.attempt",
] as const;
const FILTER_ITEMS = [
  { value: "all", label: "All actions" },
  ...ACTIONS.map((a) => ({ value: a, label: a })),
];

const fmt = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditPanel() {
  const trpc = useTRPC();
  const [action, setAction] = useState<string>("all");
  const list = useInfiniteQuery(
    trpc.admin.audit.infiniteQueryOptions(
      { action: action === "all" ? undefined : action },
      {
        getNextPageParam: (l) => l.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Action"
        value={action}
        onValueChange={setAction}
        items={FILTER_ITEMS}
        className="w-fit"
      />
      {list.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {list.error.message}
        </p>
      ) : items.length === 0 ? (
        <EmptyState icon="history" title="No audit entries" />
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                {["Time", "Actor", "Action", "Target", "IP"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                    {fmt.format(new Date(e.createdAt))}
                  </td>
                  <td className="px-3 py-2">
                    {e.actor ? (
                      <Link
                        href={`/u/${e.actor.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.actor.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">system</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
                      {e.action}
                    </code>
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {e.target ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {e.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
