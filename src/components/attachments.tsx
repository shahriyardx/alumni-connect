"use client";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { asFence, langForExt } from "@/lib/highlight";
import {
  ALL_EXTS,
  extOf,
  FILE_TYPES,
  type FileIcon,
  formatBytes,
  MAX_ATTACHMENTS,
  PREVIEW_BYTES,
} from "@/lib/uploads";
import type { AttachmentItem } from "@/server/attachments";
import { type Uploaded, useUpload } from "./image-uploader";
import { Markdown } from "./markdown";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { Spinner } from "./ui/spinner";

const ICONS: Record<FileIcon, string> = {
  image: "image",
  pdf: "picture_as_pdf",
  doc: "description",
  sheet: "table_chart",
  slides: "slideshow",
  text: "article",
  code: "code",
};
const iconFor = (name: string) =>
  ICONS[FILE_TYPES[extOf(name)]?.icon ?? "text"];
const ACCEPT = ALL_EXTS.map((e) => `.${e}`).join(",");
const fileUrl = (key: string) => `/api/files/${key}`;

function FileChip({
  name,
  size,
  href,
  className,
  children,
}: {
  name: string;
  size: number;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const label = (
    <>
      <Icon name={iconFor(name)} size={20} className="shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatBytes(size)}
      </span>
    </>
  );
  return (
    <div
      data-slot="file-chip"
      className={cn(
        "flex h-11 min-w-0 max-w-full items-center gap-1 rounded-xl bg-surface-high pr-1 pl-3 text-sm",
        className,
      )}
    >
      {href ? (
        <a
          href={href}
          download={name}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
      )}
      {children}
    </div>
  );
}

function ImageGrid({
  items,
  onRemove,
}: {
  items: { id: string; key: string }[];
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((a) => (
        <div
          key={a.id}
          className="relative aspect-square overflow-hidden rounded-2xl bg-surface-high"
        >
          <a
            href={fileUrl(a.key)}
            target="_blank"
            rel="noopener noreferrer"
            className="block size-full"
          >
            {/* biome-ignore lint/performance/noImgElement: auth-gated proxy, next/image can't optimise it */}
            <img
              src={fileUrl(a.key)}
              alt="Attachment"
              loading="lazy"
              className="size-full object-cover"
            />
          </a>
          {onRemove && (
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => onRemove(a.id)}
              className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full bg-inverse/80 text-inverse-fg outline-none hover:bg-inverse focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

type Pending = { id: string; name: string; size: number; progress: number };

/**
 * One "Attach" button for images and documents (max 5). Images show as
 * thumbnails, documents as chips; progress and errors render inline.
 */
export function AttachmentPicker({
  value,
  onChange,
  size,
}: {
  value: Uploaded[];
  onChange: React.Dispatch<React.SetStateAction<Uploaded[]>>;
  size?: "sm";
}) {
  const upload = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const used = value.length + pending.length;

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setPending((p) => [
      ...p,
      { id, name: file.name, size: file.size, progress: 0 },
    ]);
    try {
      const att = await upload(file, "attachment", (progress) =>
        setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x))),
      );
      onChange((prev) => [...prev, att]);
    } catch (e) {
      setErrors((es) => [
        ...es,
        e instanceof Error ? e.message : "Upload failed",
      ]);
    } finally {
      setPending((p) => p.filter((x) => x.id !== id));
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_ATTACHMENTS - used;
    setErrors(
      files.length > room ? [`Up to ${MAX_ATTACHMENTS} files per post`] : [],
    );
    void Promise.all(files.slice(0, Math.max(0, room)).map(uploadOne));
  }

  const remove = (id: string) =>
    onChange((prev) => prev.filter((x) => x.id !== id));
  const docs = value.filter((a) => !a.image);

  return (
    <div data-slot="attachments" className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="tonal"
        size={size}
        icon="attach_file"
        className="w-fit"
        disabled={used >= MAX_ATTACHMENTS}
        onClick={() => inputRef.current?.click()}
      >
        {used > 0 ? `Attach (${used}/${MAX_ATTACHMENTS})` : "Attach"}
      </Button>
      <ImageGrid items={value.filter((a) => a.image)} onRemove={remove} />
      {(docs.length > 0 || pending.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {docs.map((a) => (
            <FileChip key={a.id} name={a.name} size={a.size}>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => remove(a.id)}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon name="close" size={16} />
              </button>
            </FileChip>
          ))}
          {pending.map((p) => (
            <FileChip
              key={p.id}
              name={p.name}
              size={p.size}
              className="relative overflow-hidden"
            >
              <span className="grid size-8 shrink-0 place-items-center">
                <Spinner size={16} />
              </span>
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-0.5 bg-primary transition-[width] duration-150"
                style={{ width: `${Math.round(p.progress * 100)}%` }}
              />
            </FileChip>
          ))}
        </div>
      )}
      {errors.map((m) => (
        <p
          key={m}
          role="alert"
          className="flex items-center gap-1.5 text-xs text-destructive"
        >
          <Icon name="error" size={16} />
          {m}
        </p>
      ))}
    </div>
  );
}

function FilePreview({ item }: { item: AttachmentItem }) {
  const name = item.filename ?? item.key;
  const q = useQuery({
    queryKey: ["file-preview", item.key],
    queryFn: async () => {
      const r = await fetch(fileUrl(item.key));
      if (!r.ok) throw new Error("Couldn't load the file");
      return r.text();
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (q.isError)
    return <p className="text-xs text-destructive">{q.error.message}</p>;
  if (q.data === undefined)
    return (
      <div className="grid place-items-center py-6">
        <Spinner size={20} />
      </div>
    );
  // A fenced block through the same Markdown: highlighted text, never HTML.
  return (
    <Markdown className="text-sm [&_pre]:max-h-96 [&_pre]:overflow-y-auto">
      {asFence(q.data, langForExt(extOf(name)))}
    </Markdown>
  );
}

function DocumentRow({ item }: { item: AttachmentItem }) {
  const [open, setOpen] = useState(false);
  const name = item.filename ?? item.key.split("/").pop() ?? "file";
  const previewable =
    item.mime.startsWith("text/") && item.size <= PREVIEW_BYTES;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FileChip name={name} size={item.size} href={fileUrl(item.key)}>
        {previewable && (
          <Button
            variant="ghost"
            size="sm"
            icon={open ? "visibility_off" : "visibility"}
            aria-expanded={open}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Preview"}
          </Button>
        )}
        <a
          href={fileUrl(item.key)}
          download={name}
          aria-label={`Download ${name}`}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Icon name="download" size={18} />
        </a>
      </FileChip>
      {open && <FilePreview item={item} />}
    </div>
  );
}

/** Read-only attachments of a post or comment. */
export function AttachmentList({ items }: { items: AttachmentItem[] }) {
  if (items.length === 0) return null;
  const docs = items.filter((a) => a.kind === "DOCUMENT");
  return (
    <div data-slot="attachment-list" className="flex min-w-0 flex-col gap-2">
      <ImageGrid items={items.filter((a) => a.kind === "IMAGE")} />
      {docs.map((a) => (
        <DocumentRow key={a.id} item={a} />
      ))}
    </div>
  );
}
