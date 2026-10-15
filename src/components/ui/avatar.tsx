"use client";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@/lib/cn";

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <BaseAvatar.Root
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-tonal align-middle font-medium text-tonal-fg",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src && (
        <BaseAvatar.Image src={src} alt="" className="size-full object-cover" />
      )}
      <BaseAvatar.Fallback aria-label={name}>
        {initials || "?"}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
