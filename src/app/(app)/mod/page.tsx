import type { Metadata } from "next";
import { ModView } from "./mod-view";

export const metadata: Metadata = { title: "Moderation" };

export default function ModPage() {
  return <ModView />;
}
