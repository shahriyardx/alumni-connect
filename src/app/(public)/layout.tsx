import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-surface">
      <header className="relative z-10 mx-auto flex h-20 w-full max-w-6xl items-center px-4 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-xl font-[650] tracking-tight"
          style={{ fontVariationSettings: "'wdth' 115" }}
        >
          <span className="grid size-10 place-items-center rounded-[14px] bg-tertiary-container text-on-tertiary-container">
            <Icon name="school" filled size={22} />
          </span>
          Alumni Connect
        </Link>
      </header>
      {children}
    </div>
  );
}
