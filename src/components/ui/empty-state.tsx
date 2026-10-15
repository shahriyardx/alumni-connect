import { cn } from "@/lib/cn";
import { Icon } from "./icon";

// M3 Expressive "cookie" shape: circle with 8 soft scallops.
const cookie = `M${Array.from({ length: 97 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2;
  const r = 46 + 4 * Math.cos(8 * a);
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join("L")}Z`;

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
        "flex flex-col items-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative mb-2 grid size-28 place-items-center text-on-secondary-container">
        <svg
          viewBox="0 0 100 100"
          role="presentation"
          className="absolute inset-0 size-full fill-secondary-container motion-safe:animate-[spin_24s_linear_infinite]"
        >
          <path d={cookie} />
        </svg>
        <Icon name={icon} size={48} className="relative" />
      </div>
      <h3 className="text-[22px] font-[650] tracking-tight">{title}</h3>
      {body && (
        <p className="max-w-sm text-sm text-on-surface-variant">{body}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
