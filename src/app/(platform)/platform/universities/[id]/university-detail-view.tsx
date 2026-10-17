"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { timeAgo } from "@/components/author-line";
import {
  fmtDate,
  LoadError,
  Loading,
  StatusPill,
} from "@/components/platform/platform-shell";
import { RoleBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { ROLES } from "@/db/schema";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Uni = RouterOutputs["platform"]["university"];

const ROLE_LABEL = {
  OWNER: ["Owner", "Owners"],
  ADMIN: ["Admin", "Admins"],
  MODERATOR: ["Moderator", "Moderators"],
  STAFF: ["Faculty", "Faculty"],
  STUDENT: ["Student", "Students"],
  ALUMNUS: ["Alumnus", "Alumni"],
} as const;

export function UniversityDetailView() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const q = useQuery(
    trpc.platform.university.queryOptions({ universityId: id }),
  );
  const back = (
    <ButtonLink
      href="/platform/universities"
      variant="ghost"
      size="sm"
      icon="arrow_back"
      className="-ml-2 w-fit"
    >
      Universities
    </ButtonLink>
  );
  if (q.isError)
    return (
      <>
        {back}
        <LoadError message={q.error.message} />
      </>
    );
  if (!q.data)
    return (
      <>
        {back}
        <Loading />
      </>
    );
  const u = q.data;
  const members = ROLES.reduce((n, r) => n + u.members[r], 0);

  return (
    <>
      <div className="flex flex-col gap-2">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
            {u.name.slice(0, 1).toUpperCase()}
          </span>
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
            {u.name}
          </h1>
          <StatusPill status={u.status} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
          <h2 className="font-semibold tracking-tight">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="min-w-0 break-words">
              {u.owner ? (
                <>
                  {u.owner.name}{" "}
                  <span className="text-muted-foreground">
                    · {u.owner.email}
                    {u.owner.verified ? "" : " · not verified"}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No owner yet</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Website</dt>
            <dd className="min-w-0 truncate">
              {u.website ? (
                <a
                  href={u.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  {u.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Logo</dt>
            <dd>{u.hasLogo ? "Uploaded" : "None"}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{fmtDate.format(new Date(u.createdAt))}</dd>
            <dt className="text-muted-foreground">Last activity</dt>
            <dd>{u.lastActivity ? timeAgo(u.lastActivity) : "None yet"}</dd>
          </dl>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold tracking-tight">Members</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {u.posts} post{u.posts === 1 ? "" : "s"}
            </span>
          </div>
          <span className="text-5xl font-semibold tracking-tighter tabular-nums">
            {members}
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {ROLES.filter((r) => u.members[r] > 0).map((r) => (
              <span key={r}>
                <span className="font-semibold tabular-nums">
                  {u.members[r]}
                </span>{" "}
                <span className="text-muted-foreground">
                  {ROLE_LABEL[r][u.members[r] === 1 ? 0 : 1]}
                </span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-semibold tracking-tight">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <TransferDialog u={u} />
          {u.status === "ACTIVE" && <StatusAction u={u} action="suspend" />}
          {u.status === "SUSPENDED" && (
            <StatusAction u={u} action="reactivate" />
          )}
        </div>
      </Card>
    </>
  );
}

function StatusAction({
  u,
  action,
}: {
  u: Uni;
  action: "suspend" | "reactivate";
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const suspend = action === "suspend";
  const m = useMutation(
    (suspend
      ? trpc.platform.suspend
      : trpc.platform.reactivate
    ).mutationOptions({
      onSuccess: () => {
        toast.success(
          suspend ? `${u.name} suspended` : `${u.name} is live again`,
        );
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
            variant={suspend ? "destructive" : "filled"}
            icon={suspend ? "pause_circle" : "play_circle"}
          />
        }
      >
        {suspend ? "Suspend" : "Reactivate"}
      </Dialog.Trigger>
      <DialogContent
        title={suspend ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`}
        description={
          suspend
            ? "Members lose access and it's hidden from sign-up until you reactivate it."
            : "Members get their access back and it shows up in sign-up again."
        }
      >
        <div className="flex justify-end gap-2">
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
          <Button
            variant={suspend ? "destructive" : "filled"}
            loading={m.isPending}
            onClick={() => m.mutate({ universityId: u.id })}
          >
            {suspend ? "Suspend" : "Reactivate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}

function TransferDialog({ u }: { u: Uni }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const people = useQuery(
    trpc.platform.users.queryOptions(
      { universityId: u.id, q: q.trim() },
      { enabled: open },
    ),
  );
  const candidates = (people.data?.items ?? []).filter(
    (p) => p.status === "ACTIVE" && p.verified && p.role !== "OWNER",
  );
  const m = useMutation(
    trpc.platform.transferOwnership.mutationOptions({
      onSuccess: () => {
        toast.success("Ownership transferred");
        reset(false);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setQ("");
      setPick(null);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger render={<Button variant="tonal" icon="swap_horiz" />}>
        Transfer ownership
      </Dialog.Trigger>
      <DialogContent
        title="Transfer ownership"
        description="Pick an active member. The current owner becomes an admin."
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="Search members"
            type="search"
            placeholder="Name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <fieldset className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            <legend className="sr-only">Members</legend>
            {people.isLoading ? (
              <Loading />
            ) : candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active members match.
              </p>
            ) : (
              candidates.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    pick === p.id
                      ? "bg-primary/12 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="new-owner"
                    value={p.id}
                    checked={pick === p.id}
                    onChange={() => setPick(p.id)}
                    className="sr-only"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.email}
                    </span>
                  </span>
                  <RoleBadge role={p.role} />
                </label>
              ))
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              disabled={!pick}
              loading={m.isPending}
              onClick={() =>
                pick && m.mutate({ universityId: u.id, userId: pick })
              }
            >
              Transfer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
