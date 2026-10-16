"use client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMe, useSignOut } from "@/components/user-menu";

export function PendingNotice() {
  const { me } = useMe();
  const signOut = useSignOut();
  return (
    <EmptyState
      className="py-20"
      icon="hourglass_top"
      title={
        me?.role === "OWNER"
          ? "Application under review"
          : "Waiting for admin approval"
      }
      body={
        me?.role === "OWNER"
          ? `We're reviewing ${me.universityName}. You'll get access as soon as it's approved — just come back and sign in.`
          : `A university admin will check your ID card. You'll get access to ${me?.universityName ?? "your university"} as soon as they approve it — just come back and sign in.`
      }
      action={
        <Button variant="tonal" icon="logout" onClick={signOut}>
          Sign out
        </Button>
      }
    />
  );
}
