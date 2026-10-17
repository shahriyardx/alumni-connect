// Every action code the server writes (grep `audit(` in src/server), mapped
// to a short human label + Material Symbols icon for the audit log. One
// place: the filter dropdown's options are derived from these same keys.
export const AUDIT_ACTIONS = {
  "report.dismiss": { label: "Dismissed report", icon: "close" },
  "report.remove": { label: "Removed content", icon: "delete" },
  "report.suspend": { label: "Suspended account", icon: "timer_pause" },
  "report.ban": { label: "Banned account", icon: "block" },
  "user.status": { label: "Changed account status", icon: "toggle_on" },
  "user.approve": { label: "Approved sign-up", icon: "check_circle" },
  "user.reject": { label: "Rejected sign-up", icon: "cancel" },
  "user.role": { label: "Changed role", icon: "admin_panel_settings" },
  "owner.transfer": { label: "Transferred ownership", icon: "swap_horiz" },
  "batch.save": { label: "Saved batch", icon: "groups" },
  "batch.delete": { label: "Deleted batch", icon: "delete" },
  "roster.import": { label: "Imported roster", icon: "upload_file" },
  "settings.update": { label: "Updated settings", icon: "settings" },
  "university.approve": { label: "Approved university", icon: "check_circle" },
  "university.reject": { label: "Rejected university", icon: "cancel" },
  "university.create": { label: "Created university", icon: "add_business" },
  "post.update": { label: "Edited post", icon: "edit" },
  "post.remove": { label: "Removed post", icon: "delete" },
  "comment.update": { label: "Edited comment", icon: "edit" },
  "comment.remove": { label: "Removed comment", icon: "delete" },
  "signup.attempt": { label: "Sign-up attempt", icon: "person_add" },
} as const satisfies Record<string, { label: string; icon: string }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Falls back to the raw code (with a generic icon) for anything unmapped. */
export function auditLabel(action: string): { label: string; icon: string } {
  return (
    AUDIT_ACTIONS[action as AuditAction] ?? { label: action, icon: "history" }
  );
}
