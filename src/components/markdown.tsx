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
    <h1 {...p} className="mt-6 text-2xl font-[650] tracking-tight" />
  ),
  h2: ({ node: _, ...p }) => (
    <h2 {...p} className="mt-6 text-xl font-[650] tracking-tight" />
  ),
  h3: ({ node: _, ...p }) => (
    <h3 {...p} className="mt-5 text-lg font-semibold" />
  ),
  h4: ({ node: _, ...p }) => (
    <h4 {...p} className="mt-4 text-base font-semibold" />
  ),
  ul: ({ node: _, ...p }) => (
    <ul {...p} className="list-disc pl-6 marker:text-primary" />
  ),
  ol: ({ node: _, ...p }) => (
    <ol {...p} className="list-decimal pl-6 marker:text-primary" />
  ),
  blockquote: ({ node: _, ...p }) => (
    <blockquote
      {...p}
      className="border-l-4 border-primary py-0.5 pl-4 text-on-surface-variant"
    />
  ),
  pre: ({ node: _, ...p }) => (
    <pre
      {...p}
      className="overflow-x-auto rounded-[16px] bg-surface-container-highest p-4 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  code: ({ node: _, ...p }) => (
    <code
      {...p}
      className="rounded-[6px] bg-surface-container-highest px-1.5 py-0.5 font-mono text-[0.9em]"
    />
  ),
  hr: () => <hr className="border-outline-variant" />,
  table: ({ node: _, ...p }) => (
    <div className="overflow-x-auto">
      <table {...p} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: ({ node: _, ...p }) => (
    <th
      {...p}
      className="border-b border-outline-variant px-3 py-2 text-left font-semibold"
    />
  ),
  td: ({ node: _, ...p }) => (
    <td {...p} className="border-b border-outline-variant/60 px-3 py-2" />
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
        "flex min-w-0 flex-col gap-3 text-base leading-relaxed break-words",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
