"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { focusRing } from "./styles";

type Variant =
  | "filled"
  | "tonal"
  | "outlined"
  | "text"
  | "elevated"
  | "ghost"
  | "destructive"
  | "link";
type Size = "sm" | "md" | "lg";

const tonal = "bg-tonal text-tonal-fg hover:bg-tonal-hover";
const ghost = "text-foreground hover:bg-muted";
const variants: Record<Variant, string> = {
  // Disabled (not loading) reads as plainly unavailable, not a faded primary.
  filled:
    "bg-primary text-primary-foreground hover:bg-primary/85 data-[disabled]:not-aria-busy:bg-muted data-[disabled]:not-aria-busy:text-muted-foreground data-[disabled]:not-aria-busy:opacity-100",
  tonal,
  // Legacy names: kept so existing call sites work, mapped to the minimal set.
  elevated: tonal,
  outlined: "border border-border text-foreground hover:bg-muted",
  text: ghost,
  ghost,
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
  link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3.5",
  md: "h-10 gap-2 px-4",
  lg: "h-10 gap-2 px-5",
};
const iconSizes: Record<Size, number> = { sm: 16, md: 18, lg: 18 };

export function buttonClasses(
  variant: Variant = "filled",
  size: Size = "md",
  className?: string,
) {
  return cn(
    focusRing,
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-full text-sm font-medium",
    "transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97]",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    sizes[size],
    variants[variant],
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: string;
  loading?: boolean;
};

export function Button({
  variant,
  size = "md",
  icon,
  loading,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {loading ? (
        <Spinner size={iconSizes[size]} className="text-current" />
      ) : (
        icon && <Icon name={icon} size={iconSizes[size]} />
      )}
      {children}
    </BaseButton>
  );
}

export function ButtonLink({
  variant,
  size = "md",
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  icon?: string;
}) {
  return (
    <Link {...props} className={buttonClasses(variant, size, className)}>
      {icon && <Icon name={icon} size={iconSizes[size]} />}
      {children}
    </Link>
  );
}
