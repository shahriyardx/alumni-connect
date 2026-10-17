"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { rosterFileToCsv } from "@/lib/roster-file";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { Button, buttonClasses } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Menu, MenuContent, MenuItem } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";
import { PageHeader } from "./workspace-shell";

type Batch = RouterOutputs["workspace"]["batches"][number];
type ImportResult = RouterOutputs["admin"]["importRoster"];

const SAMPLE = `student_id,department,name
STU-20300001,CSE,Rahim Uddin
STU-20300002,EEE,
`;
const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;
// Server caps `csv` at 2,000,000 chars; xlsx is zipped, so allow a bit more.
const MAX_FILE = 4_000_000;
const thisYear = new Date().getFullYear();

export function BatchesPanel() {
  const trpc = useTRPC();
  const batches = useQuery(trpc.workspace.batches.queryOptions());
  const [editing, setEditing] = useState<Batch | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Batches & rosters"
        sub="Students pick their batch at sign-up. A roster lets approvers see who's on it."
        action={
          <Button icon="add" onClick={() => setEditing("new")}>
            New batch
          </Button>
        }
      />
      {batches.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {batches.error.message}
        </p>
      ) : !batches.data ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : batches.data.length === 0 ? (
        <Card>
          <EmptyState
            icon="groups"
            title="No batches yet"
            body="Add a batch with its graduation year, then upload its roster."
            action={
              <Button icon="add" onClick={() => setEditing("new")}>
                New batch
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {batches.data.map((b) => (
            <BatchRow key={b.id} b={b} onEdit={() => setEditing(b)} />
          ))}
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 text-sm">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">Roster files</span>
          <span className="text-muted-foreground">
            Excel (.xlsx) or CSV with columns{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
              student_id, department, name
            </code>{" "}
            (name optional). Format the student ID column as Text in Excel to
            keep leading zeros. Student IDs are stored hashed; re-uploading
            moves an ID to that batch.
          </span>
        </div>
        <a
          href={SAMPLE_HREF}
          download="sample-roster.csv"
          className={buttonClasses("ghost", "sm")}
        >
          Download sample
        </a>
      </Card>

      <BatchDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        batch={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function BatchRow({ b, onEdit }: { b: Batch; onEdit: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries(trpc.workspace.batches.queryFilter());
    void qc.invalidateQueries(trpc.admin.audit.pathFilter());
  };
  const importRoster = useMutation(
    trpc.admin.importRoster.mutationOptions({
      onSuccess: setResult,
      onError: (e) => toast.error(e.message),
      onSettled: refresh,
    }),
  );
  const del = useMutation(
    trpc.workspace.deleteBatch.mutationOptions({
      onSuccess: () => toast.success(`Batch ${b.number} deleted`),
      onError: (e) => toast.error(e.message),
      onSettled: refresh,
    }),
  );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE) return toast.error("File is too large");
    setReading(true);
    try {
      const csv = await rosterFileToCsv(file);
      importRoster.mutate({ batchId: b.id, csv });
    } catch {
      toast.error("Couldn't read that file. Use .xlsx or .csv.");
    } finally {
      setReading(false);
    }
  };
  const graduated = b.graduationYear < thisYear;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-36 flex-1 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-high text-lg font-semibold tracking-tight tabular-nums">
            {b.number}
          </span>
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight">
              Batch {b.number}
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              Class of {b.graduationYear}
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                  graduated
                    ? "bg-tonal text-tonal-fg"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {graduated ? "Alumni" : "Students"}
              </span>
            </span>
          </div>
        </div>
        <dl className="flex gap-6 text-sm">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">On roster</dt>
            <dd className="font-semibold tabular-nums">{b.rosterCount}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">Members</dt>
            <dd className="font-semibold tabular-nums">{b.members}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFile}
            className="sr-only"
            aria-label={`Roster file for batch ${b.number}`}
          />
          <Button
            variant="tonal"
            size="sm"
            icon="upload_file"
            loading={reading || importRoster.isPending}
            onClick={() => fileRef.current?.click()}
          >
            Upload roster
          </Button>
          <Menu.Root>
            <Menu.Trigger
              render={
                <IconButton
                  icon="more_vert"
                  label={`More for batch ${b.number}`}
                />
              }
            />
            <MenuContent>
              <MenuItem icon="edit" onClick={onEdit}>
                Edit
              </MenuItem>
              <MenuItem
                icon="delete"
                destructive
                onClick={() =>
                  b.members > 0
                    ? toast.error("This batch has members; it can't be deleted")
                    : del.mutate({ id: b.id })
                }
              >
                Delete
              </MenuItem>
            </MenuContent>
          </Menu.Root>
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-high p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p>
              <span className="font-semibold">{result.inserted}</span> added ·{" "}
              <span className="font-semibold">{result.updated}</span> updated ·{" "}
              <span
                className={
                  result.errors.length ? "font-semibold text-destructive" : ""
                }
              >
                {result.errors.length} skipped
              </span>
            </p>
            <IconButton
              icon="close"
              label="Dismiss result"
              onClick={() => setResult(null)}
            />
          </div>
          {result.errors.length > 0 && (
            <table className="w-full text-left">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="w-16 py-1 font-medium">Line</th>
                  <th className="py-1 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={`${e.line}-${e.message}`}>
                    <td className="py-1 align-top tabular-nums">{e.line}</td>
                    <td className="py-1">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

function BatchDialog({
  batch,
  onClose,
}: {
  batch: Batch | "new" | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = batch && batch !== "new" ? batch : null;
  const [number, setNumber] = useState(existing ? String(existing.number) : "");
  const [year, setYear] = useState(
    existing ? String(existing.graduationYear) : "",
  );
  const valid =
    Number(number) >= 1 &&
    Number(number) <= 9999 &&
    Number(year) >= 1950 &&
    Number(year) <= 2100;
  const save = useMutation(
    trpc.workspace.saveBatch.mutationOptions({
      onSuccess: () => {
        toast.success(`Batch ${number} saved`);
        onClose();
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        void qc.invalidateQueries(trpc.workspace.batches.queryFilter());
        void qc.invalidateQueries(trpc.admin.pathFilter());
      },
    }),
  );

  return (
    <Dialog.Root open={batch !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={existing ? `Edit batch ${existing.number}` : "New batch"}
        description="Students in a batch become Alumni once its graduation year has passed."
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid)
              save.mutate({
                id: existing?.id,
                number: Number(number),
                graduationYear: Number(year),
              });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Batch number"
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <TextField
              label="Graduation year"
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              required
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button type="submit" disabled={!valid} loading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog.Root>
  );
}
