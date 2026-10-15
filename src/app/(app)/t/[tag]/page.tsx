import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedList } from "@/components/feed-list";
import { EmptyState } from "@/components/ui/empty-state";
import { normalizeTag } from "@/lib/tags";

export const metadata: Metadata = { title: "Tag" };

async function Inner({ params }: { params: Promise<{ tag: string }> }) {
  const tag = normalizeTag(decodeURIComponent((await params).tag));
  return (
    <div className="flex flex-col gap-5 pt-4">
      <header className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">
          #{tag}
        </h1>
        {/* Follow button lands in Task 10. */}
        <div data-slot="tag-follow" />
      </header>
      <FeedList
        input={{ tag }}
        empty={<EmptyState icon="tag" title={`No posts tagged #${tag} yet`} />}
      />
    </div>
  );
}

export default function TagPage({ params }: PageProps<"/t/[tag]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
