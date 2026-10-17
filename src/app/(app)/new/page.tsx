import type { Metadata } from "next";
import { Suspense } from "react";
import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "New post" };

async function Inner({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const mention = typeof sp.mention === "string" ? sp.mention : undefined;
  return <Composer initialTag={tag} initialMention={mention} />;
}

export default function NewPostPage({ searchParams }: PageProps<"/new">) {
  return (
    <Suspense>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
