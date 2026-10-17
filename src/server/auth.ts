import { randomUUID } from "node:crypto";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { clientIp } from "./client-ip";
import { graceCutoff } from "./invite-token";
import { sendMail } from "./mail";
import {
  lockPlatformAdmin,
  superAdminTaken,
  tokenMatches,
} from "./super-admin";
import { insertUniversity } from "./university";

const field = <T extends "string" | "number" | "date" | "boolean">(type: T) =>
  ({ type, required: false, input: false }) as const;
/** Approver-only fields: never sent back in the session. */
const hidden = <T extends "string" | "boolean">(type: T) =>
  ({ ...field(type), returned: false }) as const;

/**
 * Refuses verification once a non-STUDENT/ALUMNUS account's invite grant can
 * no longer be trusted: still unverified, and sitting past the same grace
 * window every other "still mid-signup?" check in this app uses. Its invite
 * may since have been revoked (see invites.revoke, which deletes the row
 * outright instead — this is the backstop for the window before a revoke,
 * or for an invite that simply outlived its own TTL) — nothing else
 * re-checks the grant once the user row exists, so every path that can flip
 * `emailVerified` must consult this. STUDENT/ALUMNUS accounts carry no such
 * grant and are never affected.
 */
async function assertGrantFresh(email: string) {
  const [row] = await db
    .select({
      role: schema.user.role,
      createdAt: schema.user.createdAt,
      emailVerified: schema.user.emailVerified,
      universityId: schema.user.universityId,
      universityStatus: schema.university.status,
    })
    .from(schema.user)
    .leftJoin(
      schema.university,
      eq(schema.university.id, schema.user.universityId),
    )
    .where(eq(schema.user.email, email.toLowerCase()));
  if (
    row &&
    // No university = a super admin claim: once stale, someone else may
    // claim, so this one must never verify late.
    (!row.universityId ||
      (row.role !== "STUDENT" &&
        row.role !== "ALUMNUS" &&
        // A rep's own application (OWNER of a still-PENDING university) is not
        // someone else's grant that can be revoked, so it never goes stale.
        !(row.role === "OWNER" && row.universityStatus === "PENDING"))) &&
    !row.emailVerified &&
    row.createdAt < graceCutoff()
  )
    throw new APIError("FORBIDDEN", {
      message: "This invitation has expired, ask for a new one",
    });
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    // Friendlier early check on /email-otp/verify-email. Not the only guard — see databaseHooks.user
    // .update.before below, which is the one every path routes through.
    beforeEmailVerification: async (u) => {
      await assertGrantFresh(u.email);
    },
  },
  user: {
    additionalFields: {
      universityId: field("string"),
      role: { type: [...schema.ROLES], required: false, input: false },
      graduationYear: field("number"),
      batchNumber: field("number"),
      department: field("string"),
      title: field("string"),
      studentIdHash: field("string"),
      idCardKey: hidden("string"),
      rosterMatch: hidden("boolean"),
      studentIdHint: hidden("string"),
      bio: field("string"),
      avatarKey: field("string"),
      status: { type: [...schema.STATUSES], required: false, input: false },
      suspendedUntil: field("date"),
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u, ctx) => {
          const email = u.email.toLowerCase();
          const [read] = await db
            .select({
              p: schema.pendingSignup,
              // Row version, for the compare-and-set claim below.
              version: sql<string>`${schema.pendingSignup}.xmin::text`,
            })
            .from(schema.pendingSignup)
            .where(
              and(
                eq(schema.pendingSignup.email, email),
                gt(schema.pendingSignup.expiresAt, new Date()),
                isNull(schema.pendingSignup.claimedAt),
              ),
            );
          if (!read) return false;
          const { p, version } = read;
          // The first super admin (auth.claimSuperAdmin): no university.
          // Re-checked under the lock; the after-hook settles a race.
          if (p.platformAdmin) {
            // The claim token from auth.claimSuperAdmin, passed through the
            // sign-up body: the pending row alone is not a bearer grant.
            const claimToken = (
              ctx?.body as { claimToken?: unknown } | undefined
            )?.claimToken;
            if (!tokenMatches(claimToken, p.signupTokenHash)) return false;
            const claimed = await db.transaction(async (tx) => {
              await lockPlatformAdmin(tx);
              if (await superAdminTaken(tx)) return false;
              const [row] = await tx
                .update(schema.pendingSignup)
                .set({ claimedAt: new Date() })
                .where(
                  and(
                    eq(schema.pendingSignup.email, email),
                    sql`${schema.pendingSignup}.xmin::text = ${version}`,
                  ),
                )
                .returning({ email: schema.pendingSignup.email });
              return !!row;
            });
            if (!claimed) return false;
            return { data: { ...u, email, universityId: null } };
          }
          // Students must have confirmed an ID card photo (confirmIdCard).
          if ((p.role === "STUDENT" || p.role === "ALUMNUS") && !p.idCardKey)
            return false;
          // Two different emails can each get a pending_signup row for the
          // same studentIdHash (pending_signup is keyed by email, not ID).
          // If a user with that hash already exists (e.g. the other
          // pending email finished sign-up first), refuse cleanly instead
          // of letting the unique constraint on user.student_id_hash throw
          // a raw 500.
          if (p.studentIdHash) {
            const [existingById] = await db
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(eq(schema.user.studentIdHash, p.studentIdHash));
            if (existingById) return false;
          }
          // OWNER rows either create a *new* PENDING university from an
          // application, or claim an existing one from a platform OWNER
          // invite. ADMIN/MODERATOR/STAFF rows only ever come from a staff
          // invite (invites.accept). Re-check the invite itself here (not
          // just in invites.accept): it may have been revoked or accepted
          // elsewhere in the gap between accept() writing this pending row
          // and the user actually finishing sign-up.
          const application = p.role === "OWNER" && !!p.applicationName;
          const invited =
            (p.role === "OWNER" ||
              p.role === "ADMIN" ||
              p.role === "MODERATOR" ||
              p.role === "STAFF") &&
            !application;
          if (invited) {
            if (!p.universityId || !p.inviteId) return false;
            const [inv] = await db
              .select({
                role: schema.invite.role,
                email: schema.invite.email,
                acceptedAt: schema.invite.acceptedAt,
                expiresAt: schema.invite.expiresAt,
                universityStatus: schema.university.status,
              })
              .from(schema.invite)
              .innerJoin(
                schema.university,
                eq(schema.university.id, schema.invite.universityId),
              )
              .where(
                and(
                  eq(schema.invite.id, p.inviteId as string),
                  eq(schema.invite.universityId, p.universityId),
                ),
              );
            if (
              !inv ||
              inv.role !== p.role ||
              inv.email !== email ||
              inv.acceptedAt ||
              inv.expiresAt <= new Date() ||
              // A university rejected/suspended between accept() and this sign-up
              // (e.g. its application was abandoned) stays blocked.
              inv.universityStatus === "REJECTED" ||
              inv.universityStatus === "SUSPENDED"
            )
              return false;
          }
          if (!application && !invited && !p.universityId) return false;
          // Claim the row: mark it only if it is still exactly what was read.
          // A concurrent startSignup restart then either replaced it first
          // (this sign-up is refused) or sees it claimed and refuses to
          // replace it. The row — and with it the card reference — stays
          // until the after-hook deletes it, so if the user insert fails
          // the purge still finds and removes the card (5 min later).
          const [claimed] = await db
            .update(schema.pendingSignup)
            .set({ claimedAt: new Date() })
            .where(
              and(
                eq(schema.pendingSignup.email, email),
                sql`${schema.pendingSignup}.xmin::text = ${version}`,
              ),
            )
            .returning({ email: schema.pendingSignup.email });
          if (!claimed) return false;
          let universityId = p.universityId;
          if (application && p.applicationName) {
            const id = randomUUID();
            const name = p.applicationName;
            await db.transaction(async (tx) => {
              await insertUniversity(tx, {
                id,
                name,
                website: p.applicationWebsite,
                status: "PENDING",
              });
              // Inline audit(): importing ../trpc here would be circular.
              await tx.insert(schema.auditLog).values({
                universityId: id,
                action: "university.apply",
                target: email,
                meta: { name, rep: u.name },
                ip: ctx?.headers ? clientIp(ctx.headers) : undefined,
              });
            });
            universityId = id;
          }
          if (invited) {
            // Compare-and-set, mirroring the pending-row claim above: marks
            // the invite single-use, and loses cleanly to a concurrent
            // revoke/accept instead of racing it.
            const [marked] = await db
              .update(schema.invite)
              .set({ acceptedAt: new Date() })
              .where(
                and(
                  eq(schema.invite.id, p.inviteId as string),
                  eq(schema.invite.universityId, universityId as string),
                  isNull(schema.invite.acceptedAt),
                  gt(schema.invite.expiresAt, new Date()),
                ),
              )
              .returning({ id: schema.invite.id });
            if (!marked) return false;
          }
          if (!universityId) return false;
          return {
            data: {
              ...u,
              email,
              universityId,
              role: p.role,
              graduationYear: p.graduationYear,
              batchNumber: p.batchNumber,
              department: p.department || null,
              title: p.title,
              studentIdHash: p.studentIdHash,
              idCardKey: p.idCardKey,
              rosterMatch: p.rosterMatch,
              studentIdHint: p.studentIdHint,
              status: p.status,
            },
          };
        },
        after: async (u) => {
          const [p] = await db
            .delete(schema.pendingSignup)
            .where(eq(schema.pendingSignup.email, u.email))
            .returning({ platformAdmin: schema.pendingSignup.platformAdmin });
          if (!p?.platformAdmin) return;
          // Two claimers can both pass the before-hook (the user row doesn't
          // exist yet there); the first to get here wins, the other is undone.
          // The loser is deleted in the same locked transaction as the check.
          const won = await db.transaction(async (tx) => {
            await lockPlatformAdmin(tx);
            if (await superAdminTaken(tx)) {
              await tx.delete(schema.user).where(eq(schema.user.id, u.id));
              return false;
            }
            await tx.insert(schema.platformAdmin).values({ userId: u.id });
            return true;
          });
          if (!won) {
            throw new APIError("CONFLICT", {
              message: "Alumni Connect is already set up",
            });
          }
        },
      },
      update: {
        // The root guard: better-auth calls this on *every*
        // internalAdapter.updateUser, whichever endpoint triggers it —
        // /email-otp/verify-email, /sign-in/email-otp (an existing
        // unverified row gets promoted straight to a session), and
        // /email-otp/reset-password all flip emailVerified this way, and
        // none of them re-check an invite/application grant on their own.
        // Our app's own user writes (role changes, status, etc.) go through
        // plain Drizzle, never better-auth's adapter, so this never fires
        // for them.
        before: async (data, ctx) => {
          if (data.emailVerified !== true) return;
          const email = (ctx?.body as { email?: string } | undefined)?.email;
          if (!email) return;
          await assertGrantFresh(email);
        },
      },
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const what =
          type === "forget-password"
            ? "reset your password"
            : "verify your email";
        await sendMail(
          email,
          `Your Alumni Connect code: ${otp}`,
          `Use this code to ${what}: ${otp}\nIt expires in 5 minutes.`,
        );
      },
    }),
    nextCookies(),
  ],
});
