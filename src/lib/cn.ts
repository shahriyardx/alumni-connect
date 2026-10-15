// ponytail: plain join, no tailwind-merge — callers must not pass conflicting utilities.
export const cn = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");
