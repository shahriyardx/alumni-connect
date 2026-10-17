"use client";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AuthorLine, timeAgo } from "@/components/author-line";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tab, TabsList, TabsPanel, TabsRoot } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { PageHeader } from "./workspace-shell";

type Status = "OPEN" | "RESOLVED" | "DISMISSED";
type Report = RouterOutputs["moderation"]["queue"]["items"][number];

const DAYS = ["1", "3", "7", "30", "90"] as const;

export function ModerationPanel() {
  return (
    <>
      <PageHeader
        title="Moderation"
        sub="Reports from members, oldest first."
      />
      <TabsRoot defaultValue="OPEN">
        <TabsList>
          <Tab value="OPEN">Open</Tab>
          <Tab value="RESOLVED">Resolved</Tab>
          <Tab value="DISMISSED">Dismissed</Tab>
        </TabsList>
        {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((s) => (
          <TabsPanel key={s} value={s}>
            <Queue status={s} />
          </TabsPanel>
        ))}
      </TabsRoot>
    </>
  );
}

function Queue({ status }: { status: Status }) {
  const trpc = useTRPC();
  const list = useInfiniteQuery(
    trpc.moderation.queue.infiniteQueryOptions(
      { status },
      { getNextPageParam: (l) => l.nextCursor },
    ),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  if (list.isLoading)
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  if (list.isError)
    return (
      <p className="py-16 text-center text-sm text-destructive">
        {list.error.message}
      </p>
    );
  if (items.length === 0)
    return (
      <EmptyState
        icon={status === "OPEN" ? "verified_user" : "inbox"}
        title={status === "OPEN" ? "Queue is clear" : "Nothing here yet"}
        body={
          status === "OPEN"
            ? "New reports from members show up here, oldest first."
            : undefined
        }
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {items.map((r) => (
        <ReportCard key={r.id} r={r} />
      ))}
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

function contentHref(r: Report) {
  if (r.targetType === "POST") return `/p/${r.targetId}`;
  if (r.targetType === "USER") return `/u/${r.targetId}`;
  return r.preview?.postId ? `/p/${r.preview.postId}#c-${r.targetId}` : null;
}

function ReportCard({ r }: { r: Report }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<"suspend" | "ban" | null>(null);
  const [days, setDays] = useState<(typeof DAYS)[number]>("7");
  const resolve = useMutation(
    trpc.moderation.resolve.mutationOptions({
      onSuccess: (_, v) => {
        toast.success(
          {
            dismiss: "Report dismissed",
            remove: "Content removed",
            suspend: "Account suspended",
            ban: "Account banned",
          }[v.action],
        );
        setDialog(null);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        void qc.invalidateQueries(trpc.moderation.queue.pathFilter());
        void qc.invalidateQueries(trpc.workspace.counts.queryFilter());
        void qc.invalidateQueries(trpc.post.pathFilter());
      },
    }),
  );
  const act = (action: "dismiss" | "remove" | "suspend" | "ban") =>
    resolve.mutate({
      reportId: r.id,
      action,
      days: action === "suspend" ? Number(days) : undefined,
    });
  const busy = (a: string) =>
    resolve.isPending && resolve.variables?.action === a;
  const href = contentHref(r);
  const p = r.preview;
  const who = r.targetType === "USER" ? "this account" : "author";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 font-medium capitalize">
          {r.targetType.toLowerCase()}
        </span>
        <span>reported {timeAgo(r.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-surface-high p-4">
        {!p ? (
          <span className="text-sm text-muted-foreground italic">
            Content no longer exists
          </span>
        ) : (
          <>
            {p.title && (
              <span className="font-semibold tracking-tight">{p.title}</span>
            )}
            {p.body && (
              <p className="line-clamp-3 text-sm whitespace-pre-line">
                {p.body}
              </p>
            )}
            {p.userName && (
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon name="person" size={16} /> {p.userName}
              </span>
            )}
          </>
        )}
        {href && p && (
          <Link
            href={href}
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View {r.targetType === "USER" ? "profile" : "in context"}
            <Icon name="arrow_forward" size={16} />
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground">Reason · </span>
          {r.reason}
        </p>
        <span className="text-xs text-muted-foreground">Reported by</span>
        <AuthorLine author={r.reporter} at={r.createdAt} size={28} />
      </div>

      {r.status === "OPEN" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            loading={busy("dismiss")}
            onClick={() => act("dismiss")}
          >
            Dismiss
          </Button>
          {r.targetType !== "USER" && p && (
            <Button
              variant="destructive"
              size="sm"
              icon="delete"
              loading={busy("remove")}
              onClick={() => act("remove")}
            >
              Remove
            </Button>
          )}
          <Button
            variant="tonal"
            size="sm"
            icon="timer_pause"
            onClick={() => setDialog("suspend")}
          >
            {who === "author" ? "Suspend author" : "Suspend"}
          </Button>
          <Button
            size="sm"
            icon="block"
            className="bg-destructive text-white hover:bg-destructive/85"
            onClick={() => setDialog("ban")}
          >
            {who === "author" ? "Ban author" : "Ban"}
          </Button>
        </div>
      )}

      <Dialog.Root
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        {dialog === "suspend" ? (
          <DialogContent
            title={`Suspend ${who}`}
            description="They can't sign in until the suspension ends."
          >
            <Select
              label="Duration"
              value={days}
              onValueChange={setDays}
              items={DAYS.map((d) => ({
                value: d,
                label: d === "1" ? "1 day" : `${d} days`,
              }))}
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button loading={busy("suspend")} onClick={() => act("suspend")}>
                Suspend
              </Button>
            </div>
          </DialogContent>
        ) : (
          <DialogContent
            title={`Ban ${who}?`}
            description="They can't sign in again until an admin restores them from Members."
          >
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                className="bg-destructive text-white hover:bg-destructive/85"
                loading={busy("ban")}
                onClick={() => act("ban")}
              >
                Ban
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog.Root>
    </Card>
  );
}
