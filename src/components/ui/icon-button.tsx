"use client";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { popupMotion, stateLayer } from "./styles";

type Variant = "standard" | "filled" | "tonal" | "outlined";

const variants: Record<Variant, [on: string, off: string]> = {
  standard: ["text-primary", "text-on-surface-variant"],
  filled: [
    "bg-primary text-on-primary",
    "bg-surface-container-highest text-primary",
  ],
  tonal: [
    "bg-secondary-container text-on-secondary-container",
    "bg-surface-container-highest text-on-surface-variant",
  ],
  outlined: [
    "bg-inverse-surface text-inverse-on-surface",
    "border border-outline-variant text-on-surface-variant",
  ],
};

export const tooltipPopup = cn(
  popupMotion,
  "rounded-[8px] bg-inverse-surface px-2.5 py-1.5 text-xs font-medium text-inverse-on-surface shadow-elevation-2 data-[instant]:transition-none",
);

/** Plain M3 tooltip wrapped around any element passed as `render`. */
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
          stateLayer,
          "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center",
          "transition-[border-radius,scale,background-color] duration-200 ease-[var(--ease-spring)] active:scale-90 active:rounded-[12px]",
          "disabled:pointer-events-none disabled:opacity-40",
          selected ? "rounded-[14px]" : "rounded-full",
          // Resting (non-toggle) look: filled/tonal use their container, standard/outlined don't.
          (selected ?? (variant === "filled" || variant === "tonal"))
            ? on
            : off,
          className,
        )}
      >
        <Icon name={icon} filled={selected} />
      </button>
    </Tip>
  );
}
