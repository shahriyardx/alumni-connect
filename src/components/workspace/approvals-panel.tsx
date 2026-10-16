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
  const list = useQuery(trpc.workspace.approvals.queryOptions());
  const n = list.data?.length ?? 0;

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
            <ApprovalCard key={u.id} u={u} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ID card photos are deleted 30 days after your decision.
      </p>
    </>
  );
}

function ApprovalCard({ u }: { u: Pending }) {
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
            <span
              className={cn(
                "inline-flex h-5 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium",
                u.rosterMatch
                  ? "bg-tonal text-tonal-fg"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              <Icon name={u.rosterMatch ? "check" : "close"} size={14} />
              {u.rosterMatch ? "On roster" : "Not found"}
            </span>
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
