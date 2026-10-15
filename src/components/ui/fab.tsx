"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { stateLayer } from "./styles";

export function Fab({
  icon,
  label,
  href,
  size = "md",
  className,
  disabled,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  /** Button branch only (ignored when `href` is set). */
  disabled?: boolean;
  icon: string;
  /** Set → extended FAB with visible label; otherwise used as aria-label. */
  label?: string;
  href?: string;
  size?: "md" | "lg";
}) {
  const classes = cn(
    stateLayer,
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-3 bg-primary-container text-on-primary-container shadow-elevation-3 hover:shadow-elevation-2",
    "transition-[border-radius,scale,box-shadow] duration-200 ease-[var(--ease-spring)] active:scale-95 active:rounded-[16px]",
    size === "lg"
      ? "h-24 min-w-24 rounded-[28px]"
      : "h-14 min-w-14 rounded-[20px]",
    label && (size === "lg" ? "px-7 text-xl" : "px-5"),
    "font-semibold disabled:pointer-events-none disabled:opacity-40",
    className,
  );
  const ariaLabel = label ? undefined : (props["aria-label"] ?? icon);
  const content = (
    <>
      <Icon name={icon} size={size === "lg" ? 36 : 24} />
      {label}
    </>
  );
  if (href)
    return (
      <Link {...props} href={href} aria-label={ariaLabel} className={classes}>
        {content}
      </Link>
    );
  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      aria-label={ariaLabel}
      className={classes}
    >
      {content}
    </button>
  );
}
