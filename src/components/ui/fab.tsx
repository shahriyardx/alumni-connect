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
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
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
    "font-semibold",
    className,
  );
  const content = (
    <>
      <Icon name={icon} size={size === "lg" ? 36 : 24} />
      {label}
    </>
  );
  if (href)
    return (
      <Link
        href={href}
        className={classes}
        aria-label={label ? undefined : icon}
      >
        {content}
      </Link>
    );
  return (
    <button
      type="button"
      {...props}
      aria-label={label ? undefined : (props["aria-label"] ?? icon)}
      className={classes}
    >
      {content}
    </button>
  );
}
