"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { isMod, type Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { Avatar } from "./ui/avatar";
import { Icon } from "./ui/icon";
import { focusRing } from "./ui/styles";
import { useMe } from "./user-menu";

type Tile = {
  key: string;
  href: string;
  icon: string;
  label: string;
  primary?: boolean;
  count?: number;
};

function tilesFor(
  role: Role | undefined,
  counts: { approvals: number; reports: number } | undefined,
): Tile[] {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return [
        {
          key: "announce",
          href: "/new",
          icon: "campaign",
          label: "Announce",
          primary: true,
        },
        {
          key: "approvals",
          href: "/workspace/approvals",
          icon: "how_to_reg",
          label: "Pending approvals",
          count: counts?.approvals ?? 0,
        },
        {
          key: "reports",
          href: "/workspace/moderation",
          icon: "flag",
          label: "Open reports",
          count: counts?.reports ?? 0,
        },
      ];
    case "MODERATOR":
      return [
        {
          key: "announce",
          href: "/new",
          icon: "campaign",
          label: "Announce",
          primary: true,
        },
        {
          key: "reports",
          href: "/workspace/moderation",
          icon: "flag",
          label: "Open reports",
          count: counts?.reports ?? 0,
        },
      ];
    case "STAFF":
      return [
        {
          key: "announce",
          href: "/new",
          icon: "campaign",
          label: "Announce",
          primary: true,
        },
      ];
    case "STUDENT":
      return [
        {
          key: "ask",
          href: "/new",
          icon: "school",
          label: "Ask an alumnus",
          primary: true,
        },
      ];
    default:
      return [];
  }
}

/** STUDENT-only side-rail tile: a stacked avatar row linking to /people/alumni. */
function AlumniRailTile({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.people.alumniInMyDepartment.queryOptions({ cursor: 0 }, { enabled }),
  );
  if (!enabled || !data || data.items.length === 0) return null;
  return (
    <Link
      href="/people/alumni"
      className={cn(
        focusRing,
        "flex items-center gap-3 rounded-3xl bg-surface p-4 outline-none transition-colors hover:bg-surface-high",
      )}
    >
      <div className="flex -space-x-2">
        {data.items.slice(0, 4).map((u) => (
          <Avatar
            key={u.id}
            name={u.name}
            src={u.avatarKey ? `/api/files/${u.avatarKey}` : null}
            size={28}
            className="ring-2 ring-surface"
          />
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        Your department's alumni
      </span>
      <Icon name="arrow_forward" size={18} className="text-muted-foreground" />
    </Link>
  );
}

function PrimaryTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className="group relative isolate overflow-hidden rounded-[2rem] bg-primary p-6 text-white outline-none transition-[border-radius] duration-300 hover:rounded-[2.75rem] focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-[color-mix(in_srgb,var(--primary)_55%,#020617)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-violet-500/50 blur-3xl"
      />
      <Icon name={tile.icon} filled size={28} />
      <p className="mt-8 text-2xl leading-none font-bold tracking-tighter">
        {tile.label}
      </p>
      <Icon
        name="arrow_forward"
        size={22}
        className="absolute right-6 bottom-6 transition-transform group-hover:translate-x-1"
      />
    </Link>
  );
}

function CountTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className={cn(
        focusRing,
        "flex items-center gap-3 rounded-3xl bg-surface p-4 outline-none transition-colors hover:bg-surface-high",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tonal text-tonal-fg">
        <Icon name={tile.icon} size={20} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {tile.label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{tile.count}</span>
    </Link>
  );
}

/** Role-specific feed controls: a primary CTA tile plus count tiles (approvals, reports). */
export function FeedRail({ variant }: { variant: "aside" | "row" }) {
  const { me } = useMe();
  const trpc = useTRPC();
  const mod = !!me && isMod(me.role);
  const { data: counts } = useQuery(
    trpc.workspace.counts.queryOptions(undefined, { enabled: mod }),
  );
  const tiles = tilesFor(me?.role, counts);
  if (tiles.length === 0) return null;

  if (variant === "row") {
    return (
      <div className="relative -mx-4 px-4 min-[840px]:mx-0 min-[840px]:px-0 xl:hidden">
        <nav
          aria-label="Feed controls"
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
        >
          {tiles.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                focusRing,
                "flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap",
                t.primary
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-high text-foreground",
              )}
            >
              <Icon name={t.icon} size={18} filled={t.primary} />
              {t.label}
              {t.count !== undefined && (
                <span className="tabular-nums opacity-80">{t.count}</span>
              )}
            </Link>
          ))}
        </nav>
        {/* Hints that the strip scrolls: a fade at the trailing edge. */}
        {tiles.length > 1 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tiles.map((t) =>
        t.primary ? (
          <PrimaryTile key={t.key} tile={t} />
        ) : (
          <CountTile key={t.key} tile={t} />
        ),
      )}
      <AlumniRailTile enabled={me?.role === "STUDENT"} />
    </div>
  );
}
