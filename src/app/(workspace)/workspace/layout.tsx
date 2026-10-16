import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const metadata: Metadata = {
  title: { template: "%s · Workspace", default: "Workspace" },
};

// The shell reads usePathname(); keep it inside Suspense like the app shell.
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}
