import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PostView } from "./post-view";

export const metadata: Metadata = { title: "Post" };

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostView id={id} />;
}

export default function PostPage({ params }: PageProps<"/p/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-24">
          <Spinner />
        </div>
      }
    >
      <Inner params={params} />
    </Suspense>
  );
}
