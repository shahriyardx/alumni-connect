"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { timeAgo } from "../author-line";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { IconButton } from "../ui/icon-button";
import { Spinner } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { PageHeader } from "./workspace-shell";

type Pending = RouterOutputs["workspace"]["approvals"][number];

// One grid for header and rows so columns line up; stacks on phones.
const cols =
  "md:grid-cols-[1.75rem_minmax(0,1.5fr)_7rem_minmax(0,8rem)_7.5rem_6.5rem_9.5rem] md:gap-3";

export function ApprovalsPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.workspace.approvals.queryOptions());
  const data = list.data ?? [];
  const n = data.length;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmRejectSelected, setConfirmRejectSelected] = useState(false);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

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
  const decide = useMutation(
    trpc.workspace.decide.mutationOptions({
      onSuccess: (_, v) => {
        const person = data.find((u) => u.id === v.userId);
        toast.success(
          v.action === "approve"
            ? `${person?.name ?? "Sign-up"} approved`
            : `${person?.name ?? "Sign-up"} rejected`,
        );
        // Viewing the one just decided: step to the next pending person.
        if (v.userId === viewingId) {
          const i = data.findIndex((u) => u.id === v.userId);
          setViewingId(data[i + 1]?.id ?? data[i - 1]?.id ?? null);
        }
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        setConfirmRejectId(null);
        void qc.invalidateQueries(trpc.workspace.pathFilter());
        void qc.invalidateQueries(trpc.admin.pathFilter());
      },
    }),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const rosterMatches = data.filter((u) => u.rosterMatch === true);
  const allSelected = n > 0 && selected.size === n;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(data.map((u) => u.id)));

  const viewingIndex = data.findIndex((u) => u.id === viewingId);
  const viewing = viewingIndex >= 0 ? data[viewingIndex] : null;
  const rejectTarget = data.find((u) => u.id === confirmRejectId) ?? viewing;

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
        <Card className="flex flex-col p-2">
          <div
            className={cn(
              cols,
              "hidden items-center gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground md:grid",
            )}
          >
            <input
              type="checkbox"
              className="size-4 rounded accent-primary"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span>Person</span>
            <span>Batch</span>
            <span>Department</span>
            <span>Roster</span>
            <span>Signed up</span>
            <span className="sr-only">Actions</span>
          </div>
          {data.map((u) => (
            <Row
              key={u.id}
              u={u}
              selected={selected.has(u.id)}
              onToggle={() => toggle(u.id)}
              onView={() => setViewingId(u.id)}
              decide={decide}
              onRejectRequest={() => setConfirmRejectId(u.id)}
            />
          ))}
        </Card>
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

      <Dialog.Root
        open={!!confirmRejectId}
        onOpenChange={(o) => !o && setConfirmRejectId(null)}
      >
        {rejectTarget && confirmRejectId && (
          <DialogContent
            title={`Reject ${rejectTarget.name}?`}
            description="Their pending account and ID card photo are deleted. They can sign up again."
          >
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                variant="destructive"
                loading={
                  decide.isPending &&
                  decide.variables?.userId === confirmRejectId
                }
                onClick={() =>
                  decide.mutate({ userId: confirmRejectId, action: "reject" })
                }
              >
                Reject
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog.Root>

      <Dialog.Root
        open={!!viewing}
        onOpenChange={(o) => !o && setViewingId(null)}
      >
        {viewing && (
          <DetailModal
            u={viewing}
            onPrev={
              viewingIndex > 0
                ? () => setViewingId(data[viewingIndex - 1].id)
                : undefined
            }
            onNext={
              viewingIndex < n - 1
                ? () => setViewingId(data[viewingIndex + 1].id)
                : undefined
            }
            decide={decide}
            onReject={() => setConfirmRejectId(viewing.id)}
          />
        )}
      </Dialog.Root>
    </>
  );
}

type DecideMutation = ReturnType<typeof useDecideMutation>;
function useDecideMutation() {
  const trpc = useTRPC();
  return useMutation(trpc.workspace.decide.mutationOptions());
}

function Row({
  u,
  selected,
  onToggle,
  onView,
  decide,
  onRejectRequest,
}: {
  u: Pending;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  decide: DecideMutation;
  onRejectRequest: () => void;
}) {
  const busy = (a: "approve" | "reject") =>
    decide.isPending &&
    decide.variables?.userId === u.id &&
    decide.variables.action === a;

  return (
    // A real <button> can't contain the checkbox/Button/IconButton below (no
    // nested interactive content), so this is a div acting as one.
    // biome-ignore lint/a11y/useSemanticElements: button can't nest buttons/inputs
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onView();
        }
      }}
      className={cn(
        cols,
        "grid w-full cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2.5 text-left hover:bg-muted/50",
      )}
    >
      <input
        type="checkbox"
        className="col-start-1 row-start-1 size-4 rounded accent-primary"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${u.name}`}
      />
      <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3">
        <Avatar name={u.name} size={36} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{u.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {u.email}
          </span>
        </div>
      </div>
      <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-xs text-muted-foreground md:hidden">
        <span>
          {u.batchNumber ?? "—"}
          {u.graduationYear && ` · ${u.graduationYear}`}
        </span>
        <span>·</span>
        <span className="truncate">{u.department ?? "—"}</span>
        <span>·</span>
        <RosterChip match={u.rosterMatch} />
        <span>·</span>
        <span>{timeAgo(u.createdAt)}</span>
      </div>
      <div className="max-md:hidden">
        <span className="text-sm">
          {u.batchNumber ?? "—"}
          {u.graduationYear && (
            <span className="text-muted-foreground"> · {u.graduationYear}</span>
          )}
        </span>
      </div>
      <div className="max-md:hidden">
        <span className="truncate text-sm">{u.department ?? "—"}</span>
      </div>
      <div className="max-md:hidden">
        <RosterChip match={u.rosterMatch} />
      </div>
      <div className="max-md:hidden">
        <span className="text-xs text-muted-foreground">
          {timeAgo(u.createdAt)}
        </span>
      </div>
      {/** biome-ignore lint/a11y/noStaticElementInteractions: stops row-click bubbling only */}
      <div
        className="col-start-3 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button size="sm" variant="tonal" onClick={onView}>
          View
        </Button>
        <IconButton
          icon="check"
          label="Approve"
          variant="tonal"
          className="size-8"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ userId: u.id, action: "approve" })}
        />
        <IconButton
          icon="close"
          label="Reject"
          className="size-8 text-destructive hover:bg-destructive/10"
          disabled={decide.isPending}
          onClick={onRejectRequest}
        />
        {(busy("approve") || busy("reject")) && <Spinner size={16} />}
      </div>
    </div>
  );
}

function DetailModal({
  u,
  onPrev,
  onNext,
  decide,
  onReject,
}: {
  u: Pending;
  onPrev?: () => void;
  onNext?: () => void;
  decide: DecideMutation;
  onReject: () => void;
}) {
  const card = `/api/id-cards/${u.id}`;
  const busy = (a: "approve" | "reject") =>
    decide.isPending &&
    decide.variables?.userId === u.id &&
    decide.variables.action === a;

  return (
    <DialogContent
      title={u.name}
      description={u.email}
      className="w-[min(46rem,calc(100vw-32px))]"
    >
      <div className="flex flex-col gap-4 md:flex-row">
        {u.hasIdCard ? (
          <a
            href={card}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-[16/10] w-full shrink-0 overflow-hidden rounded-2xl bg-surface-high md:w-80"
            aria-label={`Open ${u.name}'s ID card full size`}
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
          <div className="grid aspect-[16/10] w-full shrink-0 place-items-center rounded-2xl bg-surface-high text-sm text-muted-foreground md:w-80">
            No ID card photo
          </div>
        )}

        <dl className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-3 text-sm">
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
          <Fact label="Signed up" className="col-span-2">
            {timeAgo(u.createdAt)}
          </Fact>
        </dl>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex gap-1">
          <IconButton
            icon="chevron_left"
            label="Previous"
            disabled={!onPrev}
            onClick={onPrev}
          />
          <IconButton
            icon="chevron_right"
            label="Next"
            disabled={!onNext}
            onClick={onNext}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={decide.isPending}
            onClick={onReject}
          >
            Reject
          </Button>
          <Button
            icon="check"
            loading={busy("approve")}
            disabled={decide.isPending}
            onClick={() => decide.mutate({ userId: u.id, action: "approve" })}
          >
            Approve
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
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
        "inline-flex h-5 w-fit items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium",
        tone,
      )}
    >
      <Icon name={icon} size={14} />
      {label}
    </span>
  );
}
