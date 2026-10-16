import type { Metadata } from "next";
import { PlatformView } from "./platform-view";

export const metadata: Metadata = { title: "Platform" };

export default function PlatformPage() {
  return <PlatformView />;
}
