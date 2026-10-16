import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Accept invite" };

async function Inner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAcceptForm token={decodeURIComponent(token)} />;
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
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
