import type { Metadata } from "next";
import { AuditPanel } from "@/components/workspace/audit-panel";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditPanel />;
}
