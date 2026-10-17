"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tip } from "@/components/ui/icon-button";
import { AUDIT_ACTIONS, auditLabel } from "@/lib/audit-labels";
import { useTRPC } from "@/lib/trpc";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { PageHeader } from "./workspace-shell";

const FILTER_ITEMS = [
  { value: "all", label: "All actions" },
  ...Object.entries(AUDIT_ACTIONS).map(([value, a]) => ({
    value,
    label: a.label,
  })),
];
const RANGE_ITEMS = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
] as const;

const fmt = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditPanel() {
  const trpc = useTRPC();
  const router = useRouter();
  const params = useSearchParams();
  const action = params.get("action") ?? "all";
  const actor = params.get("actor") ?? "all";
  const range = (params.get("range") ??
    "all") as (typeof RANGE_ITEMS)[number]["value"];

  const setParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params);
    if (value === "all") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.replace(qs ? `/workspace/audit?${qs}` : "/workspace/audit");
  };

  const actors = useQuery(trpc.admin.auditActors.queryOptions());
  const list = useInfiniteQuery(
    trpc.admin.audit.infiniteQueryOptions(
      {
        action: action === "all" ? undefined : action,
        actorId: actor === "all" ? undefined : actor,
        range: range === "all" ? undefined : range,
      },
      {
        getNextPageParam: (l) => l.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" sub="Every staff action, newest first." />
      <div className="flex flex-wrap gap-2">
        <Select
          label="Action"
          value={action}
          onValueChange={(v) => setParam("action", v)}
          items={FILTER_ITEMS}
          className="w-fit"
        />
        <Select
          label="Actor"
          value={actor}
          onValueChange={(v) => setParam("actor", v)}
          items={[
            { value: "all", label: "All staff" },
            ...(actors.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          className="w-fit"
        />
        <Select
          label="When"
          value={range}
          onValueChange={(v) => setParam("range", v)}
          items={RANGE_ITEMS}
          className="w-fit"
        />
      </div>
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
              {items.map((e) => {
                const { label, icon } = auditLabel(e.action);
                return (
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
                      <Tip label={e.action}>
                        <span className="inline-flex w-fit cursor-help items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                          <Icon name={icon} size={14} />
                          {label}
                        </span>
                      </Tip>
                    </td>
                    <td className="max-w-48 truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                      {e.target ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                );
              })}
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
