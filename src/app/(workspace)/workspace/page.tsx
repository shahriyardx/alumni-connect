import type { Metadata } from "next";
import { StatsPanel } from "@/components/workspace/stats-panel";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <StatsPanel />;
}
