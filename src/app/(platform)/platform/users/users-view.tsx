"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import {
  fmtDate,
  LoadError,
  Loading,
  StatusPill,
} from "@/components/platform/platform-shell";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/workspace/workspace-shell";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Person = RouterOutputs["platform"]["users"]["items"][number];

export function UsersView() {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const list = useInfiniteQuery(
    trpc.platform.users.infiniteQueryOptions(
      { q: query },
      {
        getNextPageParam: (l) => l.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="Users" sub="Everyone, across every university." />
      <TextField
        label="Search"
        hideLabel
        type="search"
        placeholder="Search by name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <LoadError message={list.error.message} />
      ) : items.length === 0 ? (
        <EmptyState icon="group" title="No one matches" />
      ) : (
        <Card className="flex flex-col p-2">
          <div
            aria-hidden
            className={`${cols} hidden px-3 pt-2 pb-3 text-xs font-medium text-muted-foreground md:grid`}
          >
            <span>Person</span>
            <span>University</span>
            <span>Role</span>
            <span>Status</span>
            <span />
          </div>
          {items.map((p) => (
            <Row key={p.id} p={p} />
          ))}
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

// One grid for header and rows so columns line up; stacks on phones.
const cols =
  "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_7.5rem_6.5rem_6.5rem] md:gap-4";

function Row({ p }: { p: Person }) {
  const admin = p.isPlatformAdmin || !p.universityId;
  return (
    <div
      className={`${cols} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-3 hover:bg-muted/50`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={p.name} size={36} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{p.name}</span>
            {p.verified && (
              <span role="img" aria-label="Email verified" className="flex">
                <Icon
                  name="verified"
                  size={14}
                  filled
                  className="text-primary"
                />
              </span>
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {p.email}
          </span>
        </div>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-0.5 pl-12 text-xs md:col-span-1 md:pl-0">
        <span
          className={`truncate font-medium ${p.universityName ? "" : "text-muted-foreground"}`}
          title={p.universityName ?? undefined}
        >
          {p.universityName ?? "—"}
        </span>
        <span className="text-muted-foreground">
          Joined {fmtDate.format(new Date(p.createdAt))}
          {p.verified ? "" : " · unverified"}
        </span>
      </div>
      {/* Phone: role and status share one line under the university. */}
      <div className="col-span-2 flex items-center gap-1.5 pl-12 md:hidden">
        {admin ? <SuperAdminBadge /> : <RoleBadge role={p.role} />}
        <StatusPill status={p.status} />
      </div>
      <div className="max-md:hidden">
        {admin ? <SuperAdminBadge /> : <RoleBadge role={p.role} />}
      </div>
      <div className="max-md:hidden">
        <StatusPill status={p.status} />
      </div>
      <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
        {admin ? null : <BanButton p={p} />}
      </div>
    </div>
  );
}

function SuperAdminBadge() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/12 px-2.5 text-xs font-medium text-primary">
      <Icon name="admin_panel_settings" size={13} filled />
      Super admin
    </span>
  );
}

function BanButton({ p }: { p: Person }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const banned = p.platformBanned;
  const m = useMutation(
    trpc.platform.setBanned.mutationOptions({
      onSuccess: () => {
        toast.success(banned ? `${p.name} unbanned` : `${p.name} banned`);
        setOpen(false);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            size="sm"
            variant={banned ? "tonal" : "ghost"}
            icon={banned ? "lock_open" : "block"}
          />
        }
      >
        {banned ? "Unban" : "Ban"}
      </Dialog.Trigger>
      <DialogContent
        title={banned ? `Unban ${p.name}?` : `Ban ${p.name}?`}
        description={
          banned
            ? "They can sign in and use their university again."
            : "They're signed out everywhere and lose access to Alumni Connect."
        }
      >
        <div className="flex justify-end gap-2">
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
          <Button
            variant={banned ? "filled" : "destructive"}
            loading={m.isPending}
            onClick={() => m.mutate({ userId: p.id, banned: !banned })}
          >
            {banned ? "Unban" : "Ban"}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
