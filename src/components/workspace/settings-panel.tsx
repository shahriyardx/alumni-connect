"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { ImageUploader } from "../image-uploader";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";
import { PageHeader } from "./workspace-shell";

const STATUS = {
  ACTIVE: "Live — students can find and join your university.",
  PENDING: "Under review by the platform team.",
  REJECTED: "Application rejected.",
} as const;

export function SettingsPanel() {
  const trpc = useTRPC();
  const settings = useQuery(trpc.workspace.settings.queryOptions());
  return (
    <>
      <PageHeader title="Settings" sub="How your university appears." />
      {settings.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {settings.error.message}
        </p>
      ) : !settings.data ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </>
  );
}

function SettingsForm({
  initial,
}: {
  initial: RouterOutputs["workspace"]["settings"];
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [website, setWebsite] = useState(initial.website ?? "");
  const [logoKey, setLogoKey] = useState(initial.logoKey);
  // The logo card has no button of its own, so flag unsaved changes here.
  const dirty =
    name !== initial.name ||
    website !== (initial.website ?? "") ||
    logoKey !== initial.logoKey;
  const save = useMutation(
    trpc.workspace.updateSettings.mutationOptions({
      onSuccess: () => toast.success("Settings saved"),
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        void qc.invalidateQueries(trpc.workspace.settings.queryFilter());
        void qc.invalidateQueries(trpc.auth.me.queryFilter());
      },
    }),
  );

  return (
    <form
      className="grid gap-3 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ name, website, logoKey });
      }}
    >
      <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
        <TextField
          label="University name"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Website"
          type="url"
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {STATUS[initial.status]}
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty} loading={save.isPending}>
            Save changes
          </Button>
          {dirty && (
            <span className="text-sm text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <span className="text-sm font-medium">Logo</span>
        <div className="grid aspect-square w-32 place-items-center overflow-hidden rounded-3xl bg-surface-high">
          {logoKey ? (
            // biome-ignore lint/performance/noImgElement: private, presigned redirect — next/image can't optimize it
            <img
              src={`/api/files/${logoKey}`}
              alt="University logo"
              className="size-full bg-white object-contain"
            />
          ) : (
            <span className="text-4xl font-semibold text-muted-foreground">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Square PNG, JPEG or WebP, up to 5 MB. Shown in the sidebar.
        </p>
        <div className="flex flex-wrap gap-2">
          <ImageUploader
            kind="logo"
            label={logoKey ? "Replace" : "Upload logo"}
            onUploaded={(a) => setLogoKey(a.key)}
          />
          {logoKey && (
            <Button variant="ghost" onClick={() => setLogoKey(null)}>
              Remove
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
}
