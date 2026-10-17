"use client";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import {
  extOf,
  FILE_TYPES,
  formatBytes,
  IMAGE_EXTS,
  maxBytesFor,
} from "@/lib/uploads";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { useToast } from "./ui/toast";

export type Uploaded = {
  id: string;
  key: string;
  name: string;
  size: number;
  image: boolean;
};

type Kind = "avatar" | "attachment" | "logo";

/** Multipart POST to the presigned policy, reporting 0..1 progress. */
function postForm(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (p: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append("file", file); // must come last for S3 POST
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error("upload failed"));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(form);
  });
}

/**
 * Validates type/size client-side (the server re-checks the real bytes),
 * uploads straight to MinIO, then confirms. Throws with a short message.
 */
export function useUpload() {
  const trpc = useTRPC();
  const createUpload = useMutation(trpc.files.createUpload.mutationOptions());
  const confirm = useMutation(trpc.files.confirm.mutationOptions());
  async function run(file: File, kind: Kind, onProgress: (p: number) => void) {
    const ext = extOf(file.name);
    const type = FILE_TYPES[ext];
    const image = IMAGE_EXTS.includes(ext);
    if (!type || (kind !== "attachment" && !image))
      throw new Error("file type not allowed");
    const max = maxBytesFor(type);
    if (file.size > max) throw new Error(`too large (max ${formatBytes(max)})`);
    if (file.size === 0) throw new Error("file is empty");
    const up = await createUpload.mutateAsync({ kind, ext, size: file.size });
    await postForm(up.url, up.fields, file, onProgress);
    const att = await confirm.mutateAsync({ key: up.key, name: file.name });
    return { ...att, name: file.name, size: file.size, image };
  }
  return (
    file: File,
    kind: Kind,
    onProgress: (p: number) => void = () => {},
  ): Promise<Uploaded> =>
    run(file, kind, onProgress).catch((e) => {
      throw new Error(
        `${file.name}: ${e instanceof Error ? e.message : "upload failed"}`,
      );
    });
}

/** Hidden file input + "Add image" button for avatars and logos. */
export function ImageUploader({
  kind,
  onUploaded,
  label = "Add image",
}: {
  kind: Kind;
  label?: string;
  onUploaded: (a: { id: string; key: string }) => void;
}) {
  const toast = useToast();
  const upload = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPending(file.name);
    try {
      onUploaded(await upload(file, kind));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_EXTS.map((x) => `.${x}`).join(",")}
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="tonal"
        icon="add_photo_alternate"
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {pending && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner size={16} />
          {pending}
        </span>
      )}
    </div>
  );
}
