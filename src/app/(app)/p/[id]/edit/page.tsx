import type { Metadata } from "next";
import { Suspense } from "react";
import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "Edit post" };

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Composer postId={id} />;
}

export default function EditPostPage({ params }: PageProps<"/p/[id]/edit">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
