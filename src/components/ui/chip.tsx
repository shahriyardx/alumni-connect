"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { focusRing } from "./styles";

export function Chip({
  label,
  icon,
  selected,
  href,
  onClick,
  className,
}: {
  label: string;
  icon?: string;
  selected?: boolean;
  href?: string;
  onClick?(): void;
  className?: string;
}) {
  const classes = cn(
    focusRing,
    "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium",
    "transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97]",
    selected
      ? "bg-tonal text-tonal-fg hover:bg-tonal-hover"
      : "bg-muted text-muted-foreground hover:text-foreground",
    icon && "pl-2",
    className,
  );
  const content = (
    <>
      {icon && <Icon name={icon} filled={selected} size={14} />}
      {label}
    </>
  );
  if (href)
    return (
      <Link
        href={href}
        className={classes}
        aria-current={selected ? "page" : undefined}
      >
        {content}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={classes}
    >
      {content}
    </button>
  );
}
