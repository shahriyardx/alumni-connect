import { PublicHeader } from "@/components/landing/public-header";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader />
      {children}
    </div>
  );
}
