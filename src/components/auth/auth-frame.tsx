import { cn } from "@/lib/cn";

/** Centered auth column with a morphing tonal blob behind the card. */
export function AuthFrame({
  title,
  subtitle,
  children,
  wide,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="relative flex flex-1 justify-center px-4 pt-6 pb-16 sm:pt-12">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 size-[min(560px,120vw)] -translate-x-1/3 animate-blob bg-primary-container opacity-50 blur-[2px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-48 left-1/2 size-[min(320px,70vw)] -translate-x-[110%] animate-blob bg-tertiary-container opacity-60 [animation-delay:-6s]"
      />
      <div className={cn("relative w-full", wide ? "max-w-lg" : "max-w-md")}>
        <h1
          className="mb-2 text-[clamp(32px,6vw,44px)] leading-[1.05] font-[650] tracking-tight"
          style={{ fontVariationSettings: "'wdth' 120" }}
        >
          {title}
        </h1>
        {subtitle && <p className="mb-6 text-on-surface-variant">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
