import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedList } from "@/components/feed-list";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Saved" };

export default function BookmarksPage() {
  return (
    <div className="flex flex-col gap-5 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
      <Suspense>
        <FeedList
          input={{ bookmarks: true }}
          empty={
            <EmptyState
              icon="bookmark"
              title="Nothing saved yet"
              body="Bookmark a question to find it here later."
            />
          }
        />
      </Suspense>
    </div>
  );
}
