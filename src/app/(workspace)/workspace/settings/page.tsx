import type { Metadata } from "next";
import { SettingsPanel } from "@/components/workspace/settings-panel";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsPanel />;
}
