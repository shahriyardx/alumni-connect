"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Role } from "@/db/schema";
import { isActiveNow, isSuspendedNow } from "@/lib/account-status";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useLiveEvents } from "@/lib/live";
import { useTRPC } from "@/lib/trpc";
import { Button, ButtonLink } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Fab } from "./ui/fab";
import { Icon } from "./ui/icon";
import { Spinner } from "./ui/spinner";
import { focusRing } from "./ui/styles";
import { UserMenu, useMe, useSignOut } from "./user-menu";

type Dest = {
  href: string;
  match: string;
  label: string;
  icon: string;
  roles?: Role[];
  badge?: number;
};

function destinations(meId: string | undefined, unread: number): Dest[] {
  return [
    { href: "/feed", match: "/feed", label: "Feed", icon: "home" },
    { href: "/search", match: "/search", label: "Search", icon: "search" },
    {
      href: "/notifications",
      match: "/notifications",
      label: "Alerts",
      icon: "notifications",
      badge: unread,
    },
    {
      href: "/bookmarks",
      match: "/bookmarks",
      label: "Saved",
      icon: "bookmark",
    },
    {
      href: meId ? `/u/${meId}` : "/settings",
      match: meId ? `/u/${meId}` : "/settings",
      label: "Profile",
      icon: "person",
    },
    {
      href: "/mod",
      match: "/mod",
      label: "Moderation",
      icon: "shield",
      roles: ["MODERATOR", "ADMIN"],
    },
    {
      href: "/admin",
      match: "/admin",
      label: "Admin",
      icon: "admin_panel_settings",
      roles: ["ADMIN"],
    },
  ];
}

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Desktop sidebar row: icon + label, active row is a tonal pill. */
function SideItem({ d, active }: { d: Dest; active: boolean }) {
  return (
    <Link
      href={d.href}
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
        name={d.icon}
        filled={active}
        size={20}
        className={active ? undefined : "text-muted-foreground"}
      />
      <span className="flex-1 truncate">{d.label}</span>
      <Badge n={d.badge} />
    </Link>
  );
}

/** Phone bottom-bar destination. */
function BarItem({ d, active }: { d: Dest; active: boolean }) {
  return (
    <Link
      href={d.href}
      aria-current={active ? "page" : undefined}
      className="group flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 outline-none"
    >
      <span
        className={cn(
          "relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-150 group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          active ? "bg-primary/12 text-primary" : "text-muted-foreground",
        )}
      >
        <Icon name={d.icon} filled={active} size={20} />
        <Badge n={d.badge} className="absolute -top-0.5 left-7" />
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[11px] font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {d.label}
      </span>
    </Link>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/feed"
      className={cn(
        focusRing,
        "flex items-center gap-2 rounded-full text-[15px] font-semibold tracking-tight",
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Icon name="school" filled size={18} />
      </span>
      Alumni Connect
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const trpc = useTRPC();
  const active = !!me && isActiveNow(me);
  useLiveEvents(active ? me.id : undefined);
  // Live "notification" events invalidate this; no polling.
  const { data: unread = 0 } = useQuery(
    trpc.notification.unreadCount.queryOptions(undefined, { enabled: active }),
  );
  const items = destinations(me?.id, unread).filter(
    (d) => !d.roles || (me && d.roles.includes(me.role)),
  );
  const isActive = (d: Dest) =>
    pathname === d.match || pathname.startsWith(d.match.replace(/\/?$/, "/"));

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar (≥ 840px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 px-3 py-4 min-[840px]:flex">
        <Logo className="px-2 py-1" />
        <ButtonLink href="/new" icon="edit" className="mx-1">
          Ask
        </ButtonLink>
        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {items.map((d) => (
            <SideItem key={d.label} d={d} active={isActive(d)} />
          ))}
        </nav>
        {me?.universityName && (
          <p className="mt-auto truncate px-3.5 text-xs text-muted-foreground">
            {me.universityName}
          </p>
        )}
      </aside>

      <div className="min-[840px]:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-background/85 px-4 backdrop-blur-xl min-[840px]:px-8">
          <Logo className="min-[840px]:hidden" />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 pb-32 min-[840px]:px-8 min-[840px]:pb-16">
          <StatusGate>{children}</StatusGate>
        </main>
      </div>

      {/* Phone: small FAB + bottom bar. No FAB in the composer: it would cover the submit button. */}
      {pathname !== "/new" && !pathname.endsWith("/edit") && (
        <div className="fixed right-4 bottom-20 z-30 min-[840px]:hidden">
          <Fab href="/new" icon="edit" aria-label="Ask a question" />
        </div>
      )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center bg-surface/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl min-[840px]:hidden"
      >
        {items
          .filter((d) => !d.roles)
          .map((d) => (
            <BarItem key={d.label} d={d} active={isActive(d)} />
          ))}
      </nav>
    </div>
  );
}

/** Routes the user by account status. Real enforcement lives in tRPC guards. */
function StatusGate({ children }: { children: React.ReactNode }) {
  const { me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useSignOut();
  const pending = me?.status === "PENDING";

  useEffect(() => {
    if (isLoading) return;
    // Stale cookie with no session: clear it, or proxy bounces /sign-in → /feed.
    if (me === null)
      void authClient.signOut().then(() => router.replace("/sign-in"));
    else if (pending && pathname !== "/pending") router.replace("/pending");
    else if (me && !pending && pathname === "/pending") router.replace("/feed");
  }, [me, isLoading, pending, pathname, router]);

  const suspended = !!me && isSuspendedNow(me);
  const blocked = me?.status === "BANNED" || suspended;
  const waiting = isLoading || !me || (pending && pathname !== "/pending");

  // Children always render (hidden while gated) so Next can validate the
  // page segment for instant navigation instead of dropping it.
  return (
    <>
      <div hidden={waiting || blocked}>{children}</div>
      {waiting && (
        <div className="grid place-items-center py-24">
          <Spinner />
        </div>
      )}
      {me && blocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background p-6">
          <EmptyState
            icon={me.status === "BANNED" ? "block" : "pause_circle"}
            title={
              me.status === "BANNED"
                ? "This account has been banned"
                : "Your account is suspended"
            }
            body={
              me.status === "BANNED"
                ? "A moderator removed your access to Alumni Connect. Contact your university administrator if you think this is a mistake."
                : `You can come back ${me.suspendedUntil ? `on ${new Date(me.suspendedUntil).toLocaleString()}` : "once an admin lifts the suspension"}.`
            }
            action={
              <Button variant="tonal" icon="logout" onClick={signOut}>
                Sign out
              </Button>
            }
          />
        </div>
      )}
    </>
  );
}
