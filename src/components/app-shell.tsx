"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isStaff, type Role } from "@/db/schema";
import { isActiveNow, isSuspendedNow } from "@/lib/account-status";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useLiveEvents } from "@/lib/live";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Fab } from "./ui/fab";
import { Icon } from "./ui/icon";
import { Spinner } from "./ui/spinner";
import { focusRing } from "./ui/styles";
import { homeFor, UserMenu, useMe, useSignOut } from "./user-menu";

type Dest = {
  href: string;
  match: string;
  label: string;
  icon: string;
  roles?: Role[];
  platform?: boolean;
  badge?: number;
  /** Icon tile color: [solid when active, tint when idle]. */
  tone: [string, string];
};

// Same playful palette as the landing perk tiles.
const T = {
  blue: ["bg-primary text-white", "bg-primary/12 text-primary"],
  teal: [
    "bg-[#0f766e] text-white",
    "bg-[#0f766e]/15 text-[#0f766e] dark:text-[#2dd4bf]",
  ],
  orange: [
    "bg-[#c2410c] text-white",
    "bg-[#c2410c]/15 text-[#c2410c] dark:text-[#fb923c]",
  ],
  violet: [
    "bg-[#6d28d9] text-white",
    "bg-[#6d28d9]/15 text-[#6d28d9] dark:text-[#a78bfa]",
  ],
  pink: [
    "bg-[#be185d] text-white",
    "bg-[#be185d]/15 text-[#be185d] dark:text-[#f472b6]",
  ],
  cyan: [
    "bg-[#0e7490] text-white",
    "bg-[#0e7490]/15 text-[#0e7490] dark:text-[#22d3ee]",
  ],
  indigo: [
    "bg-[#4338ca] text-white",
    "bg-[#4338ca]/15 text-[#4338ca] dark:text-[#818cf8]",
  ],
  amber: [
    "bg-[#b45309] text-white",
    "bg-[#b45309]/15 text-[#b45309] dark:text-[#fbbf24]",
  ],
} satisfies Record<string, [string, string]>;

function destinations(meId: string | undefined, unread: number): Dest[] {
  return [
    {
      href: "/feed",
      match: "/feed",
      label: "Feed",
      icon: "home",
      tone: T.blue,
    },
    {
      href: "/search",
      match: "/search",
      label: "Search",
      icon: "search",
      tone: T.teal,
    },
    {
      href: "/notifications",
      match: "/notifications",
      label: "Alerts",
      icon: "notifications",
      badge: unread,
      tone: T.orange,
    },
    {
      href: "/bookmarks",
      match: "/bookmarks",
      label: "Saved",
      icon: "bookmark",
      tone: T.violet,
    },
    {
      href: "/people/alumni",
      match: "/people/alumni",
      label: "Alumni",
      icon: "groups",
      roles: ["STUDENT"],
      tone: T.pink,
    },
    {
      href: meId ? `/u/${meId}` : "/settings",
      match: meId ? `/u/${meId}` : "/settings",
      label: "Profile",
      icon: "person",
      tone: T.cyan,
    },
    {
      href: "/workspace",
      match: "/workspace",
      label: "Workspace",
      icon: "space_dashboard",
      roles: ["MODERATOR", "ADMIN", "OWNER"],
      tone: T.indigo,
    },
    {
      href: "/platform",
      match: "/platform",
      label: "Platform",
      icon: "domain",
      platform: true,
      tone: T.amber,
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

/** Desktop sidebar row: colored icon tile + label; active tile goes solid. */
function SideItem({ d, active }: { d: Dest; active: boolean }) {
  return (
    <Link
      href={d.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        focusRing,
        "group flex h-11 items-center gap-3 rounded-2xl px-2 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-muted font-semibold text-foreground"
          : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:-rotate-6",
          active ? d.tone[0] : d.tone[1],
        )}
      >
        <Icon name={d.icon} filled={active} size={18} />
      </span>
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

export function Logo({
  className,
  href = "/feed",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
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
  const staff = !!me && isStaff(me.role);
  const trpc = useTRPC();
  const active = !!me && isActiveNow(me);
  useLiveEvents(active ? me.id : undefined);
  // Live "notification" events invalidate this; no polling.
  const { data: unread = 0 } = useQuery(
    trpc.notification.unreadCount.queryOptions(undefined, { enabled: active }),
  );
  const items = destinations(me?.id, unread).filter(
    (d) =>
      (!d.roles || (me && d.roles.includes(me.role))) &&
      (!d.platform || me?.isPlatformAdmin),
  );
  const isActive = (d: Dest) =>
    pathname === d.match || pathname.startsWith(d.match.replace(/\/?$/, "/"));

  // Accounts waiting for approval get no app navigation, only the status page.
  if (me?.status === "PENDING")
    return (
      <div className="min-h-dvh bg-background">
        <header className="flex h-16 items-center px-4 sm:px-8">
          <Logo />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4">
          <StatusGate>{children}</StatusGate>
        </main>
      </div>
    );

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar (≥ 840px) */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-60 flex-col gap-6 rounded-[2rem] bg-surface px-3 py-4 shadow-sm shadow-black/5 min-[840px]:flex">
        <Logo className="px-2 py-1" />
        <Link
          href="/new"
          className={cn(
            focusRing,
            "group relative isolate mx-1 flex h-12 items-center gap-2.5 overflow-hidden rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-md shadow-primary/25 transition-transform duration-200 active:scale-[0.98] dark:bg-[color-mix(in_srgb,var(--primary)_70%,#020617)]",
          )}
        >
          <span
            aria-hidden
            className="lp-drift pointer-events-none absolute -top-8 -right-6 -z-10 size-24 rounded-full bg-violet-500/60 blur-2xl"
          />
          <Icon name={staff ? "campaign" : "edit"} size={20} />
          {staff ? "Announce" : "Ask a question"}
          <Icon
            name="arrow_forward"
            size={18}
            className="ml-auto transition-transform group-hover:translate-x-0.5"
          />
        </Link>
        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {items.map((d) => (
            <SideItem key={d.label} d={d} active={isActive(d)} />
          ))}
        </nav>
        <div className="mt-auto">
          <UserMenu variant="sidebar" />
        </div>
      </aside>

      <div className="min-[840px]:pl-[16.5rem]">
        {/* Phones only: the sidebar carries the account menu on wide screens. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-background/85 px-4 backdrop-blur-xl min-[840px]:hidden">
          <Logo />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main
          className={cn(
            "mx-auto w-full max-w-3xl px-4 pb-32 min-[840px]:px-8 min-[840px]:pt-6 min-[840px]:pb-16",
            // The feed carries a side rail on wide screens.
            pathname === "/feed" && "xl:max-w-6xl",
          )}
        >
          <StatusGate>{children}</StatusGate>
        </main>
      </div>

      {/* Phone: small FAB + bottom bar. No FAB in the composer (covers the submit
          button), on Settings or on your own profile (static pages where it only
          covers content, e.g. a Save button or your last post). */}
      {pathname !== "/new" &&
        !pathname.endsWith("/edit") &&
        pathname !== "/settings" &&
        pathname !== `/u/${me?.id}` && (
          <div className="fixed right-4 bottom-20 z-30 min-[840px]:hidden">
            <Fab
              href="/new"
              icon={staff ? "campaign" : "edit"}
              aria-label={staff ? "Post an announcement" : "Ask a question"}
            />
          </div>
        )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center bg-surface/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl min-[840px]:hidden"
      >
        {items
          .filter((d) => !d.roles && !d.platform)
          .map((d) => (
            <BarItem key={d.label} d={d} active={isActive(d)} />
          ))}
      </nav>
    </div>
  );
}

/** Routes the user by account status. Real enforcement lives in tRPC guards. */
export function StatusGate({ children }: { children: React.ReactNode }) {
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
    // A super admin has no university: their home is /platform.
    else if (me && !me.universityId) router.replace("/platform");
    else if (pending && pathname !== "/pending") router.replace("/pending");
    else if (me && !pending && pathname === "/pending")
      router.replace(homeFor(me));
  }, [me, isLoading, pending, pathname, router]);

  const suspended = !!me && isSuspendedNow(me);
  const rejected = me?.universityStatus === "REJECTED";
  const uniSuspended = me?.universityStatus === "SUSPENDED";
  const blocked =
    me?.status === "BANNED" || suspended || rejected || uniSuspended;
  const waiting =
    isLoading ||
    !me ||
    !me.universityId ||
    (pending && pathname !== "/pending");

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
            icon={
              me.status === "BANNED"
                ? "block"
                : suspended || uniSuspended
                  ? "pause_circle"
                  : "cancel"
            }
            title={
              me.status === "BANNED"
                ? "This account has been banned"
                : suspended
                  ? "Your account is suspended"
                  : uniSuspended
                    ? "University suspended"
                    : "Application rejected"
            }
            body={
              me.status === "BANNED"
                ? "A moderator removed your access to Alumni Connect. Contact your university administrator if you think this is a mistake."
                : suspended
                  ? `You can come back ${me.suspendedUntil ? `on ${new Date(me.suspendedUntil).toLocaleString()}` : "once an admin lifts the suspension"}.`
                  : uniSuspended
                    ? `The platform team suspended ${me.universityName}. Contact them if you think this is a mistake.`
                    : `${me.universityName}'s application was rejected. Contact the platform team if you think this is a mistake.`
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
