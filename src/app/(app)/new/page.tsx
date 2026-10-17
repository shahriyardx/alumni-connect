import type { Metadata } from "next";
import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return <Composer />;
}
