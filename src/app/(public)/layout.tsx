import { Suspense } from "react";
import { PublicHeader } from "@/components/landing/public-header";

// PublicHeader reads the URL (usePathname) to decide whether it's on the
// landing page, so it needs a Suspense boundary wherever a route under this
// layout is a dynamic segment (e.g. /invite/[token]) — this shell has the
// same height, so there's no layout shift once it resolves.
function HeaderFallback() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="mx-auto h-14 w-full max-w-6xl rounded-full bg-surface/80 shadow-sm shadow-black/5 dark:bg-surface-high/80" />
    </header>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Suspense fallback={<HeaderFallback />}>
        <PublicHeader />
      </Suspense>
      {children}
    </div>
  );
}
