import type { Metadata } from "next";
import { BatchesPanel } from "@/components/workspace/batches-panel";

export const metadata: Metadata = { title: "Batches & rosters" };

export default function Page() {
  return <BatchesPanel />;
}
