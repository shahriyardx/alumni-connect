"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdmin, isMod, type Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { StatusGate } from "../app-shell";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { focusRing } from "../ui/styles";
import { UserMenu, useMe } from "../user-menu";

type Need = "mod" | "admin" | "owner";
type Section = {
  href: string;
  label: string;
  icon: string;
  need: Need;
  badge?: "approvals" | "reports";
};

const SECTIONS: Section[] = [
  {
    href: "/workspace",
    label: "Overview",
    icon: "space_dashboard",
    need: "admin",
  },
  {
    href: "/workspace/approvals",
    label: "Approvals",
    icon: "how_to_reg",
    need: "admin",
    badge: "approvals",
  },
  {
    href: "/workspace/batches",
    label: "Batches & rosters",
    icon: "groups",
    need: "admin",
  },
  {
    href: "/workspace/members",
    label: "Members",
    icon: "badge",
    need: "admin",
  },
  {
    href: "/workspace/moderation",
    label: "Moderation",
    icon: "shield",
    need: "mod",
    badge: "reports",
  },
  {
    href: "/workspace/audit",
    label: "Audit log",
    icon: "history",
    need: "admin",
  },
  {
    href: "/workspace/settings",
    label: "Settings",
    icon: "settings",
    need: "owner",
  },
];

const allowed = (need: Need, role: Role) =>
  need === "mod"
    ? isMod(role)
    : need === "admin"
      ? isAdmin(role)
      : role === "OWNER";

/** One-line page title + muted subline, shared by every workspace page. */
export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function UniversityPendingBanner() {
  const { me } = useMe();
  if (me?.universityStatus !== "PENDING") return null;
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-tonal px-4 py-3 text-sm text-tonal-fg">
      <Icon name="hourglass_top" size={18} />
      Under review — students can't find your university yet.
    </div>
  );
}

export function UniversityMark({ size = 36 }: { size?: number }) {
  const { me } = useMe();
  const style = { width: size, height: size };
  if (me?.universityLogoKey)
    return (
      // biome-ignore lint/performance/noImgElement: private, presigned redirect — next/image can't optimize it
      <img
        src={`/api/files/${me.universityLogoKey}`}
        alt=""
        style={style}
        className="shrink-0 rounded-xl bg-white object-contain"
      />
    );
  return (
    <span
      style={style}
      className="grid shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
    >
      {(me?.universityName ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function useBadges(enabled: boolean) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.workspace.counts.queryOptions(undefined, { enabled }),
  );
  return data ?? { approvals: 0, reports: 0 };
}

function Count({ n, active }: { n: number; active?: boolean }) {
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

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();
  const staff = !!me && me.status === "ACTIVE" && isMod(me.role);
  const badges = useBadges(staff);
  const sections = me ? SECTIONS.filter((s) => allowed(s.need, me.role)) : [];
  const current = SECTIONS.find((s) => s.href === pathname);
  const ok = !!me && !!current && allowed(current.need, me.role);
  // Moderators only have the queue: send them straight there.
  const toQueue = me?.role === "MODERATOR" && pathname === "/workspace";
  useEffect(() => {
    if (toQueue) router.replace("/workspace/moderation");
  }, [toQueue, router]);

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar (≥ 1024px) */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col gap-5 rounded-[2rem] bg-surface px-3 py-4 shadow-sm shadow-black/5 lg:flex">
        <div className="flex items-center gap-3 px-2 py-1">
          <UniversityMark />
          <div className="flex min-w-0 flex-col">
            <span className="line-clamp-2 text-[15px] leading-tight font-semibold tracking-tight">
              {me?.universityName ?? " "}
            </span>
            <span className="text-xs text-muted-foreground">Workspace</span>
          </div>
        </div>
        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          {sections.map((s) => {
            const active = s.href === pathname;
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
                {s.badge && <Count n={badges[s.badge]} active={active} />}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3.5 text-xs text-muted-foreground">
          Alumni Connect
        </p>
      </aside>

      <div className="lg:pl-[17.5rem]">
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <UniversityMark size={30} />
              <span className="truncate text-sm font-semibold tracking-tight">
                {me?.universityName}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ButtonLink href="/feed" variant="tonal" size="sm" icon="forum">
                View feed
              </ButtonLink>
              <UserMenu />
            </div>
          </div>
          {/* Phone/tablet: sections as a scrollable pill row. */}
          {sections.length > 1 && (
            <nav
              aria-label="Workspace"
              className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] lg:hidden"
            >
              {sections.map((s) => {
                const active = s.href === pathname;
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      focusRing,
                      "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
                      active
                        ? "bg-primary/12 text-primary"
                        : "bg-surface text-foreground/80",
                    )}
                  >
                    {s.label}
                    {s.badge && <Count n={badges[s.badge]} active={active} />}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-2 pb-16 lg:px-8 lg:pt-4">
          <StatusGate>
            <UniversityPendingBanner />
            {/* Children mount only once the role is known and allowed, so no
                forbidden query fires (e.g. a moderator on the overview). */}
            {!me || toQueue ? null : !ok ? (
              <EmptyState
                icon="block"
                title="403 · Staff only"
                body={
                  isMod(me.role)
                    ? "This section needs a higher role."
                    : "The workspace is for your university's staff."
                }
                action={
                  <ButtonLink href="/feed" variant="tonal" icon="forum">
                    Go to the feed
                  </ButtonLink>
                }
              />
            ) : (
              <div className="flex flex-col gap-6">{children}</div>
            )}
          </StatusGate>
        </main>
      </div>
    </div>
  );
}
