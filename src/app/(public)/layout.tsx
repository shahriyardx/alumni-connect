import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="school" filled size={18} />
          </span>
          Alumni Connect
        </Link>
      </header>
      {children}
    </div>
  );
}
