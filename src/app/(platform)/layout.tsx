import { Logo } from "@/components/app-shell";
import { UserMenu } from "@/components/user-menu";

// A super admin has no university, so no student navigation or StatusGate.
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-background/85 px-4 backdrop-blur-xl sm:px-8">
        <Logo href="/platform" />
        <span className="text-sm text-muted-foreground">Platform</span>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-8">
        {children}
      </main>
    </div>
  );
}
