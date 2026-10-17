"use client";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { Logo } from "../app-shell";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Spinner } from "../ui/spinner";
import { focusRing } from "../ui/styles";
import { UserMenu, useMe } from "../user-menu";

// Same look as the workspace shell (workspace-shell.tsx), platform sections.
const SECTIONS = [
  { href: "/platform", label: "Overview", icon: "space_dashboard" },
  { href: "/platform/universities", label: "Universities", icon: "domain" },
  { href: "/platform/users", label: "Users", icon: "group" },
  { href: "/platform/audit", label: "Audit log", icon: "history" },
  { href: "/platform/admins", label: "Admins", icon: "admin_panel_settings" },
  { href: "/platform/broadcast", label: "Broadcast", icon: "campaign" },
] as const;

export const UNI_STATUS_LABEL = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
} as const;

const PILL = {
  PENDING: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  ACTIVE: "bg-primary/12 text-primary",
  SUSPENDED: "bg-destructive/10 text-destructive",
  REJECTED: "bg-muted text-muted-foreground",
  BANNED: "bg-destructive/10 text-destructive",
} as const;

/** Small status chip; unknown statuses render neutral. */
export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        PILL[status as keyof typeof PILL] ?? "bg-muted text-foreground",
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <Spinner />
    </div>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <p className="py-16 text-center text-sm text-destructive">{message}</p>
  );
}

export const fmtDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
export const fmtDateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const isActive = (href: string, pathname: string) =>
  href === "/platform"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

function PendingCount({ active }: { active: boolean }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.platform.overview.queryOptions());
  const n = data?.pendingApplications ?? 0;
  if (!n) return null;
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function SidebarBody() {
  const pathname = usePathname();
  return (
    <>
      <div className="flex flex-col gap-0.5 px-2 py-1">
        <Logo href="/platform" />
        <span className="pl-10 text-xs text-muted-foreground">Platform</span>
      </div>
      <nav aria-label="Platform" className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => {
          const active = isActive(s.href, pathname);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                focusRing,
                "flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-primary/12 font-semibold text-primary"
                  : "text-foreground/80 hover:bg-primary/6 hover:text-foreground",
              )}
            >
              <Icon
                name={s.icon}
                filled={active}
                size={20}
                className={active ? undefined : "text-muted-foreground"}
              />
              <span className="flex-1 truncate">{s.label}</span>
              {s.href === "/platform/universities" && (
                <PendingCount active={active} />
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Open menu"
        className={cn(
          focusRing,
          "-ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted lg:hidden",
        )}
      >
        <Icon name="menu" size={22} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
        <Dialog.Popup className="fixed inset-y-3 left-3 z-50 flex w-[min(18rem,calc(100vw-4rem))] flex-col gap-5 overflow-y-auto rounded-[2rem] bg-surface px-3 py-4 shadow-xl shadow-black/20 outline-none transition-[translate,opacity] duration-200 ease-out data-[ending-style]:-translate-x-[110%] data-[starting-style]:-translate-x-[110%] lg:hidden">
          <Dialog.Title className="sr-only">Platform menu</Dialog.Title>
          <SidebarBody />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A super admin has no university: no StatusGate, just the admin check. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const { me, isLoading } = useMe();
  const admin = !!me?.isPlatformAdmin;
  return (
    <div className="min-h-dvh bg-background">
      {admin && (
        <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col gap-5 rounded-[2rem] bg-surface px-3 py-4 shadow-sm shadow-black/5 lg:flex">
          <SidebarBody />
        </aside>
      )}
      <div className={cn(admin && "lg:pl-[17.5rem]")}>
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            {admin && <MobileNav />}
            <Logo href="/platform" className={cn(admin && "lg:hidden")} />
            <div className="ml-auto">
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-2 pb-16 lg:px-8 lg:pt-4">
          {isLoading ? (
            <div className="grid place-items-center py-24">
              <Spinner />
            </div>
          ) : !admin ? (
            <EmptyState
              icon="block"
              title="Platform admins only"
              body="You don't have access to the platform console."
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
