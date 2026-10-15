"use client";
import Link from "next/link";
import type { AuthorInfo } from "@/server/queries/posts";
import { Avatar } from "./ui/avatar";
import { RoleBadge, VerifiedMark } from "./ui/badge";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

export function timeAgo(at: Date) {
  let v = (new Date(at).getTime() - Date.now()) / 1000;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

export function AuthorLine({
  author,
  at,
  size = 40,
}: {
  author: AuthorInfo;
  at: Date;
  size?: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar
        name={author.name}
        src={author.avatarKey ? `/api/files/${author.avatarKey}` : null}
        size={size}
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <Link
            href={`/u/${author.id}`}
            className="relative z-10 truncate text-sm font-semibold hover:underline"
          >
            {author.name}
          </Link>
          <VerifiedMark />
          <RoleBadge role={author.role} />
        </div>
        <span className="truncate text-xs text-muted-foreground">
          Batch {author.batchYear} · {author.department} ·{" "}
          <time dateTime={new Date(at).toISOString()}>{timeAgo(at)}</time>
        </span>
      </div>
    </div>
  );
}
