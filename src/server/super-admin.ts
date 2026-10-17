import { createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import type { db, Tx } from "@/db";
import { platformAdmin, user } from "@/db/schema";
import { env } from "@/env";
import { graceCutoff } from "./invite-token";

/** PLATFORM_ADMIN_EMAILS, lowercased (the env fallback for platform admins). */
export const envPlatformAdmins = new Set(
  env.PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Serializes every "is the platform_admin table empty?" decision: the claim,
 * the sign-up before-hook and the after-hook that inserts the row. Held until
 * the caller's transaction ends.
 */
/** SQL filter on `user`: env-listed, or holds a platform_admin row (verified or not). */
export const platformAdminWhere = () =>
  or(
    envPlatformAdmins.size
      ? inArray(sql`lower(${user.email})`, [...envPlatformAdmins])
      : sql`false`,
    sql`exists (select 1 from platform_admin pa where pa.user_id = ${user.id})`,
  );

/** Tenant staff may not ban, suspend or re-role a platform admin. */
export async function assertNotPlatformAdmin(
  tx: Tx | typeof db,
  userId: string,
) {
  const [row] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), platformAdminWhere()));
  if (row)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Platform admins can't be moderated here",
    });
}

/** A platform ban is the platform's to lift: tenant staff can't touch the account. */
export function assertNotPlatformBanned(target: { platformBanned: boolean }) {
  if (target.platformBanned)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Banned by the platform",
    });
}

export const lockPlatformAdmin = (tx: Tx) =>
  tx.execute(sql`lock table platform_admin in exclusive mode`);

/**
 * The claim is closed once any platform admin exists: a platform_admin row
 * (verified, or a claim still mid-signup; a stale unverified claim can never
 * verify, see assertGrantFresh) or a verified env-listed account.
 */
export async function superAdminTaken(tx: Tx | typeof db) {
  const [row] = await tx
    .select({ id: platformAdmin.userId })
    .from(platformAdmin)
    .innerJoin(user, eq(user.id, platformAdmin.userId))
    .where(or(eq(user.emailVerified, true), gt(user.createdAt, graceCutoff())))
    .limit(1);
  if (row) return true;
  if (envPlatformAdmins.size === 0) return false;
  const [listed] = await tx
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.emailVerified, true),
        inArray(user.email, [...envPlatformAdmins]),
      ),
    )
    .limit(1);
  return !!listed;
}

export const sha256Hex = (s: string) =>
  createHash("sha256").update(s).digest("hex");

/** Constant-time compare of sha256(given) against a stored hex hash. */
export const tokenMatches = (given: unknown, storedHash: string | null) =>
  typeof given === "string" &&
  !!storedHash &&
  // Digests of both sides: equal length whatever is stored.
  timingSafeEqual(
    createHash("sha256").update(sha256Hex(given)).digest(),
    createHash("sha256").update(storedHash).digest(),
  );

/** True when no SETUP_TOKEN is configured, else a constant-time match. */
export const setupTokenOk = (given: string | undefined) =>
  !env.SETUP_TOKEN || tokenMatches(given ?? "", sha256Hex(env.SETUP_TOKEN));
