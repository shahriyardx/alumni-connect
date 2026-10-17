"use client";
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "theme";

function isChoice(v: unknown): v is "light" | "dark" {
  return v === "light" || v === "dark";
}

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (isChoice(v)) return v;
  } catch {}
  return "system";
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** Light/Dark/System toggle, persisted to localStorage. System removes `data-theme` (CSS falls back to `prefers-color-scheme`). */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  // The root layout's inline script already applied the stored choice before
  // paint; this just syncs React's view of it on mount.
  useEffect(() => setThemeState(readStored()), []);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    apply(choice);
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {}
  }, []);

  return { theme, setTheme };
}

/** Inlined as the first thing in <body> so the theme applies before paint — no flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
