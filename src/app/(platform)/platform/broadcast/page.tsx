import type { Metadata } from "next";
import { BroadcastView } from "./broadcast-view";

export const metadata: Metadata = { title: "Broadcast" };

export default function Page() {
  return <BroadcastView />;
}
