"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button, buttonClasses } from "../ui/button";
import { Card } from "../ui/card";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";

const SAMPLE = `student_id,department,name
NUB-20300001,CSE,Rahim Uddin
NUB-20300002,EEE,
`;
// Server caps `csv` at 2,000,000 chars.
const MAX_BYTES = 2_000_000;
const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;

export function RosterPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const batchOk =
    Number(batchNumber) >= 1 &&
    Number(batchNumber) <= 9999 &&
    Number(graduationYear) >= 1950 &&
    Number(graduationYear) <= 2100;
  const stats = useQuery(trpc.admin.rosterStats.queryOptions());
  const importRoster = useMutation(
    trpc.admin.importRoster.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries(trpc.admin.rosterStats.queryFilter());
        void qc.invalidateQueries(trpc.admin.audit.pathFilter());
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File is too large (max 2 MB)");
      return;
    }
    importRoster.mutate({
      csv: await file.text(),
      batchNumber: Number(batchNumber),
      graduationYear: Number(graduationYear),
    });
  };
  const r = importRoster.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1 p-5">
          <span className="text-xs text-muted-foreground">Roster entries</span>
          <span className="text-3xl font-semibold tracking-tighter tabular-nums">
            {stats.data?.total ?? "–"}
          </span>
        </Card>
        <Card className="flex flex-col gap-1 p-5">
          <span className="text-xs text-muted-foreground">Graduated</span>
          <span className="text-3xl font-semibold tracking-tighter tabular-nums">
            {stats.data?.graduated ?? "–"}
          </span>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold tracking-tight">Import roster CSV</h2>
          <p className="text-sm text-muted-foreground">
            Columns:{" "}
            <code className="break-all">student_id,department[,name]</code>.
            Pick the batch first. Existing IDs are updated; student IDs are
            stored hashed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Batch"
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
          />
          <TextField
            label="Graduation year"
            type="number"
            inputMode="numeric"
            min={1950}
            max={2100}
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="sr-only"
            aria-label="Roster CSV file"
          />
          <Button
            icon="upload_file"
            loading={importRoster.isPending}
            disabled={!batchOk}
            onClick={() => fileRef.current?.click()}
          >
            Upload CSV
          </Button>
          <a
            href={SAMPLE_HREF}
            download="sample-roster.csv"
            className={buttonClasses("ghost")}
          >
            Download sample
          </a>
        </div>

        {r && (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-high p-4 text-sm">
            <p>
              <span className="font-semibold">{r.inserted}</span> inserted ·{" "}
              <span className="font-semibold">{r.updated}</span> updated ·{" "}
              <span
                className={
                  r.errors.length ? "font-semibold text-destructive" : ""
                }
              >
                {r.errors.length} errors
              </span>
            </p>
            {r.note && <p className="text-muted-foreground">{r.note}</p>}
            {r.errors.length > 0 && (
              <table className="w-full text-left">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-16 py-1 font-medium">Line</th>
                    <th className="py-1 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {r.errors.map((e) => (
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
    </div>
  );
}
