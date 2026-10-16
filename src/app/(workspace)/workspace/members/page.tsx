import type { Metadata } from "next";
import { MembersPanel } from "@/components/workspace/users-panel";

export const metadata: Metadata = { title: "Members & invites" };

export default function Page() {
  return <MembersPanel />;
}
