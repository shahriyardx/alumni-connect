import type { Metadata } from "next";
import { ApprovalsPanel } from "@/components/workspace/approvals-panel";

export const metadata: Metadata = { title: "Approvals" };

export default function Page() {
  return <ApprovalsPanel />;
}
