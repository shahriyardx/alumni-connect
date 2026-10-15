"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { focusRing } from "./styles";

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
    focusRing,
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground shadow-lg shadow-primary/25",
    "transition-[background-color,scale] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]",
    size === "lg" ? "h-14 min-w-14" : "h-12 min-w-12",
    label && (size === "lg" ? "px-6 text-base" : "px-5 text-sm"),
    "disabled:pointer-events-none disabled:opacity-50",
    className,
  );
  const ariaLabel = label ? undefined : (props["aria-label"] ?? icon);
  const content = (
    <>
      <Icon name={icon} size={size === "lg" ? 26 : 22} />
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
