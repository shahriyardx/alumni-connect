import type { Metadata } from "next";
import { ModerationPanel } from "@/components/workspace/moderation-panel";

export const metadata: Metadata = { title: "Moderation" };

export default function Page() {
  return <ModerationPanel />;
}
