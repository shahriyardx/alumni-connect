"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeTag } from "@/lib/tags";
import { useTRPC } from "@/lib/trpc";
import { Markdown } from "./markdown";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Icon } from "./ui/icon";
import { Spinner } from "./ui/spinner";
import { Tab, TabsList, TabsPanel, TabsRoot } from "./ui/tabs";
import { TextField } from "./ui/text-field";
import { useToast } from "./ui/toast";

const MAX_TAGS = 5;

type Initial = { id: string; title: string; body: string; tags: string[] };

/** `/new` when no postId; `/p/[id]/edit` loads the post first. */
export function Composer({ postId }: { postId?: string }) {
  const trpc = useTRPC();
  const existing = useQuery({
    ...trpc.post.byId.queryOptions({ id: postId ?? "" }),
    enabled: !!postId,
  });
  if (postId) {
    if (existing.isError)
      return (
        <p className="py-16 text-center text-sm text-error">
          This post doesn't exist or was removed.
        </p>
      );
    if (!existing.data)
      return (
        <div className="grid place-items-center py-24">
          <Spinner />
        </div>
      );
  }
  return <ComposerForm initial={existing.data} />;
}

function ComposerForm({ initial }: { initial?: Initial }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [draftTag, setDraftTag] = useState("");

  const opts = {
    onSuccess: ({ id }: { id: string }) => {
      void qc.invalidateQueries(trpc.post.pathFilter());
      router.push(`/p/${id}`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = useMutation(trpc.post.create.mutationOptions(opts));
  const update = useMutation(trpc.post.update.mutationOptions(opts));
  const pending = create.isPending || update.isPending;

  function addTag(raw: string) {
    const t = normalizeTag(raw);
    setDraftTag("");
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
    setTags([...tags, t]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const all = draftTag ? [...tags, normalizeTag(draftTag)] : tags;
    const input = { title: title.trim(), body, tags: all.filter(Boolean) };
    if (initial) update.mutate({ id: initial.id, ...input });
    else create.mutate(input);
  }

  const preview = normalizeTag(draftTag);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {initial ? "Edit post" : "Ask a question"}
      </h1>

      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={5}
        maxLength={200}
      />

      <Card variant="filled" className="overflow-hidden">
        <TabsRoot defaultValue="write">
          <TabsList className="px-2">
            <Tab value="write" icon="edit">
              Write
            </Tab>
            <Tab value="preview" icon="visibility">
              Preview
            </Tab>
          </TabsList>
          <TabsPanel value="write" className="p-0">
            <textarea
              aria-label="Body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={20000}
              rows={12}
              placeholder="Details (Markdown supported)"
              className="block min-h-64 w-full resize-y bg-transparent px-5 py-4 font-mono text-[15px] leading-relaxed text-on-surface caret-primary outline-none placeholder:font-sans placeholder:text-on-surface-variant"
            />
          </TabsPanel>
          <TabsPanel value="preview" className="min-h-64 px-5 py-4">
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Nothing to preview yet.
              </p>
            )}
          </TabsPanel>
        </TabsRoot>
      </Card>

      <div className="flex flex-col gap-2">
        <TextField
          label={`Tags (${tags.length}/${MAX_TAGS})`}
          value={draftTag}
          disabled={tags.length >= MAX_TAGS}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) addTag(v.slice(0, -1));
            else setDraftTag(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(draftTag);
            } else if (e.key === "Backspace" && !draftTag && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          description={
            preview && preview !== draftTag
              ? `Will be saved as #${preview}`
              : "Press Enter or comma to add a tag."
          }
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex h-8 items-center gap-1 rounded-[12px] bg-secondary-container pr-1 pl-3 text-sm font-medium text-on-secondary-container"
              >
                #{t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-on-secondary-container/10"
                >
                  <Icon name="close" size={16} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Attachments uploader lands in Task 8. */}
      <div data-slot="attachments" />

      <div className="flex justify-end gap-2">
        <Button variant="text" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" icon="send" loading={pending}>
          {initial ? "Save changes" : "Post"}
        </Button>
      </div>
    </form>
  );
}
