"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { stateLayer } from "./styles";

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
    stateLayer,
    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium",
    "transition-[border-radius,scale,background-color] duration-200 ease-[var(--ease-spring)] active:scale-95",
    selected
      ? "rounded-[12px] bg-secondary-container text-on-secondary-container"
      : "rounded-[8px] border border-outline-variant text-on-surface-variant",
    className,
  );
  const shownIcon = selected ? "check" : icon;
  const content = (
    <>
      {shownIcon && <Icon name={shownIcon} size={18} className="-ml-1" />}
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
