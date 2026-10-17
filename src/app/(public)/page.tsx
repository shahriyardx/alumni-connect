import Link from "next/link";
import { Icon } from "@/components/ui/icon";

const tile = "rounded-[2.5rem]";
// White pill on the brand tile; the kit's buttons are for app surfaces.
const pill =
  "inline-flex items-center gap-2 rounded-full px-6 py-4 text-base font-semibold transition-[transform,background-color] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-white/60 active:scale-[0.97]";

const perks = [
  {
    icon: "verified",
    label: "Verified",
    tone: "bg-primary text-primary-foreground",
  },
  {
    icon: "manage_search",
    label: "Searchable",
    tone: "bg-[#0f766e] text-white",
  },
  { icon: "lock", label: "Campus only", tone: "bg-[#c2410c] text-white" },
  { icon: "bolt", label: "Live", tone: "bg-[#6d28d9] text-white" },
];

const faces = [
  { i: "SR", tone: "bg-[#a78bfa] text-[#1e1b4b]" },
  { i: "AC", tone: "bg-[#67e8f9] text-[#083344]" },
  { i: "TS", tone: "bg-[#fdba74] text-[#431407]" },
  { i: "MH", tone: "bg-[#86efac] text-[#052e16]" },
];

const steps = [
  {
    icon: "badge",
    label: "Join",
    hint: "Your ID card, checked by your university.",
    tone: "bg-primary text-primary-foreground",
  },
  {
    icon: "edit",
    label: "Ask",
    hint: "Courses, jobs, supervisors, anything.",
    tone: "bg-[#c2410c] text-white",
  },
  {
    icon: "school",
    label: "Learn",
    hint: "Alumni answer. The best one rises.",
    tone: "bg-[#6d28d9] text-white",
  },
];

const questions = [
  {
    title: "Which CSE electives helped you land a job?",
    tags: ["career", "cse"],
    votes: 42,
    answers: 12,
    solved: true,
  },
  {
    title: "Best supervisor for an ML thesis?",
    tags: ["thesis", "ml"],
    votes: 31,
    answers: 8,
    solved: true,
  },
  {
    title: "Is the summer internship worth it?",
    tags: ["internship"],
    votes: 17,
    answers: 5,
    solved: false,
  },
];

const tools = [
  { icon: "how_to_reg", label: "Approvals" },
  { icon: "groups", label: "Batches & rosters" },
  { icon: "apartment", label: "Departments" },
  { icon: "shield", label: "Moderation" },
];

export default function LandingPage() {
  return (
    <main className="w-full flex-1 px-3 pt-4 pb-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <section className="grid gap-3 lg:grid-cols-4 lg:grid-rows-[auto_auto]">
          {/* Brand tile: solid fill + blurred glows (gradients band). */}
          <div
            className={`lp-rise relative isolate overflow-hidden ${tile} bg-primary p-8 text-white sm:p-12 lg:col-span-3 lg:row-span-2 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]`}
          >
            <div
              aria-hidden
              className="lp-drift pointer-events-none absolute -top-32 -right-24 -z-10 size-[30rem] rounded-full bg-violet-500/50 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-40 -left-20 -z-10 h-72 w-[32rem] rounded-full bg-cyan-400/30 blur-3xl"
            />
            <span
              aria-hidden
              className="lp-bob pointer-events-none absolute right-8 bottom-6 hidden text-white/15 sm:block lg:right-12"
            >
              <Icon name="school" filled size={180} />
            </span>

            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs">
              <Icon name="verified" filled size={14} />
              Verified campuses
            </span>
            <h1 className="mt-8 text-[min(3rem,11vw)] leading-[0.95] font-bold tracking-tighter sm:text-7xl">
              Ask the{" "}
              <span className="inline-grid size-[0.9em] translate-y-[0.08em] place-items-center rounded-[0.25em] bg-white align-baseline text-primary">
                <Icon name="school" filled className="!text-[0.6em]" />
              </span>{" "}
              alumni.
              <span className="block opacity-70">Skip the guesswork.</span>
            </h1>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className={`${pill} bg-white text-[color-mix(in_srgb,var(--primary)_70%,black)] hover:bg-white/90`}
              >
                <Icon name="arrow_forward" size={20} />
                Get started
              </Link>
              <Link
                href="/sign-in"
                className={`${pill} bg-white/15 text-white hover:bg-white/25 lg:hidden`}
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* Sign-in tile: shape opens up on hover, like a door. */}
          <Link
            href="/sign-in"
            className={`group lp-rise [animation-delay:80ms] hidden flex-col justify-between ${tile} bg-[#4f46e5] p-7 text-white transition-[border-radius,background-color] duration-300 outline-none hover:rounded-[3.5rem] hover:bg-[#4338ca] focus-visible:ring-3 focus-visible:ring-ring/50 lg:flex`}
          >
            <Icon name="login" size={36} />
            <span className="mt-10 flex items-end justify-between gap-3">
              <span className="text-3xl leading-none font-bold tracking-tighter">
                Sign
                <br />
                in
              </span>
              <Icon
                name="arrow_forward"
                size={28}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>

          {/* Who's here: a stack of faces. */}
          <div
            aria-hidden
            className={`lp-rise [animation-delay:160ms] hidden flex-col justify-between ${tile} bg-[#1e1b4b] p-6 text-white lg:flex`}
          >
            <div className="flex -space-x-2">
              {faces.map((f, i) => (
                <span
                  key={f.i}
                  style={{ zIndex: faces.length - i }}
                  className={`grid size-12 place-items-center rounded-full text-sm font-semibold ring-4 ring-[#1e1b4b] ${f.tone}`}
                >
                  {f.i}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Alumni", "Faculty", "Students"].map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {perks.map((p, i) => (
            <div
              key={p.label}
              style={{ animationDelay: `${240 + i * 60}ms` }}
              className={`lp-rise group flex aspect-[4/3] flex-col justify-between ${tile} bg-surface p-6 transition-[border-radius] duration-300 hover:rounded-[3.5rem] sm:aspect-[5/3]`}
            >
              <span
                className={`grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 ${p.tone}`}
              >
                <Icon name={p.icon} filled size={24} />
              </span>
              <span className="text-xl font-bold tracking-tight sm:text-2xl">
                {p.label}
              </span>
            </div>
          ))}
        </section>

        {/* How it works: three steps, one word each. */}
        <section className="mt-16 grid gap-3 md:grid-cols-3">
          <h2 className="px-3 pb-2 text-3xl font-bold tracking-tighter sm:text-4xl md:col-span-3">
            Three steps.
          </h2>
          {steps.map((s, i) => (
            <div
              key={s.label}
              className={`group relative flex min-h-56 flex-col justify-between overflow-hidden ${tile} bg-surface p-7 transition-[border-radius] duration-300 hover:rounded-[3.5rem]`}
            >
              <span className="absolute -top-6 -right-2 text-[9rem] leading-none font-bold tracking-tighter text-foreground/5 select-none">
                {i + 1}
              </span>
              <span
                className={`grid size-14 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 ${s.tone}`}
              >
                <Icon name={s.icon} filled size={28} />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight">{s.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.hint}</p>
              </div>
            </div>
          ))}
        </section>

        {/* The feed, in miniature. */}
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div
            aria-hidden
            className={`flex min-w-0 flex-col gap-3 ${tile} bg-surface p-5 sm:p-7 lg:col-span-3`}
          >
            {questions.map((q) => (
              <div
                key={q.title}
                className="flex items-center gap-4 rounded-3xl bg-background p-4"
              >
                <span className="flex w-10 shrink-0 flex-col items-center text-sm font-semibold text-primary">
                  <Icon name="arrow_upward" size={18} />
                  {q.votes}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{q.title}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {q.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${q.solved ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                >
                  <Icon
                    name={q.solved ? "check_circle" : "forum"}
                    filled
                    size={14}
                  />
                  {q.answers}
                </span>
              </div>
            ))}
          </div>
          <div
            className={`flex flex-col justify-between gap-8 ${tile} bg-[#0f766e] p-8 text-white lg:col-span-2`}
          >
            <Icon name="forum" filled size={40} />
            <div>
              <p className="text-4xl leading-[0.95] font-bold tracking-tighter sm:text-5xl">
                Real answers.
                <span className="block opacity-60">
                  From people who were there.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* For universities. */}
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div
            className={`relative isolate flex flex-col justify-between gap-10 overflow-hidden ${tile} bg-[#1e1b4b] p-8 text-white sm:p-10 lg:col-span-2`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -bottom-24 -z-10 size-80 rounded-full bg-violet-500/40 blur-3xl"
            />
            <Icon name="domain_add" size={40} />
            <div>
              <p className="text-4xl leading-[0.95] font-bold tracking-tighter sm:text-5xl">
                Run your campus.
              </p>
              <Link
                href="/register-university"
                className={`${pill} mt-8 bg-white text-[#1e1b4b] hover:bg-white/90`}
              >
                <Icon name="arrow_forward" size={20} />
                Register your university
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:col-span-3">
            {tools.map((t) => (
              <div
                key={t.label}
                className={`group flex min-h-40 flex-col justify-between ${tile} bg-surface p-6 transition-[border-radius] duration-300 hover:rounded-[3.5rem]`}
              >
                <Icon
                  name={t.icon}
                  size={30}
                  className="text-primary transition-transform duration-300 group-hover:-rotate-6"
                />
                <span className="text-lg font-bold tracking-tight sm:text-xl">
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Closing call. */}
        <section
          className={`relative isolate mt-16 overflow-hidden ${tile} bg-primary px-8 py-14 text-center text-white sm:py-20 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]`}
        >
          <div
            aria-hidden
            className="lp-drift pointer-events-none absolute -top-32 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-violet-500/40 blur-3xl"
          />
          <p className="text-4xl leading-[0.95] font-bold tracking-tighter sm:text-6xl">
            Your seniors are
            <span className="block opacity-70">one question away.</span>
          </p>
          <Link
            href="/sign-up"
            className={`${pill} mt-10 bg-white text-[color-mix(in_srgb,var(--primary)_70%,black)] hover:bg-white/90`}
          >
            <Icon name="arrow_forward" size={20} />
            Get started
          </Link>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-muted-foreground">
          <span>Built for every campus</span>
          <Link
            href="/register-university"
            className="hover:text-foreground hover:underline"
          >
            Register your university
          </Link>
          <span>© {2026} Alumni Connect</span>
        </footer>
      </div>
    </main>
  );
}
