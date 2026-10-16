"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ROLES } from "@/db/schema";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { Card } from "../ui/card";
import { Icon } from "../ui/icon";
import { Spinner } from "../ui/spinner";
import { focusRing } from "../ui/styles";
import { PageHeader } from "./workspace-shell";

type Week = RouterOutputs["admin"]["stats"]["postsPerWeek"][number];

const ROLE_LABEL = {
  OWNER: "Owners",
  STAFF: "Faculty",
  STUDENT: "Students",
  ALUMNUS: "Alumni",
  MODERATOR: "Moderators",
  ADMIN: "Admins",
} as const;

// Series colors: posts = brand primary; comments = validated orange
// (dataviz validator: CVD ΔE 26 light / 28 dark vs primary, ≥3:1 on surface).
const SERIES = [
  { key: "posts", label: "Posts", fill: "fill-primary", swatch: "bg-primary" },
  {
    key: "comments",
    label: "Comments",
    fill: "fill-[#eb6834] dark:fill-[#d95926]",
    swatch: "bg-[#eb6834] dark:bg-[#d95926]",
  },
] as const;

export function StatsPanel() {
  const trpc = useTRPC();
  const stats = useQuery(trpc.admin.stats.queryOptions());
  const batches = useQuery(trpc.workspace.batches.queryOptions());
  const header = (
    <PageHeader title="Overview" sub="Your university at a glance." />
  );
  if (stats.isError)
    return (
      <>
        {header}
        <p className="py-16 text-center text-sm text-destructive">
          {stats.error.message}
        </p>
      </>
    );
  if (!stats.data)
    return (
      <>
        {header}
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </>
    );
  const s = stats.data;
  const members = ROLES.reduce((n, r) => n + s.members[r], 0);
  const b = batches.data ?? [];
  const roster = b.reduce((n, x) => n + x.rosterCount, 0);

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 flex flex-col justify-between gap-4 p-5">
          <span className="text-sm text-muted-foreground">Members</span>
          <span className="text-5xl font-semibold tracking-tighter tabular-nums">
            {members}
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {ROLES.filter((r) => s.members[r] > 0).map((r) => (
              <span key={r}>
                <span className="font-semibold tabular-nums">
                  {s.members[r]}
                </span>{" "}
                <span className="text-muted-foreground">{ROLE_LABEL[r]}</span>
              </span>
            ))}
          </div>
        </Card>
        <LinkTile
          href="/workspace/approvals"
          label="Waiting for approval"
          value={s.pending}
          cta="Review"
          hot={s.pending > 0}
        />
        <LinkTile
          href="/workspace/moderation"
          label="Open reports"
          value={s.openReports}
          cta="Open queue"
          hot={s.openReports > 0}
        />

        <Card className="col-span-2 flex flex-col gap-4 p-5 lg:col-span-3 lg:row-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold tracking-tight">
              Activity, last 8 weeks
            </h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {SERIES.map((x) => (
                <span key={x.key} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", x.swatch)} />
                  {x.label}
                </span>
              ))}
            </div>
          </div>
          <WeeklyBars weeks={s.postsPerWeek} />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Show as table
            </summary>
            <table className="mt-2 w-full text-left tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Week</th>
                  <th className="py-1 font-medium">Posts</th>
                  <th className="py-1 font-medium">Comments</th>
                </tr>
              </thead>
              <tbody>
                {s.postsPerWeek.map((w) => (
                  <tr key={w.week}>
                    <td className="py-1">{w.week}</td>
                    <td className="py-1">{w.posts}</td>
                    <td className="py-1">{w.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
        <Stat
          label="Answered by alumni"
          value={`${s.alumniAnsweredPct}%`}
          foot={`of ${s.totalPosts} posts`}
        />
        <Link
          href="/workspace/batches"
          className={cn(focusRing, "rounded-3xl")}
        >
          <Stat
            label="Batches"
            value={b.length}
            foot={`${roster} on rosters`}
            className="h-full transition-shadow duration-150 hover:shadow-sm hover:shadow-black/5"
          />
        </Link>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  foot,
  className,
}: {
  label: string;
  value: number | string;
  foot?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1 p-5", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tighter tabular-nums">
        {value}
      </span>
      {foot && <span className="text-xs text-muted-foreground">{foot}</span>}
    </Card>
  );
}

function LinkTile({
  href,
  label,
  value,
  cta,
  hot,
}: {
  href: string;
  label: string;
  value: number;
  cta: string;
  hot: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        focusRing,
        "group flex flex-col justify-between gap-4 rounded-3xl p-5 transition-colors duration-150",
        hot
          ? "bg-tonal text-tonal-fg hover:bg-tonal-hover"
          : "bg-surface hover:shadow-sm hover:shadow-black/5",
      )}
    >
      <span
        className={cn("text-sm", hot ? "opacity-80" : "text-muted-foreground")}
      >
        {label}
      </span>
      <span className="text-5xl font-semibold tracking-tighter tabular-nums">
        {value}
      </span>
      <span className="flex items-center gap-1 text-sm font-medium">
        {cta}
        <Icon
          name="arrow_forward"
          size={16}
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

/** "Nice" axis max: 1, 2 or 5 × 10^n at or above `v`. */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** Bar with a 4px rounded data-end, flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function WeeklyBars({ weeks }: { weeks: Week[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw in real pixels so axis text stays 11px at any width.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const pad = { top: 8, right: 4, bottom: 28, left: 32 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...weeks.flatMap((w) => [w.posts, w.comments])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const band = plotW / weeks.length;
  const barW = Math.max(3, Math.min(18, (band - 12) / 2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        role="img"
        aria-label="Posts and comments per week"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? "stroke-border" : "stroke-border/60"}
              strokeDasharray={t === 0 ? undefined : "2 4"}
            />
            <text
              x={pad.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {Number.isInteger(t) ? t : ""}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x0 = pad.left + i * band;
          const cx = x0 + band / 2;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover highlight only; values are in <title> and the table view
            <g
              key={w.week}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "transition-opacity duration-150",
                hover !== null && hover !== i && "opacity-40",
              )}
            >
              <title>{`${w.week}: ${w.posts} posts, ${w.comments} comments`}</title>
              <rect
                x={x0}
                y={pad.top}
                width={band}
                height={plotH}
                className="fill-transparent"
              />
              {SERIES.map((sr, j) => {
                const v = w[sr.key];
                return (
                  <path
                    key={sr.key}
                    d={barPath(
                      cx - barW - 1 + j * (barW + 2),
                      y(v),
                      barW,
                      y(0) - y(v),
                    )}
                    className={sr.fill}
                  />
                );
              })}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {w.week.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg bg-inverse px-2 py-1 text-xs font-medium whitespace-nowrap text-inverse-fg shadow-md"
          style={{
            left: `${((pad.left + (hover + 0.5) * band) / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          {weeks[hover].week} · {weeks[hover].posts} posts ·{" "}
          {weeks[hover].comments} comments
        </div>
      )}
    </div>
  );
}
