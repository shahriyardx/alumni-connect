import { createHash, randomBytes } from "node:crypto";

/** Shared by platform.createUniversity (OWNER invites) and invites.create (staff invites). */
export const INVITE_TTL_MS = 7 * 86_400_000;

export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/**
 * How long a freshly created, still-unverified account is treated as
 * "genuinely mid-signup" rather than abandoned. A single source so the
 * duplicate-signup checks (auth.ts, invites.ts) and the email-verification
 * guard agree on the same cutoff.
 */
export const UNVERIFIED_GRACE_MS = 15 * 60_000;
export const graceCutoff = () => new Date(Date.now() - UNVERIFIED_GRACE_MS);
