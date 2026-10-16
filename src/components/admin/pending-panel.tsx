"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { timeAgo } from "../author-line";
import { Avatar } from "../ui/avatar";
import { RoleBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Spinner } from "../ui/spinner";
import { useToast } from "../ui/toast";

export function PendingPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const pending = useQuery(trpc.admin.pendingUsers.queryOptions());
  const approve = useMutation(
    trpc.admin.approveUser.mutationOptions({
      onSuccess: () => toast.success("Account approved"),
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.admin.pathFilter()),
    }),
  );

  if (pending.isError)
    return (
      <p className="py-16 text-center text-sm text-destructive">
        {pending.error.message}
      </p>
    );
  if (!pending.data)
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  if (pending.data.length === 0)
    return (
      <EmptyState
        icon="how_to_reg"
        title="No one is waiting"
        body="Verified sign-ups that need manual approval show up here."
      />
    );

  return (
    <Card className="flex flex-col p-2">
      {pending.data.map((u) => (
        <div
          key={u.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl p-3"
        >
          <Avatar name={u.name} size={36} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {u.name} <RoleBadge role={u.role} />
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {u.email} · {u.batchNumber != null && `Batch ${u.batchNumber} · `}
              {u.department} · signed up {timeAgo(u.createdAt)}
            </span>
          </div>
          <Button
            size="sm"
            icon="check"
            loading={approve.isPending && approve.variables?.userId === u.id}
            onClick={() => approve.mutate({ userId: u.id })}
          >
            Approve
          </Button>
        </div>
      ))}
    </Card>
  );
}
