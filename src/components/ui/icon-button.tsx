"use client";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { focusRing, popupMotion } from "./styles";

type Variant = "standard" | "filled" | "tonal" | "outlined";

const variants: Record<Variant, [on: string, off: string]> = {
  standard: [
    "text-primary hover:bg-muted",
    "text-muted-foreground hover:bg-muted hover:text-foreground",
  ],
  filled: [
    "bg-primary text-primary-foreground hover:bg-primary/85",
    "bg-muted text-foreground hover:bg-tonal",
  ],
  tonal: [
    "bg-tonal text-tonal-fg hover:bg-tonal-hover",
    "bg-muted text-muted-foreground hover:text-foreground",
  ],
  outlined: [
    "bg-foreground text-background",
    "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
  ],
};

export const tooltipPopup = cn(
  popupMotion,
  "rounded-lg bg-inverse px-2 py-1 text-xs font-medium text-inverse-fg shadow-md data-[instant]:transition-none",
);

/** Small inverse tooltip wrapped around any element passed as `render`. */
export function Tip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className={tooltipPopup}>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function IconButton({
  icon,
  label,
  variant = "standard",
  selected,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  variant?: Variant;
  selected?: boolean;
}) {
  const [on, off] = variants[variant];
  return (
    <Tip label={label}>
      <button
        {...props}
        type={type}
        aria-label={label}
        aria-pressed={selected}
        className={cn(
          focusRing,
          "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full",
          "transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97]",
          "disabled:pointer-events-none disabled:opacity-50",
          // Resting (non-toggle) look: filled/tonal use their container, standard/outlined don't.
          (selected ?? (variant === "filled" || variant === "tonal"))
            ? on
            : off,
          className,
        )}
      >
        <Icon name={icon} filled={selected} size={20} />
      </button>
    </Tip>
  );
}
