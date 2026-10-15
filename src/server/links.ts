import { TRPCError } from "@trpc/server";
import type { Me } from "./trpc";

const LINK_RE = /https?:\/\/|www\./i;
const NEW_ACCOUNT_MS = 3 * 86_400_000;

/** New accounts (< 3 days old) may not post links, in any forum text field. */
export function assertCanPostLinks(me: Me, ...texts: string[]) {
  const accountAgeMs = Date.now() - me.createdAt.getTime();
  if (accountAgeMs >= NEW_ACCOUNT_MS) return;
  if (texts.some((t) => LINK_RE.test(t))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "New accounts can post links after 3 days",
    });
  }
}
