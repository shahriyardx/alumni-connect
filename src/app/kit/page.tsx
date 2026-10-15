import type { Metadata } from "next";
import { Kit } from "./kit";

export const metadata: Metadata = { title: "UI kit" };

export default function KitPage() {
  return <Kit />;
}
