"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { timeAgo } from "@/components/author-line";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tab, TabsList, TabsPanel, TabsRoot } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/components/user-menu";
import { UNIVERSITY_STATUSES, type UniversityStatus } from "@/db/schema";
import { useTRPC } from "@/lib/trpc";

const LABEL: Record<UniversityStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  REJECTED: "Rejected",
};

export function PlatformView() {
  const { me, isLoading } = useMe();
  const trpc = useTRPC();
  const list = useQuery(
    trpc.platform.universities.queryOptions(
      {},
      { enabled: !!me?.isPlatformAdmin },
    ),
  );

  if (isLoading)
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  if (!me?.isPlatformAdmin)
    return (
      <EmptyState
        icon="block"
        title="Platform admins only"
        body="You don't have access to the platform console."
      />
    );

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <NewUniversityDialog />
      </div>
      <TabsRoot defaultValue="PENDING">
        <TabsList>
          {UNIVERSITY_STATUSES.map((s) => (
            <Tab key={s} value={s}>
              {LABEL[s]}
              {list.data && (
                <span className="text-muted-foreground tabular-nums">
                  {list.data.filter((u) => u.status === s).length}
                </span>
              )}
            </Tab>
          ))}
        </TabsList>
        {UNIVERSITY_STATUSES.map((s) => (
          <TabsPanel key={s} value={s}>
            {list.isError ? (
              <p className="py-16 text-center text-sm text-destructive">
                {list.error.message}
              </p>
            ) : !list.data ? (
              <div className="grid place-items-center py-16">
                <Spinner />
              </div>
            ) : (
              <UniversityList items={list.data.filter((u) => u.status === s)} />
            )}
          </TabsPanel>
        ))}
      </TabsRoot>
    </div>
  );
}

type Row = {
  id: string;
  name: string;
  status: UniversityStatus;
  website: string | null;
  createdAt: Date;
  members: number;
  owner: { name: string; email: string; verified: boolean } | null;
};

function UniversityList({ items }: { items: Row[] }) {
  if (items.length === 0)
    return <EmptyState icon="domain" title="Nothing here" />;
  return (
    <div className="flex flex-col gap-2">
      {items.map((u) => (
        <Card key={u.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex min-w-48 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{u.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {u.owner
                ? `${u.owner.name} · ${u.owner.email}${u.owner.verified ? "" : " · Email not verified yet"}`
                : "No owner yet"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {u.website && (
                <>
                  <a
                    href={u.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    {u.website.replace(/^https?:\/\//, "")}
                  </a>
                  {" · "}
                </>
              )}
              {u.members} member{u.members === 1 ? "" : "s"} ·{" "}
              {timeAgo(u.createdAt)}
            </span>
          </div>
          {u.status === "PENDING" && (
            <div className="ml-auto flex gap-2">
              <Decide u={u} action="reject" />
              {u.owner?.verified && <Decide u={u} action="approve" />}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Decide({ u, action }: { u: Row; action: "approve" | "reject" }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const approve = action === "approve";
  const m = useMutation(
    (approve ? trpc.platform.approve : trpc.platform.reject).mutationOptions({
      onSuccess: () => {
        toast.success(approve ? `${u.name} is live` : `${u.name} rejected`);
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
            variant={approve ? "filled" : "ghost"}
            icon={approve ? "check" : "close"}
          />
        }
      >
        {approve ? "Approve" : "Reject"}
      </Dialog.Trigger>
      <DialogContent
        title={approve ? `Approve ${u.name}?` : `Reject ${u.name}?`}
        description={
          approve
            ? "The workspace goes live and its owner gets access."
            : "The university is hidden and its members lose access."
        }
      >
        <div className="flex justify-end gap-2">
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
          <Button
            variant={approve ? "filled" : "destructive"}
            loading={m.isPending}
            onClick={() => m.mutate({ universityId: u.id })}
          >
            {approve ? "Approve" : "Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}

function NewUniversityDialog() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", ownerEmail: "" });
  const create = useMutation(
    trpc.platform.createUniversity.mutationOptions({
      onError: (e) =>
        toast.error(e.data?.zod ? "Check the details" : e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });
  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setForm({ name: "", website: "", ownerEmail: "" });
      create.reset();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger render={<Button icon="add" />}>
        New university
      </Dialog.Trigger>
      <DialogContent
        title={create.data ? "Invite sent" : "New university"}
        description={
          create.data
            ? `We emailed the owner. The link works for 7 days.`
            : "It goes live right away. The owner gets an email invite."
        }
      >
        {create.data ? (
          <div className="flex flex-col gap-4">
            <TextField
              label="Invite link"
              readOnly
              value={create.data.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                icon="content_copy"
                onClick={() =>
                  navigator.clipboard
                    .writeText(create.data.inviteUrl)
                    .then(() => toast.success("Copied"))
                }
              >
                Copy
              </Button>
              <Dialog.Close render={<Button />}>Done</Dialog.Close>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                name: form.name.trim(),
                website: form.website.trim(),
                ownerEmail: form.ownerEmail.trim(),
              });
            }}
          >
            <TextField
              label="Name"
              required
              minLength={2}
              maxLength={120}
              {...field("name")}
            />
            <TextField
              label="Website"
              type="url"
              placeholder="https://"
              description="Optional"
              {...field("website")}
            />
            <TextField
              label="Owner email"
              type="email"
              required
              {...field("ownerEmail")}
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog.Root>
  );
}
