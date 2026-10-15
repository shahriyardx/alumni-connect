import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

// Raw HTML is never rendered (no rehype-raw): `<script>` shows up as text.
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
  pre: ({ node: _, ...p }) => (
    <pre
      {...p}
      className="overflow-x-auto rounded-xl bg-surface-high p-3.5 text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  code: ({ node: _, ...p }) => (
    <code
      {...p}
      className="rounded-md bg-surface-high px-1.5 py-0.5 font-mono text-[0.85em]"
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
