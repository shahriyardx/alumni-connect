/**
 * Next.js (node_modules/next/dist/server/base-server.js) only *sets*
 * x-forwarded-for via `??=` from the raw socket address when the header
 * is absent; it never appends to or overwrites an existing value. So
 * when the app sits behind a real reverse proxy that appends the hop's
 * address (the standard `proxy_add_x_forwarded_for` convention), the
 * right-most entry is the one added by that nearest, trusted hop —
 * everything left of it can be attacker-supplied. The left-most entry
 * (the previous code's choice) is always attacker-controlled input and
 * must never be used for rate limiting.
 */
export const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
  headers.get("x-real-ip") ||
  "local";
