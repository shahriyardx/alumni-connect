import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Form on the plain page, a small living collage of the product beside it on
 * wide screens. Phones get the form only.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
  wide,
  icon = "school",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  icon?: string;
}) {
  return (
    <main className="w-full flex-1 px-3 pt-4 pb-10 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-3 lg:min-h-[min(680px,calc(100dvh-7rem))] lg:grid-cols-2">
        <section
          className={cn(
            // pl-2 lines the form up with the logo in the header pill.
            "lp-rise flex py-6 pr-2 pl-2 lg:py-10 lg:pr-12",
            // Multi-step forms start at the top so steps don't jump around.
            wide ? "items-start" : "items-center",
          )}
        >
          <div className={cn("w-full", wide ? "max-w-lg" : "max-w-sm")}>
            <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
              <Icon name={icon} filled size={24} />
            </span>
            <h1 className="text-4xl leading-[0.95] font-bold tracking-tighter sm:text-5xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                {subtitle}
              </p>
            )}
            <div className="mt-8">{children}</div>
          </div>
        </section>

        <Showcase />
      </div>
    </main>
  );
}

const faces = [
  { i: "SR", tone: "bg-[#a78bfa] text-[#1e1b4b]" },
  { i: "AC", tone: "bg-[#67e8f9] text-[#083344]" },
  { i: "TS", tone: "bg-[#fdba74] text-[#431407]" },
];

/** Decorative: a question, its accepted answer and who's around. */
function Showcase() {
  return (
    <aside
      aria-hidden
      className="lp-rise relative isolate hidden overflow-hidden rounded-[2.5rem] bg-primary p-10 [animation-delay:80ms] lg:flex lg:flex-col lg:justify-center dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]"
    >
      <div className="lp-drift pointer-events-none absolute -top-32 -right-24 -z-10 size-[26rem] rounded-full bg-violet-500/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-20 -z-10 h-72 w-[28rem] rounded-full bg-cyan-400/30 blur-3xl" />

      <div className="mx-auto flex w-full max-w-sm flex-col gap-3 text-sm">
        <div className="lp-bob rounded-3xl bg-white p-5 text-[#0f172a] shadow-xl shadow-black/15 [animation-duration:8s]">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="grid size-6 place-items-center rounded-full bg-[#fdba74] text-[10px] font-semibold text-[#431407]">
              TS
            </span>
            Student · CSE
          </div>
          <p className="mt-3 font-semibold">
            Which electives helped you land a job?
          </p>
          <div className="mt-3 flex gap-1.5">
            {["career", "cse"].map((t) => (
              <span
                key={t}
                className="rounded-full bg-[#eef2ff] px-2.5 py-0.5 text-xs text-[#4338ca]"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>

        <div className="lp-bob ml-10 rounded-3xl bg-[#1e1b4b] p-5 text-white shadow-xl shadow-black/20 [animation-delay:1.5s] [animation-duration:8s]">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-[#a78bfa] text-[10px] font-semibold text-[#1e1b4b]">
                SR
              </span>
              Alumna · 2019
            </span>
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
              <Icon name="check_circle" filled size={14} />
              Accepted
            </span>
          </div>
          <p className="mt-3 text-white/90">
            Distributed Systems and the ML elective. Both came up in every
            interview.
          </p>
        </div>

        <div className="mr-16 flex items-center justify-between gap-3 rounded-full bg-white/15 py-2 pr-4 pl-2 text-white backdrop-blur-sm">
          <span className="flex -space-x-2">
            {faces.map((f, i) => (
              <span
                key={f.i}
                style={{ zIndex: faces.length - i }}
                className={`grid size-8 place-items-center rounded-full text-[11px] font-semibold ${f.tone}`}
              >
                {f.i}
              </span>
            ))}
          </span>
          <span className="flex items-center gap-1 text-xs">
            <Icon name="verified" filled size={14} />
            Verified only
          </span>
        </div>
      </div>
    </aside>
  );
}
