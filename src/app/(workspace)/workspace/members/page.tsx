import type { Metadata } from "next";
import { MembersPanel } from "@/components/workspace/users-panel";

export const metadata: Metadata = { title: "Members" };

export default function Page() {
  return <MembersPanel />;
}
