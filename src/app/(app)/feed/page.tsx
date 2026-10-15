import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedView } from "./feed-view";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
  return (
    <Suspense>
      <FeedView />
    </Suspense>
  );
}
