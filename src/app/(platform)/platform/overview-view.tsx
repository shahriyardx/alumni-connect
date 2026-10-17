"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  LoadError,
  Loading,
  UNI_STATUS_LABEL,
} from "@/components/platform/platform-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { focusRing } from "@/components/ui/styles";
import { PageHeader } from "@/components/workspace/workspace-shell";
import { ROLES, UNIVERSITY_STATUSES } from "@/db/schema";
import { cn } from "@/lib/cn";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type Day = RouterOutputs["platform"]["overview"]["signupsPerDay"][number];

const ROLE_LABEL = {
  OWNER: "Owners",
  ADMIN: "Admins",
  MODERATOR: "Moderators",
  STAFF: "Faculty",
  STUDENT: "Students",
  ALUMNUS: "Alumni",
} as const;

export function OverviewView() {
  const trpc = useTRPC();
  const q = useQuery(trpc.platform.overview.queryOptions());
  const header = (
    <PageHeader title="Overview" sub="Every university at a glance." />
  );
  if (q.isError)
    return (
      <>
        {header}
        <LoadError message={q.error.message} />
      </>
    );
  if (!q.data)
    return (
      <>
        {header}
        <Loading />
      </>
    );
  const s = q.data;
  const unis = UNIVERSITY_STATUSES.reduce((n, k) => n + s.universities[k], 0);
  const users = ROLES.reduce((n, r) => n + s.users[r], 0);

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Breakdown
          label="Universities"
          total={unis}
          parts={UNIVERSITY_STATUSES.map((k) => [
            UNI_STATUS_LABEL[k],
            s.universities[k],
          ])}
        />
        <Link
          href="/platform/universities?status=PENDING"
          className={cn(
            focusRing,
            "group flex flex-col justify-between gap-4 rounded-3xl p-5 transition-colors duration-150",
            s.pendingApplications
              ? "bg-tonal text-tonal-fg hover:bg-tonal-hover"
              : "bg-surface hover:shadow-sm hover:shadow-black/5",
          )}
        >
          <span
            className={cn(
              "text-sm",
              s.pendingApplications ? "opacity-80" : "text-muted-foreground",
            )}
          >
            Pending applications
          </span>
          <span className="text-5xl font-semibold tracking-tighter tabular-nums">
            {s.pendingApplications}
          </span>
          <span className="flex items-center gap-1 text-sm font-medium">
            Review
            <Icon
              name="arrow_forward"
              size={16}
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </span>
        </Link>
        <Stat label="Sign-ups, 7 days" value={s.signups7} />
        <Breakdown
          label="Users"
          total={users}
          parts={ROLES.map((r) => [ROLE_LABEL[r], s.users[r]])}
        />
        <Stat label="Posts" value={s.posts} />
        <Stat label="Comments" value={s.comments} />

        <Card className="col-span-2 flex flex-col gap-4 p-5 lg:col-span-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold tracking-tight">
              Sign-ups, last 30 days
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {s.signups30} total
            </span>
          </div>
          <DailyBars days={s.signupsPerDay} />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Show as table
            </summary>
            <table className="mt-2 w-full max-w-xs text-left tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 font-medium">Sign-ups</th>
                </tr>
              </thead>
              <tbody>
                {s.signupsPerDay.map((d) => (
                  <tr key={d.day}>
                    <td className="py-1">{d.day}</td>
                    <td className="py-1">{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col justify-between gap-4 p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-5xl font-semibold tracking-tighter tabular-nums">
        {value}
      </span>
    </Card>
  );
}

function Breakdown({
  label,
  total,
  parts,
}: {
  label: string;
  total: number;
  parts: [string, number][];
}) {
  return (
    <Card className="col-span-2 flex flex-col justify-between gap-4 p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-5xl font-semibold tracking-tighter tabular-nums">
        {total}
      </span>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts
          .filter(([, n]) => n > 0)
          .map(([k, n]) => (
            <span key={k}>
              <span className="font-semibold tabular-nums">{n}</span>{" "}
              <span className="text-muted-foreground">{k}</span>
            </span>
          ))}
      </div>
    </Card>
  );
}

const short = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayLabel = (d: string) => short.format(new Date(`${d}T00:00:00Z`));

/** 30 CSS bars; values in each bar's title and the table view. */
function DailyBars({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-40 items-end gap-[3px] border-b border-border">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${dayLabel(d.day)}: ${d.n} sign-up${d.n === 1 ? "" : "s"}`}
            className="group flex h-full flex-1 items-end"
          >
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-opacity duration-150 group-hover:opacity-70",
                d.n ? "bg-primary" : "bg-transparent",
              )}
              style={{ height: `${(d.n / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{dayLabel(days[0].day)}</span>
        <span>Peak {Math.max(...days.map((d) => d.n))}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}
