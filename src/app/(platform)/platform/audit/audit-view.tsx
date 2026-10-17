"use client";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  fmtDateTime,
  LoadError,
  Loading,
} from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { PageHeader } from "@/components/workspace/workspace-shell";
import { useTRPC } from "@/lib/trpc";

// Every action platform.ts writes to platform_audit.
const ACTIONS = {
  "university.approve": ["Approved university", "check_circle"],
  "university.reject": ["Rejected university", "cancel"],
  "university.create": ["Created university", "add_business"],
  "university.suspend": ["Suspended university", "pause_circle"],
  "university.reactivate": ["Reactivated university", "play_circle"],
  "owner.transfer": ["Transferred ownership", "swap_horiz"],
  "user.ban": ["Banned user", "block"],
  "user.unban": ["Unbanned user", "lock_open"],
  "admin.add": ["Added platform admin", "person_add"],
  "admin.remove": ["Removed platform admin", "person_remove"],
  "broadcast.send": ["Sent broadcast", "campaign"],
} as const;
const FILTER = [
  { value: "all", label: "All actions" },
  ...Object.entries(ACTIONS).map(([value, [label]]) => ({ value, label })),
];

/** The human part of meta: a name, email or title. */
function detail(meta: Record<string, unknown> | null) {
  if (!meta) return null;
  const v = meta.name ?? meta.email ?? meta.title;
  const extra =
    typeof meta.recipients === "number"
      ? ` · ${meta.recipients} recipients`
      : typeof meta.ownerEmail === "string"
        ? ` · owner ${meta.ownerEmail}`
        : "";
  return typeof v === "string" ? v + extra : null;
}

const dayStart = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);

export function AuditView() {
  const trpc = useTRPC();
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const toDate = dayStart(to);
  const list = useInfiniteQuery(
    trpc.platform.audit.infiniteQueryOptions(
      {
        action: action === "all" ? undefined : action,
        from: dayStart(from),
        // Inclusive: up to the end of that day.
        to: toDate && new Date(+toDate + 86_400_000),
      },
      {
        getNextPageParam: (l) => l.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        sub="Every platform action, newest first."
      />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Action"
          value={action}
          onValueChange={setAction}
          items={FILTER}
          className="w-full sm:w-fit"
        />
        <TextField
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 sm:w-44 sm:flex-none"
        />
        <TextField
          label="To"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 sm:w-44 sm:flex-none"
        />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <LoadError message={list.error.message} />
      ) : items.length === 0 ? (
        <EmptyState icon="history" title="No audit entries" />
      ) : (
        <Card className="flex flex-col p-2">
          {items.map((e) => {
            const a = ACTIONS[e.action as keyof typeof ACTIONS];
            const d = detail(e.meta);
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-2xl px-3 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Icon name={a?.[1] ?? "history"} size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{a?.[0] ?? e.action}</span>
                    {d && <span className="text-muted-foreground"> · {d}</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.actorName ?? "Removed account"}
                    {e.actorEmail ? ` (${e.actorEmail})` : ""} ·{" "}
                    {fmtDateTime.format(new Date(e.createdAt))}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </span>
                </div>
              </div>
            );
          })}
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
    </>
  );
}
