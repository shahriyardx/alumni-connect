import { cn } from "@/lib/cn";

/** Centered narrow auth column: one-line title, muted subline, then the card. */
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
    <main className="flex flex-1 justify-center px-4 pt-8 pb-16 sm:pt-16">
      <div className={cn("w-full", wide ? "max-w-md" : "max-w-sm")}>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
