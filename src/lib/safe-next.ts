const BASE = "http://x.invalid";

/** Path starts with a single "/" (not "//" or "/\" — those are protocol-relative). */
const isLocalPath = (p: string) =>
  p[0] === "/" && p[1] !== "/" && p[1] !== "\\";

/** Same-origin path from a `next` param, else `fallback` (blocks open redirects like `//x`, `/\x`, `/\t/x`, `/..//x`). */
export function safeNext(n: string | null | undefined, fallback = "/feed") {
  if (!n || !isLocalPath(n)) return fallback;
  try {
    const u = new URL(n, BASE);
    const out = u.pathname + u.search + u.hash;
    // Re-check the output: dot segments can collapse "/..//x" into "//x".
    return u.origin === BASE && isLocalPath(out) ? out : fallback;
  } catch {
    return fallback;
  }
}
