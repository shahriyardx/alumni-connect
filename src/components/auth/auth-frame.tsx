import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Bento split matching the landing page: the title on a brand tile, the form
 * on its own surface tile. Stacks on phones with a compact brand tile.
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
      <div className="mx-auto grid max-w-6xl gap-3 lg:min-h-[min(640px,calc(100dvh-7rem))] lg:grid-cols-[5fr_6fr]">
        <aside className="lp-rise relative isolate flex flex-col justify-end overflow-hidden rounded-[2.5rem] bg-primary p-7 text-white sm:p-10 lg:p-12 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]">
          <div
            aria-hidden
            className="lp-drift pointer-events-none absolute -top-32 -right-24 -z-10 size-[26rem] rounded-full bg-violet-500/50 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -left-20 -z-10 h-72 w-[28rem] rounded-full bg-cyan-400/30 blur-3xl"
          />
          <span
            aria-hidden
            className="lp-bob pointer-events-none absolute top-8 right-8 text-white/15 max-lg:hidden"
          >
            <Icon name={icon} filled size={150} />
          </span>
          <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-white/15 max-lg:hidden">
            <Icon name={icon} filled size={24} />
          </span>
          <h1 className="text-3xl leading-[0.95] font-bold tracking-tighter sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-sm text-sm opacity-80 sm:text-base">
              {subtitle}
            </p>
          )}
        </aside>

        <section
          className={cn(
            "lp-rise flex rounded-[2.5rem] bg-surface p-6 [animation-delay:80ms] sm:p-10",
            // Multi-step forms start at the top so steps don't jump around.
            wide ? "items-start" : "items-center",
          )}
        >
          <div className={cn("mx-auto w-full", wide ? "max-w-lg" : "max-w-sm")}>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
