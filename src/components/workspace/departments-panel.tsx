"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";
import { PageHeader } from "./workspace-shell";

type DepartmentRow = RouterOutputs["departments"]["withCounts"][number];

export function DepartmentsPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.departments.withCounts.queryOptions());
  const [name, setName] = useState("");
  const refresh = () => qc.invalidateQueries(trpc.departments.pathFilter());
  const add = useMutation(
    trpc.departments.add.mutationOptions({
      onSuccess: () => {
        toast.success("Department added");
        setName("");
      },
      onError: (e) => toast.error(e.message),
      onSettled: refresh,
    }),
  );

  return (
    <>
      <PageHeader
        title="Departments"
        sub="Sign-up, invites and profiles pick from this list."
      />
      <Card className="p-4 sm:p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) add.mutate({ name: trimmed });
          }}
        >
          <TextField
            label="Add a department"
            placeholder="CSE"
            className="min-w-48 flex-1"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            icon="add"
            loading={add.isPending}
            disabled={!name.trim()}
          >
            Add
          </Button>
        </form>
      </Card>

      {list.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {list.error.message}
        </p>
      ) : !list.data?.length ? (
        <Card>
          <EmptyState
            icon="apartment"
            title="No departments yet"
            body="Add one above so sign-up and invite forms offer a picker instead of free text."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {list.data.map((d) => (
            <DepartmentRow key={d.id} d={d} />
          ))}
        </Card>
      )}
    </>
  );
}

function DepartmentRow({ d }: { d: DepartmentRow }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const refresh = () => qc.invalidateQueries(trpc.departments.pathFilter());
  const rename = useMutation(
    trpc.departments.rename.mutationOptions({
      onSuccess: () => {
        toast.success("Department renamed");
        setEditing(false);
      },
      onError: (e) => toast.error(e.message),
      onSettled: refresh,
    }),
  );
  const remove = useMutation(
    trpc.departments.remove.mutationOptions({
      onSuccess: () => {
        toast.success(`${d.name} removed`);
        setConfirmRemove(false);
      },
      onError: (e) => toast.error(e.message),
      onSettled: refresh,
    }),
  );
  const total = d.students + d.alumni + d.faculty;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed && trimmed !== d.name)
              rename.mutate({ id: d.id, name: trimmed });
            else setEditing(false);
          }}
        >
          <TextField
            label={`Rename ${d.name}`}
            hideLabel
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" loading={rename.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setName(d.name);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Link
          href={`/workspace/members?department=${encodeURIComponent(d.name)}`}
          className="flex min-w-0 flex-1 flex-col hover:underline"
        >
          <span className="truncate font-medium">{d.name}</span>
          <span className="text-xs text-muted-foreground">
            {[
              `${total} member${total === 1 ? "" : "s"}`,
              d.students &&
                `${d.students} student${d.students === 1 ? "" : "s"}`,
              d.alumni &&
                `${d.alumni} ${d.alumni === 1 ? "alumnus" : "alumni"}`,
              d.faculty && `${d.faculty} faculty`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Link>
      )}
      {!editing && (
        <div className="flex items-center gap-1">
          <IconButton
            icon="edit"
            label={`Rename ${d.name}`}
            onClick={() => setEditing(true)}
          />
          <IconButton
            icon="delete"
            label={`Remove ${d.name}`}
            onClick={() => setConfirmRemove(true)}
          />
        </div>
      )}
      <Dialog.Root open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent
          title={`Remove ${d.name}?`}
          description="Members keep their current department text; it just leaves the picker list."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate({ id: d.id })}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </div>
  );
}
