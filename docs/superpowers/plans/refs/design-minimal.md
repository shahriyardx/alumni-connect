# Design direction: modern minimal (supersedes "M3 Expressive" in spec §10 and plan Task 4 design rules)

User decision 2026-10-16: the M3 Expressive kit "looks like a clone of Material UI". Target = the user's
slash-commands-dashboard look. Reference files (copied, read them): `refs/slash-style/*`
(globals-tokens.css, surfaces.css, button.tsx, card.tsx, input.tsx, badge.tsx, select.tsx, dropdown-menu.tsx,
tabs.tsx, dialog.tsx, avatar.tsx, switch.tsx, tooltip.tsx). Those use radix + cva; we keep Base UI and our own
component APIs — copy the LOOK, not the code structure.

## Tokens
- Neutral oklch greys (shadcn-style `--background --foreground --muted --muted-foreground --border --input --ring`),
  ONE blue primary: light `oklch(0.55 0.1736 259.66)`, dark `oklch(0.62 0.1736 259.66)` with dark-mode
  `--primary-foreground: oklch(0.145 0 0)`. Destructive red as in globals-tokens.css.
- Tinted surfaces exactly as surfaces.css: light page = faint primary-tinted grey, cards white (`--surface-1`),
  fields/nested boxes step toward the tint (`--surface-2`); dark = foreground-tinted steps over near-black.
  Mix in **srgb** (oklch mix of greys drifts red). Tonal button colors `--tonal --tonal-hover --tonal-fg`.
- Dark mode via `prefers-color-scheme` (no theme toggle needed).
- Font: `Google_Sans_Flex` from next/font/google as `--font-sans`; tracking-tight = -0.015em, tracking-tighter = -0.03em.
- Icons: keep Material Symbols Rounded (outlined by default, filled only for active nav / selected toggles).

## Shapes & motion
- Buttons: `rounded-full h-10 px-4 text-sm font-medium`, sm `h-8`, icon `size-10`; variants filled (primary),
  tonal (`--tonal`), ghost (hover bg-muted), destructive (destructive/10 bg + destructive text), link.
- Cards: `rounded-3xl bg-surface`, no border, no shadow (or a barely-there shadow only for popovers/dialogs).
- Inputs/select triggers/textarea: `rounded-xl h-10 bg-surface-high border-transparent`, placeholder muted;
  label ABOVE the field (small, medium weight) — no floating labels, no underline.
- Badges: `rounded-full h-5 px-2 text-xs`.
- Focus: `focus-visible:ring-3 ring-ring/50` (+ border-ring on fields). Press: `active:scale-[0.97]` only.
- Motion: short (150–200ms) ease-out fades/scales for popups; NO spring overshoot, NO shape-morphing, NO blobs.

## Layout & copy
- No per-page hero blocks; page title = one line `text-2xl font-semibold tracking-tight` + optional muted subline.
- Navigation: slim left sidebar on desktop (icon + label rows, active row = tonal pill), bottom bar on phones.
- Few words. Few borders. Whitespace over boxes. Color only for primary actions, role badges, and state.
- Role badges: subtle tonal chips (Alumnus = primary-tinted, Student = neutral, Mod/Admin = neutral with icon).
