import { createHash, randomBytes } from "node:crypto";

/** Shared by platform.createUniversity (OWNER invites) and invites.create (staff invites). */
export const INVITE_TTL_MS = 7 * 86_400_000;

export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
