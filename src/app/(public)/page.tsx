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
              Northern University
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

          {/* A question getting answered, on loop. */}
          <div
            aria-hidden
            className={`lp-rise [animation-delay:160ms] hidden flex-col gap-3 ${tile} bg-[#1e1b4b] p-6 text-white lg:flex`}
          >
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
                <Icon name="forum" filled size={22} />
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                Live
              </span>
            </div>
            <p className="lp-bubble mt-3 self-start rounded-3xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm">
              Best ML supervisor?
            </p>
            <div className="lp-bubble [animation-delay:1.2s] flex items-center gap-2 self-end rounded-3xl rounded-br-md bg-[#a78bfa] px-3 py-2 text-sm text-[#1e1b4b]">
              <Icon name="school" filled size={16} />
              <span className="lp-dots flex gap-1" aria-hidden>
                <i />
                <i />
                <i />
              </span>
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

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-muted-foreground">
          <span>CSE · Northern University Bangladesh</span>
          <span>© {2026} Alumni Connect</span>
        </footer>
      </div>
    </main>
  );
}
