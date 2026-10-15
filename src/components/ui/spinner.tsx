import { cn } from "@/lib/cn";

/** M3 Expressive circular indeterminate indicator — pure SVG + CSS keyframes. */
export function Spinner({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      role="progressbar"
      aria-label="Loading"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn("animate-spinner-rotate text-primary", className)}
    >
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth="4"
      />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="origin-center -rotate-90 animate-spinner-arc"
      />
    </svg>
  );
}
