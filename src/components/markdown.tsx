"use client";
import { useRef, useState } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { LANGUAGES } from "@/lib/highlight";
import { Icon } from "./ui/icon";

const rehypePlugins: Options["rehypePlugins"] = [
  [rehypeHighlight, { languages: LANGUAGES, plainText: ["text"] }],
];

/** Fenced block: language label + copy button over a horizontally scrolling body. */
function CodeBlock({
  lang,
  className,
  ...p
}: React.ComponentProps<"pre"> & { lang?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div
      data-slot="code-block"
      className="group/code relative min-w-0 rounded-xl bg-surface-high"
    >
      <div className="flex h-8 items-center justify-between pr-1 pl-3.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang ?? "code"}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(ref.current?.textContent ?? "")
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
          }}
          className="grid size-7 cursor-pointer place-items-center rounded-full outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Icon name={copied ? "check" : "content_copy"} size={16} />
        </button>
      </div>
      <pre
        {...p}
        ref={ref}
        className={cn(
          "overflow-x-auto px-3.5 pb-3 text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0",
          className,
        )}
      />
    </div>
  );
}

// Raw HTML is never rendered (no rehype-raw): `<script>` shows up as text.
// rehype-highlight only adds `<span class="hljs-…">` around text tokens.
const components: Components = {
  a: ({ node: _, ...p }) => (
    <a
      {...p}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    />
  ),
  h1: ({ node: _, ...p }) => (
    <h1 {...p} className="mt-4 text-xl font-semibold tracking-tight" />
  ),
  h2: ({ node: _, ...p }) => (
    <h2 {...p} className="mt-4 text-lg font-semibold tracking-tight" />
  ),
  h3: ({ node: _, ...p }) => (
    <h3 {...p} className="mt-3 text-base font-semibold" />
  ),
  h4: ({ node: _, ...p }) => (
    <h4 {...p} className="mt-3 text-sm font-semibold" />
  ),
  ul: ({ node: _, ...p }) => (
    <ul {...p} className="list-disc pl-5 marker:text-muted-foreground" />
  ),
  ol: ({ node: _, ...p }) => (
    <ol {...p} className="list-decimal pl-5 marker:text-muted-foreground" />
  ),
  blockquote: ({ node: _, ...p }) => (
    <blockquote
      {...p}
      className="border-l-2 border-border pl-3.5 text-muted-foreground"
    />
  ),
  pre: ({ node, ...p }) => {
    const code = node?.children[0];
    const cls =
      code?.type === "element" ? code.properties.className : undefined;
    const lang = Array.isArray(cls)
      ? cls
          .map(String)
          .find((c) => c.startsWith("language-"))
          ?.slice(9)
      : undefined;
    return <CodeBlock {...p} lang={lang} />;
  },
  code: ({ node: _, className, ...p }) => (
    <code
      {...p}
      className={cn(
        "rounded-md bg-surface-high px-1.5 py-0.5 font-mono text-[0.85em]",
        className,
      )}
    />
  ),
  hr: () => <hr className="border-border" />,
  table: ({ node: _, ...p }) => (
    <div className="overflow-x-auto">
      <table {...p} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: ({ node: _, ...p }) => (
    <th
      {...p}
      className="border-b border-border px-3 py-2 text-left font-semibold"
    />
  ),
  td: ({ node: _, ...p }) => (
    <td {...p} className="border-b border-border/60 px-3 py-2" />
  ),
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 text-[15px] leading-relaxed break-words",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
