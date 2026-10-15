import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const features = [
  {
    icon: "verified",
    title: "Verified alumni",
    body: "Every account is checked against your university's roster.",
  },
  {
    icon: "manage_search",
    title: "Searchable answers",
    body: "Questions don't vanish into a group chat; the next batch finds them.",
  },
  {
    icon: "lock",
    title: "Your campus only",
    body: "No strangers, no recruiters. Only people from your university.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 pt-12 pb-20 sm:px-8 sm:pt-24">
      <section className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-4xl leading-tight font-semibold tracking-tighter sm:text-5xl">
          Ask the people who walked the path before you.
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          A verified forum for students and alumni of your university.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ButtonLink href="/sign-up" size="lg">
            Get started
          </ButtonLink>
          <ButtonLink href="/sign-in" size="lg" variant="tonal">
            Sign in
          </ButtonLink>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {features.map((f) => (
          <article
            key={f.title}
            className="flex gap-3 rounded-3xl bg-surface p-5 sm:flex-col"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-tonal text-tonal-fg">
              <Icon name={f.icon} size={20} />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">{f.title}</h2>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
