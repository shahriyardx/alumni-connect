import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformShell } from "@/components/platform/platform-shell";

export const metadata: Metadata = {
  title: { template: "%s · Platform", default: "Platform" },
};

// The shell reads usePathname(); keep it inside Suspense like the app shell.
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <PlatformShell>{children}</PlatformShell>
    </Suspense>
  );
}
