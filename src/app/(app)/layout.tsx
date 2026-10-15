import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

// AppShell reads usePathname(), which suspends on dynamic routes (/p/[id], /t/[tag]).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
