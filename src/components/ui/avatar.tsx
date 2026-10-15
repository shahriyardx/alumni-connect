"use client";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@/lib/cn";

const tones = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-error-container text-on-error-container",
  "bg-inverse-primary text-on-primary-container",
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

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
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full align-middle font-semibold",
        tones[hash(name) % tones.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
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
