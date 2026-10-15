/** Shared focus ring for every interactive element. */
export const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Popup enter/exit: short ease-out fade + scale from Base UI's starting/ending styles. */
export const popupMotion =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";

/** Floating surface for menus, selects, dialogs. */
export const popupSurface =
  "bg-popover text-foreground shadow-lg shadow-black/10 ring-1 ring-foreground/5";
