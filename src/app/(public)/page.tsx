import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const features = [
  {
    icon: "verified",
    title: "Verified alumni",
    body: "Every account is checked against your university's roster. The graduate answering you really graduated.",
    tone: "bg-primary-container text-on-primary-container",
    shape: "rounded-[28px_28px_28px_8px]",
  },
  {
    icon: "manage_search",
    title: "Searchable archive",
    body: "Answers don't vanish into a group chat. Every question becomes something the next batch can find.",
    tone: "bg-secondary-container text-on-secondary-container",
    shape: "rounded-[48px]",
  },
  {
    icon: "lock",
    title: "Your university only",
    body: "No strangers, no recruiters. You only ever see people from your own campus.",
    tone: "bg-tertiary-container text-on-tertiary-container",
    shape: "rounded-[8px_28px_28px_28px]",
  },
];

export default function LandingPage() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 pt-8 pb-24 sm:px-8 sm:pt-16">
      <section className="relative grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="relative z-10 flex flex-col gap-8">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container-high px-4 py-1.5 text-sm font-medium text-on-surface-variant">
            <Icon name="school" filled size={18} className="text-tertiary" />
            The forum for your campus, past and present
          </p>
          <h1
            className="text-[clamp(44px,8vw,84px)] leading-[0.95] font-[750] tracking-[-0.03em]"
            style={{ fontVariationSettings: "'wdth' 130, 'opsz' 144" }}
          >
            Ask the people who{" "}
            <span className="text-primary">walked the path</span> before you
          </h1>
          <p className="max-w-xl text-lg text-on-surface-variant sm:text-xl">
            Course choices, internships, first jobs, that one professor — get
            answers from verified alumni of your own university.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/sign-up" size="lg" icon="arrow_forward">
              Sign up
            </ButtonLink>
            <ButtonLink href="/sign-in" size="lg" variant="tonal">
              Sign in
            </ButtonLink>
          </div>
        </div>

        {/* Shape-morphing decorative composition */}
        <div
          aria-hidden
          className="relative mx-auto aspect-square w-full max-w-[460px] lg:max-w-none"
        >
          <div className="absolute inset-[4%] animate-blob bg-primary-container" />
          <div className="absolute inset-[22%] animate-blob bg-tertiary-container [animation-delay:-5s] [animation-direction:alternate-reverse]" />
          <div className="absolute inset-[38%] grid animate-blob place-items-center bg-primary text-on-primary [animation-delay:-10s]">
            <Icon name="forum" filled size={56} />
          </div>
          <span className="absolute top-[12%] left-[2%] flex items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 text-sm font-semibold shadow-elevation-2">
            <Icon name="school" filled size={18} className="text-tertiary" />
            Class of 2019
          </span>
          <span className="absolute right-[0%] bottom-[16%] flex items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 text-sm font-semibold shadow-elevation-2">
            <Icon name="verified" filled size={18} className="text-primary" />
            Roster verified
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <article
            key={f.title}
            className={cn("flex flex-col gap-4 p-7", f.tone, f.shape)}
          >
            <span className="grid size-14 place-items-center rounded-[18px] bg-surface/60">
              <Icon name={f.icon} filled size={30} />
            </span>
            <h2
              className="text-2xl font-[700] tracking-tight"
              style={{ fontVariationSettings: "'wdth' 115" }}
            >
              {f.title}
            </h2>
            <p className="opacity-85">{f.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
