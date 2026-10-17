"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fmtDate,
  LoadError,
  Loading,
} from "@/components/platform/platform-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/components/user-menu";
import { PageHeader } from "@/components/workspace/workspace-shell";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Admin = RouterOutputs["platform"]["admins"][number];

export function AdminsView() {
  const trpc = useTRPC();
  const { me } = useMe();
  const list = useQuery(trpc.platform.admins.queryOptions());
  return (
    <>
      <PageHeader title="Admins" sub="Who can run the platform." />
      <AddAdmin />
      {list.isError ? (
        <LoadError message={list.error.message} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Card className="flex flex-col p-2">
          {list.data.map((a) => (
            <div
              key={a.email}
              className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3"
            >
              <Avatar name={a.name ?? a.email} size={36} />
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">
                  {a.name ?? "No account yet"}
                  {a.userId === me?.id && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (you)
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {a.email}
                  {a.userId && !a.verified ? " · not verified" : ""}
                  {a.createdAt
                    ? ` · since ${fmtDate.format(new Date(a.createdAt))}`
                    : ""}
                </span>
              </div>
              {a.fromEnv ? (
                <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                  from .env
                </span>
              ) : (
                a.userId &&
                a.userId !== me?.id && <RemoveAdmin a={a} userId={a.userId} />
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function AddAdmin() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const m = useMutation(
    trpc.platform.addAdmin.mutationOptions({
      onSuccess: () => {
        toast.success("Admin added");
        setEmail("");
      },
      onError: (e) =>
        toast.error(e.data?.zod ? "Enter a valid email" : e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ email: email.trim() });
      }}
    >
      <TextField
        label="Add an admin"
        type="email"
        required
        placeholder="Email of a verified account"
        description="They get full platform access."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 basis-64 sm:max-w-sm"
      />
      <Button type="submit" icon="person_add" loading={m.isPending}>
        Add
      </Button>
    </form>
  );
}

function RemoveAdmin({ a, userId }: { a: Admin; userId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const m = useMutation(
    trpc.platform.removeAdmin.mutationOptions({
      onSuccess: () => {
        toast.success("Admin removed");
        setOpen(false);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={<Button size="sm" variant="ghost" icon="person_remove" />}
      >
        Remove
      </Dialog.Trigger>
      <DialogContent
        title={`Remove ${a.name ?? a.email}?`}
        description="They lose access to the platform console."
      >
        <div className="flex justify-end gap-2">
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
          <Button
            variant="destructive"
            loading={m.isPending}
            onClick={() => m.mutate({ userId })}
          >
            Remove
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
