"use client";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { useToast } from "./ui/toast";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_BYTES = 5 * 1024 * 1024;

type Allowed = (typeof ALLOWED)[number];

/** Hidden file input + "Add image" button; uploads straight to MinIO via a presigned URL, then confirms. */
export function ImageUploader({
  kind,
  onUploaded,
  multiple,
}: {
  kind: "avatar" | "attachment";
  onUploaded: (a: { id: string; key: string }) => void;
  multiple?: boolean;
}) {
  const trpc = useTRPC();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ id: string; name: string }[]>([]);
  const createUpload = useMutation(trpc.files.createUpload.mutationOptions());
  const confirm = useMutation(trpc.files.confirm.mutationOptions());

  async function uploadOne(file: File) {
    const localId = crypto.randomUUID();
    setPending((p) => [...p, { id: localId, name: file.name }]);
    try {
      if (!ALLOWED.includes(file.type as Allowed)) {
        throw new Error(`${file.name}: unsupported file type`);
      }
      if (file.size > MAX_BYTES) {
        throw new Error(`${file.name}: file is too large (max 5 MB)`);
      }
      const { key, url } = await createUpload.mutateAsync({
        kind,
        mime: file.type as Allowed,
        size: file.size,
      });
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`${file.name}: upload failed`);
      const att = await confirm.mutateAsync({ key });
      onUploaded(att);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPending((p) => p.filter((x) => x.id !== localId));
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await Promise.all((multiple ? files : files.slice(0, 1)).map(uploadOne));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="tonal"
        icon="add_photo_alternate"
        onClick={() => inputRef.current?.click()}
      >
        Add image
      </Button>
      {pending.map((p) => (
        <span
          key={p.id}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Spinner size={16} />
          {p.name}
        </span>
      ))}
    </div>
  );
}
