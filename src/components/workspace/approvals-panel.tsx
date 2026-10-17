"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { timeAgo } from "../author-line";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Spinner } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { PageHeader } from "./workspace-shell";

type Pending = RouterOutputs["workspace"]["approvals"][number];

export function ApprovalsPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.workspace.approvals.queryOptions());
  const n = list.data?.length ?? 0;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmRejectSelected, setConfirmRejectSelected] = useState(false);

  const onSettled = () => {
    setSelected(new Set());
    setConfirmBulk(false);
    setConfirmRejectSelected(false);
    void qc.invalidateQueries(trpc.workspace.pathFilter());
    void qc.invalidateQueries(trpc.admin.pathFilter());
  };
  const approveMany = useMutation(
    trpc.workspace.approveMany.mutationOptions({
      onSuccess: (r) =>
        toast.success(
          `${r.processed.length} sign-up${r.processed.length === 1 ? "" : "s"} approved`,
        ),
      onError: (e) => toast.error(e.message),
      onSettled,
    }),
  );
  const rejectMany = useMutation(
    trpc.workspace.rejectMany.mutationOptions({
      onSuccess: (r) =>
        toast.success(
          `${r.processed.length} sign-up${r.processed.length === 1 ? "" : "s"} rejected`,
        ),
      onError: (e) => toast.error(e.message),
      onSettled,
    }),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const rosterMatches = (list.data ?? []).filter((u) => u.rosterMatch === true);

  return (
    <>
      <PageHeader
        title="Approvals"
        sub={
          n
            ? `${n} sign-up${n === 1 ? "" : "s"} waiting. Compare the ID card with the details before approving.`
            : "New student sign-ups wait here for you."
        }
      />
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {rosterMatches.length > 0 && (
            <Button
              variant="tonal"
              icon="verified"
              onClick={() => setConfirmBulk(true)}
            >
              Approve all roster matches ({rosterMatches.length})
            </Button>
          )}
          {selected.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selected.size} selected
              </span>
              <Button
                size="sm"
                loading={approveMany.isPending}
                onClick={() => approveMany.mutate({ userIds: [...selected] })}
              >
                Approve selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmRejectSelected(true)}
              >
                Reject selected
              </Button>
            </>
          )}
        </div>
      )}
      {list.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {list.error.message}
        </p>
      ) : !list.data ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : n === 0 ? (
        <Card>
          <EmptyState
            icon="how_to_reg"
            title="No one is waiting"
            body="Verified sign-ups show up here with their ID card photo."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((u) => (
            <ApprovalCard
              key={u.id}
              u={u}
              selected={selected.has(u.id)}
              onToggle={() => toggle(u.id)}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ID card photos are deleted 30 days after your decision.
      </p>

      <Dialog.Root open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent
          title={`Approve ${rosterMatches.length} roster-matched sign-up${rosterMatches.length === 1 ? "" : "s"}?`}
          description="Each one matched a roster entry for their batch. This can't be undone."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              loading={approveMany.isPending}
              onClick={() =>
                approveMany.mutate({
                  userIds: rosterMatches.map((u) => u.id),
                })
              }
            >
              Approve all
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>

      <Dialog.Root
        open={confirmRejectSelected}
        onOpenChange={setConfirmRejectSelected}
      >
        <DialogContent
          title={`Reject ${selected.size} sign-up${selected.size === 1 ? "" : "s"}?`}
          description="Their pending accounts and ID card photos are deleted. They can sign up again."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              variant="destructive"
              loading={rejectMany.isPending}
              onClick={() => rejectMany.mutate({ userIds: [...selected] })}
            >
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </>
  );
}

function ApprovalCard({
  u,
  selected,
  onToggle,
}: {
  u: Pending;
  selected: boolean;
  onToggle: () => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmReject, setConfirmReject] = useState(false);
  const decide = useMutation(
    trpc.workspace.decide.mutationOptions({
      onSuccess: (_, v) =>
        toast.success(
          v.action === "approve" ? `${u.name} approved` : `${u.name} rejected`,
        ),
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        setConfirmReject(false);
        void qc.invalidateQueries(trpc.workspace.pathFilter());
        void qc.invalidateQueries(trpc.admin.pathFilter());
      },
    }),
  );
  const busy = (a: "approve" | "reject") =>
    decide.isPending && decide.variables?.action === a;
  const card = `/api/id-cards/${u.id}`;

  return (
    <Card className="flex flex-col gap-4 p-3">
      <label className="flex w-fit items-center gap-2 px-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 rounded accent-primary"
          checked={selected}
          onChange={onToggle}
        />
        Select
      </label>
      {u.hasIdCard ? (
        <a
          href={card}
          target="_blank"
          rel="noreferrer"
          className="group relative block aspect-[16/10] overflow-hidden rounded-2xl bg-surface-high"
          aria-label={`Open ${u.name}'s ID card`}
        >
          {/* biome-ignore lint/performance/noImgElement: private, presigned redirect — next/image can't optimize it */}
          <img
            src={card}
            alt={`ID card of ${u.name}`}
            className="size-full object-contain"
          />
          <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Icon name="open_in_full" size={16} />
          </span>
        </a>
      ) : (
        <div className="grid aspect-[16/10] place-items-center rounded-2xl bg-surface-high text-sm text-muted-foreground">
          No ID card photo
        </div>
      )}

      <div className="flex flex-col gap-3 px-2">
        <div className="flex flex-col">
          <span className="font-semibold tracking-tight">{u.name}</span>
          <span className="truncate text-sm text-muted-foreground">
            {u.email}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Fact label="Batch">
            {u.batchNumber ?? "—"}
            {u.graduationYear && (
              <span className="text-muted-foreground">
                {" "}
                · {u.graduationYear}
              </span>
            )}
          </Fact>
          <Fact label="Department">{u.department ?? "—"}</Fact>
          <Fact label="Student ID">
            {u.studentIdHint ? (
              <span className="tabular-nums">
                ends in ••••{u.studentIdHint}
              </span>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="Roster">
            <RosterChip match={u.rosterMatch} />
          </Fact>
        </dl>
        <span className="text-xs text-muted-foreground">
          Signed up {timeAgo(u.createdAt)}
        </span>
      </div>

      <div className="flex gap-2 px-1 pb-1">
        <Button
          icon="check"
          className="flex-1"
          loading={busy("approve")}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ userId: u.id, action: "approve" })}
        >
          Approve
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={decide.isPending}
          onClick={() => setConfirmReject(true)}
        >
          Reject
        </Button>
      </div>

      <Dialog.Root open={confirmReject} onOpenChange={setConfirmReject}>
        <DialogContent
          title={`Reject ${u.name}?`}
          description="Their pending account and ID card photo are deleted. They can sign up again."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              variant="destructive"
              loading={busy("reject")}
              onClick={() => decide.mutate({ userId: u.id, action: "reject" })}
            >
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </Card>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

/** true = on that batch's roster, false = roster exists but no match, null = batch had no roster. */
function RosterChip({ match }: { match: boolean | null }) {
  const [tone, icon, label] =
    match === true
      ? ["bg-tonal text-tonal-fg", "check", "On roster"]
      : match === false
        ? ["bg-destructive/10 text-destructive", "close", "Not found"]
        : ["bg-muted text-muted-foreground", "remove", "No roster"];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium",
        tone,
      )}
    >
      <Icon name={icon} size={14} />
      {label}
    </span>
  );
}
