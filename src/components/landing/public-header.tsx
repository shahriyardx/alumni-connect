"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/** Floating pill bar. Account actions only on the landing page. */
export function PublicHeader() {
  const landing = usePathname() === "/";
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center rounded-full bg-surface/80 pr-2 pl-2 shadow-sm dark:bg-surface-high/80 shadow-black/5 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full pr-3 text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <Icon name="school" filled size={20} />
          </span>
          Alumni Connect
        </Link>
        {landing && (
          <div className="ml-auto flex items-center gap-1.5">
            <ButtonLink
              href="/sign-in"
              variant="ghost"
              size="sm"
              className="max-sm:hidden"
            >
              Sign in
            </ButtonLink>
            <ButtonLink href="/sign-up" size="sm">
              Join
            </ButtonLink>
          </div>
        )}
      </div>
    </header>
  );
}
