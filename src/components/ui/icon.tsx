import { cn } from "@/lib/cn";

export function Icon({
  name,
  filled,
  size = 24,
  className,
}: {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("material-symbols-rounded", className)}
      style={{
        fontSize: size,
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
      }}
    >
      {name}
    </span>
  );
}
