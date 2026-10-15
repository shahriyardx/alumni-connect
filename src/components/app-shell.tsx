"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Role } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Fab } from "./ui/fab";
import { Icon } from "./ui/icon";
import { Spinner } from "./ui/spinner";
import { stateLayer } from "./ui/styles";
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
      match: "/u/",
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

function NavItem({ d, active }: { d: Dest; active: boolean }) {
  return (
    <Link
      href={d.href}
      aria-current={active ? "page" : undefined}
      className="group flex min-w-0 flex-1 flex-col items-center gap-1 py-1.5 outline-none min-[840px]:flex-none min-[840px]:py-0"
    >
      <span
        className={cn(
          stateLayer,
          "relative grid h-8 w-14 place-items-center rounded-full",
          active ? "text-on-secondary-container" : "text-on-surface-variant",
        )}
      >
        {/* Active pill: stretches in from the centre with spring easing. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 rounded-full bg-secondary-container transition-[scale,opacity] duration-500 ease-[var(--ease-spring)]",
            active ? "scale-x-100 opacity-100" : "scale-x-25 opacity-0",
          )}
        />
        <Icon name={d.icon} filled={active} />
        {/* Unread badge slot (wired in Task 10). */}
        {!!d.badge && (
          <span className="absolute top-0.5 left-[30px] grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[11px] leading-none font-semibold text-on-error">
            {d.badge > 99 ? "99+" : d.badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-xs font-medium",
          active ? "text-on-surface" : "text-on-surface-variant",
        )}
      >
        {d.label}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const unread = 0; // ponytail: notifications count lands in Task 10
  const items = destinations(me?.id, unread).filter(
    (d) => !d.roles || (me && d.roles.includes(me.role)),
  );
  const isActive = (d: Dest) =>
    pathname === d.match || pathname.startsWith(d.match.replace(/\/?$/, "/"));

  return (
    <div className="min-h-dvh bg-surface">
      {/* Navigation rail (≥ 840px) */}
      <nav
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-3 bg-surface pt-6 min-[840px]:flex"
      >
        <Link
          href="/feed"
          aria-label="Alumni Connect home"
          className="mb-2 grid size-12 place-items-center rounded-[16px] bg-tertiary-container text-on-tertiary-container"
        >
          <Icon name="school" filled />
        </Link>
        <Fab href="/new" icon="edit" aria-label="Ask a question" />
        <span className="mb-4 -mt-1 text-xs font-semibold text-on-surface-variant">
          Ask
        </span>
        <div className="flex flex-col gap-3">
          {items.map((d) => (
            <NavItem key={d.label} d={d} active={isActive(d)} />
          ))}
        </div>
      </nav>

      <div className="min-[840px]:pl-24">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-surface/90 px-4 backdrop-blur min-[840px]:px-6">
          <Link
            href="/feed"
            className="flex items-center gap-2 text-[22px] font-[650] tracking-tight min-[840px]:hidden"
            style={{ fontVariationSettings: "'wdth' 115" }}
          >
            <Icon name="school" filled className="text-tertiary" />
            Alumni Connect
          </Link>
          <span className="hidden truncate text-sm font-medium text-on-surface-variant min-[840px]:block">
            {me?.universityName}
          </span>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 pb-32 min-[840px]:px-6 min-[840px]:pb-12">
          <StatusGate>{children}</StatusGate>
        </main>
      </div>

      {/* Phone: FAB + bottom navigation bar */}
      <div className="fixed right-4 bottom-24 z-30 min-[840px]:hidden">
        <Fab href="/new" icon="edit" aria-label="Ask a question" />
      </div>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex h-20 items-center bg-surface-container px-2 pb-[env(safe-area-inset-bottom)] min-[840px]:hidden"
      >
        {items
          .filter((d) => !d.roles)
          .map((d) => (
            <NavItem key={d.label} d={d} active={isActive(d)} />
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

  const suspended =
    me?.status === "SUSPENDED" &&
    (!me.suspendedUntil || new Date(me.suspendedUntil) > new Date());
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-surface p-6">
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
