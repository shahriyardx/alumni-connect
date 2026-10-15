import type { Metadata } from "next";
import { PendingNotice } from "./pending-notice";

export const metadata: Metadata = { title: "Awaiting approval" };

export default function PendingPage() {
  return <PendingNotice />;
}
