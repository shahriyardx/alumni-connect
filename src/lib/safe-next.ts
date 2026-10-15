const BASE = "http://x.invalid";

/** Same-origin path from a `next` param, else `fallback` (blocks open redirects like `//x`, `/\x`, `/\t/x`). */
export function safeNext(n: string | null | undefined, fallback = "/feed") {
  if (!n || n[0] !== "/" || n[1] === "/" || n[1] === "\\") return fallback;
  try {
    const u = new URL(n, BASE);
    return u.origin === BASE ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
