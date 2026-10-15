import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
