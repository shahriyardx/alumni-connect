import { cn } from "@/lib/cn";

/** Thin indeterminate ring. */
export function Spinner({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      role="progressbar"
      aria-label="Loading"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("animate-spin-slow text-primary", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth="2.5"
      />
      <path
        d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
