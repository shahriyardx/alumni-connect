"use client";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Tip } from "./icon-button";

const neutral = "bg-muted text-muted-foreground";
const roles: Record<Role, { label: string; icon?: string; tone: string }> = {
  ALUMNUS: { label: "Alumnus", icon: "school", tone: "bg-tonal text-tonal-fg" },
  STUDENT: { label: "Student", tone: neutral },
  MODERATOR: { label: "Mod", icon: "shield", tone: neutral },
  ADMIN: { label: "Admin", icon: "admin_panel_settings", tone: neutral },
  OWNER: { label: "Owner", icon: "admin_panel_settings", tone: neutral },
  STAFF: { label: "Faculty", icon: "badge", tone: neutral },
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
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        r.icon && "pl-1.5",
        r.tone,
        className,
      )}
    >
      {r.icon && <Icon name={r.icon} size={12} />}
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
        <Icon name="verified" filled size={16} />
      </span>
    </Tip>
  );
}
