"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fmtDateTime,
  LoadError,
  Loading,
} from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/workspace/workspace-shell";
import { useTRPC } from "@/lib/trpc";

export function BroadcastView() {
  const trpc = useTRPC();
  const past = useQuery(trpc.platform.broadcasts.queryOptions());
  return (
    <>
      <PageHeader
        title="Broadcast"
        sub="Notify every active member of every active university."
      />
      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2 lg:self-start">
          <Compose />
        </Card>
        <section className="flex flex-col gap-2 lg:col-span-3">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            Sent
          </h2>
          {past.isError ? (
            <LoadError message={past.error.message} />
          ) : !past.data ? (
            <Loading />
          ) : past.data.length === 0 ? (
            <EmptyState icon="campaign" title="Nothing sent yet" />
          ) : (
            past.data.map((b) => (
              <Card key={b.id} className="flex flex-col gap-1.5 p-5">
                <h3 className="font-semibold tracking-tight break-words">
                  {b.title}
                </h3>
                <p className="text-sm whitespace-pre-line break-words text-muted-foreground">
                  {b.body}
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDateTime.format(new Date(b.createdAt))} · {b.recipients}{" "}
                  recipient{b.recipients === 1 ? "" : "s"}
                  {b.actorName ? ` · ${b.actorName}` : ""}
                </span>
              </Card>
            ))
          )}
        </section>
      </div>
    </>
  );
}

function Compose() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ title: "", body: "" });
  const [confirm, setConfirm] = useState(false);
  const send = useMutation(
    trpc.platform.broadcast.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          `Sent to ${r.recipients} member${r.recipients === 1 ? "" : "s"}`,
        );
        setForm({ title: "", body: "" });
        setConfirm(false);
      },
      onError: (e) =>
        toast.error(e.data?.zod ? "Check the title and message" : e.message),
      onSettled: () => qc.invalidateQueries(trpc.platform.pathFilter()),
    }),
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
    >
      <TextField
        label="Title"
        required
        minLength={3}
        maxLength={120}
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <TextField
        label="Message"
        multiline
        rows={5}
        required
        maxLength={2000}
        value={form.body}
        onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
      />
      <Button type="submit" icon="send" className="self-end">
        Send
      </Button>
      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Send to everyone?"
          description="Every active member of every active university gets this notification. It can't be unsent."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              loading={send.isPending}
              onClick={() =>
                send.mutate({
                  title: form.title.trim(),
                  body: form.body.trim(),
                })
              }
            >
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </form>
  );
}
