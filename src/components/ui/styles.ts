/** Shared M3 state layer + focus ring for every interactive surface. */
export const stateLayer =
  "relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 before:bg-current before:opacity-0 before:transition-opacity before:duration-150 hover:before:opacity-[.08] active:before:opacity-[.12] focus-visible:before:opacity-[.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Popup enter/exit: springy scale+fade from data-starting-style / data-ending-style. */
export const popupMotion =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-300 ease-[var(--ease-spring)] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[ending-style]:ease-[var(--ease-emphasized)] data-[starting-style]:scale-90 data-[starting-style]:opacity-0";
