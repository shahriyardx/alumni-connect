import type { Metadata } from "next";
import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "Ask a question" };

export default function NewPostPage() {
  return <Composer />;
}
