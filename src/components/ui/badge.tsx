"use client";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Tip } from "./icon-button";

const roles: Record<Role, { label: string; icon?: string; tone: string }> = {
  ALUMNUS: {
    label: "Alumnus",
    icon: "school",
    tone: "bg-tertiary-container text-on-tertiary-container",
  },
  STUDENT: {
    label: "Student",
    tone: "bg-secondary-container text-on-secondary-container",
  },
  MODERATOR: {
    label: "Mod",
    icon: "shield",
    tone: "bg-surface-container-highest text-on-surface",
  },
  ADMIN: { label: "Admin", tone: "bg-primary text-on-primary" },
};

export function RoleBadge({
  role,
  className,
}: {
  role: Role;
  className?: string;
}) {
  const r = roles[role];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tracking-wide",
        r.icon && "pl-1.5",
        r.tone,
        className,
      )}
    >
      {r.icon && <Icon name={r.icon} filled size={16} />}
      {r.label}
    </span>
  );
}

export function VerifiedMark({ className }: { className?: string }) {
  return (
    <Tip label="Verified by university roster">
      <span
        role="img"
        aria-label="Verified by university roster"
        className={cn("inline-flex cursor-help text-primary", className)}
      >
        <Icon name="verified" filled size={18} />
      </span>
    </Tip>
  );
}
