import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Profile" };

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfileView id={decodeURIComponent(id)} />;
}

export default function ProfilePage({ params }: PageProps<"/u/[id]">) {
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
