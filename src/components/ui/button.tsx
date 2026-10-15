"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { stateLayer } from "./styles";

type Variant = "filled" | "tonal" | "outlined" | "text" | "elevated";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  filled: "bg-primary text-on-primary hover:shadow-elevation-1",
  tonal:
    "bg-secondary-container text-on-secondary-container hover:shadow-elevation-1",
  outlined: "border border-outline-variant text-on-surface-variant",
  text: "text-primary",
  elevated:
    "bg-surface-container-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
};

const sizes: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-4 text-sm",
  md: "h-11 gap-2 px-6 text-[15px]",
  lg: "h-14 gap-2.5 px-8 text-lg",
};
const iconSizes: Record<Size, number> = { sm: 18, md: 20, lg: 24 };

export function buttonClasses(
  variant: Variant = "filled",
  size: Size = "md",
  className?: string,
) {
  return cn(
    stateLayer,
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-[0.01em]",
    "transition-[border-radius,transform,background-color,box-shadow,scale] duration-200 ease-[var(--ease-spring)] active:scale-[0.97] active:rounded-[12px]",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    variant === "text" && size !== "lg"
      ? sizes[size].replace(/px-\d+/, "px-3")
      : sizes[size],
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
