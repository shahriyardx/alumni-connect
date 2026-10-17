import { createHash, timingSafeEqual } from "node:crypto";
import { eq, gt, or, sql } from "drizzle-orm";
import type { db, Tx } from "@/db";
import { platformAdmin, user } from "@/db/schema";
import { env } from "@/env";
import { graceCutoff } from "./invite-token";

/**
 * Serializes every "is the platform_admin table empty?" decision: the claim,
 * the sign-up before-hook and the after-hook that inserts the row. Held until
 * the caller's transaction ends.
 */
export const lockPlatformAdmin = (tx: Tx) =>
  tx.execute(sql`lock table platform_admin in exclusive mode`);

/**
 * A super admin exists: a verified one, or a claim still mid-signup. A stale
 * unverified claim doesn't count (it can never verify, see assertGrantFresh).
 */
export async function superAdminTaken(tx: Tx | typeof db) {
  const [row] = await tx
    .select({ id: platformAdmin.userId })
    .from(platformAdmin)
    .innerJoin(user, eq(user.id, platformAdmin.userId))
    .where(or(eq(user.emailVerified, true), gt(user.createdAt, graceCutoff())))
    .limit(1);
  return !!row;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** True when no SETUP_TOKEN is configured, else a constant-time match. */
export const setupTokenOk = (given: string | undefined) =>
  !env.SETUP_TOKEN ||
  timingSafeEqual(sha256(given ?? ""), sha256(env.SETUP_TOKEN));
