import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { invite, university, user } from "@/db/schema";
import { env } from "@/env";
import {
  hashInviteToken,
  INVITE_TTL_MS,
  newInviteToken,
} from "../invite-token";
import { sendMail } from "../mail";
import { adminProcedure, audit, publicProcedure, router } from "../trpc";
import {
  BLANK_PENDING,
  clearStaleUnverified,
  overLimit,
  removeAll,
  unreferenced,
  upsertPending,
} from "./auth";
import { resolveDepartment } from "./departments";

const email = z
  .string()
  .trim()
  .email()
  .max(200)
  .transform((e) => e.toLowerCase());

/** OWNER is never invited through the workspace — only platform.createUniversity issues those. */
const INVITABLE_ROLES = ["ADMIN", "MODERATOR", "STAFF"] as const;

const ROLE_WORD: Record<(typeof INVITABLE_ROLES)[number], string> = {
  ADMIN: "an admin",
  MODERATOR: "a moderator",
  STAFF: "a faculty member",
};

/** A verified account always blocks; a fresh (<15min) unverified one is still mid-signup. */
const GRACE_MS = 15 * 60_000;
const graceCutoff = () => new Date(Date.now() - GRACE_MS);
const blocksSignup = (targetEmail: string) =>
  and(
    eq(user.email, targetEmail),
    or(eq(user.emailVerified, true), gt(user.createdAt, graceCutoff())),
  ) as SQL;

/**
 * Finds the invite matching `token`'s hash, regardless of tenant: the
 * public /invite/[token] flow doesn't know the university yet, so RLS can't
 * be scoped by app.university_id the way every other read is. Instead it
 * proves it holds the secret by setting app.lookup_token_hash to the same
 * hash the row is looked up by (see the invite_token_lookup/recover
 * policies).
 *
 * Self-heals a false "accepted": the before-hook marks accepted_at as soon
 * as the user row is created, before email OTP verification. If that
 * sign-up is abandoned (never verified, past the 15-minute grace window) or
 * the user insert itself failed, there's no live account for the invite's
 * email — so it resets accepted_at back to null instead of burning the
 * invite on a sign-up that never actually completed.
 */
async function findInvite(token: string) {
  const hash = hashInviteToken(token);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.lookup_token_hash', ${hash}, true)`,
    );
    const [row] = await tx
      .select()
      .from(invite)
      .where(and(eq(invite.tokenHash, hash), gt(invite.expiresAt, new Date())));
    if (!row) return undefined;
    if (!row.acceptedAt) return row;
    const [live] = await tx
      .select({ id: user.id })
      .from(user)
      .where(blocksSignup(row.email));
    if (live) return undefined; // genuinely, currently in use
    // Compare-and-set: loses cleanly if another request already recovered
    // (or re-accepted) it between the read above and this update.
    const [recovered] = await tx
      .update(invite)
      .set({ acceptedAt: null })
      .where(and(eq(invite.id, row.id), eq(invite.acceptedAt, row.acceptedAt)))
      .returning();
    return recovered;
  });
}

export const invitesRouter = router({
  create: adminProcedure
    .input(
      z.object({
        email,
        role: z.enum(INVITABLE_ROLES),
        department: z.string().trim().min(1).max(80),
        title: z.string().trim().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "ADMIN" && ctx.me.role !== "OWNER")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can invite admins",
        });
      const uni = ctx.me.universityId;
      const departmentName = await resolveDepartment(
        ctx.db,
        uni,
        input.department,
      );

      const [blocking] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(blocksSignup(input.email));
      if (blocking)
        throw new TRPCError({
          code: "CONFLICT",
          message: "That email already has an account",
        });
      // A stale (unverified, abandoned) account for this email never blocks
      // a new invite — clear it so the eventual sign-up doesn't collide with
      // it on the unique email constraint.
      const staleCards = await clearStaleUnverified(
        ctx.db,
        and(
          lt(user.createdAt, graceCutoff()),
          eq(user.email, input.email),
        ) as SQL,
      );
      await removeAll(staleCards);

      // A dup open invite to the same email is replaced, not stacked — but
      // an open ADMIN invite can only be replaced by the owner, same as
      // creating one.
      const [openExisting] = await ctx.db
        .select({ role: invite.role })
        .from(invite)
        .where(
          and(
            eq(invite.email, input.email),
            eq(invite.universityId, uni),
            isNull(invite.acceptedAt),
          ),
        );
      if (openExisting?.role === "ADMIN" && ctx.me.role !== "OWNER")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can replace an admin invite",
        });
      await ctx.db
        .delete(invite)
        .where(
          and(
            eq(invite.email, input.email),
            eq(invite.universityId, uni),
            isNull(invite.acceptedAt),
          ),
        );
      const token = newInviteToken();
      const [inv] = await ctx.db
        .insert(invite)
        .values({
          universityId: uni,
          email: input.email,
          role: input.role,
          department: departmentName,
          title: input.title,
          tokenHash: hashInviteToken(token),
          invitedBy: ctx.me.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning({ id: invite.id });
      await audit(ctx.db, uni, ctx.me.id, "invite.create", inv.id, {
        email: input.email,
        role: input.role,
      });

      const [{ name }] = await ctx.db
        .select({ name: university.name })
        .from(university)
        .where(eq(university.id, uni));
      const inviteUrl = `${env.BETTER_AUTH_URL}/invite/${token}`;
      await sendMail(
        input.email,
        `You're invited to join ${name} on Alumni Connect`,
        `You've been invited as ${ROLE_WORD[input.role]} at ${name}.\nAccept within 7 days: ${inviteUrl}`,
      );
      return { inviteUrl };
    }),

  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        department: invite.department,
        title: invite.title,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        createdAt: invite.createdAt,
      })
      .from(invite)
      .where(eq(invite.universityId, ctx.me.universityId))
      .orderBy(desc(invite.createdAt)),
  ),

  revoke: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [inv] = await ctx.db
        .select({ role: invite.role, email: invite.email })
        .from(invite)
        .where(
          and(
            eq(invite.id, input.id),
            eq(invite.universityId, ctx.me.universityId),
          ),
        );
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.role === "ADMIN" && ctx.me.role !== "OWNER")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can revoke admin invites",
        });
      // Cascades to any pending_signup row this invite had started.
      await ctx.db
        .delete(invite)
        .where(
          and(
            eq(invite.id, input.id),
            eq(invite.universityId, ctx.me.universityId),
          ),
        );
      await audit(
        ctx.db,
        ctx.me.universityId,
        ctx.me.id,
        "invite.revoke",
        input.id,
        {
          email: inv.email,
        },
      );
      return { ok: true as const };
    }),

  lookup: publicProcedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      if (await overLimit(`app:invite-lookup:ip:${ctx.ip}`, 30))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts, try again later",
        });
      const inv = await findInvite(input.token);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const [uni] = await db
        .select({ name: university.name })
        .from(university)
        .where(eq(university.id, inv.universityId));
      return {
        universityName: uni?.name ?? "",
        role: inv.role,
        email: inv.email,
        department: inv.department,
      };
    }),

  accept: publicProcedure
    .input(
      z.object({
        token: z.string().min(1).max(200),
        name: z.string().trim().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (await overLimit(`app:invite-accept:ip:${ctx.ip}`, 10))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts, try again later",
        });
      const inv = await findInvite(input.token);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });

      const [blocking] = await db
        .select({ id: user.id })
        .from(user)
        .where(blocksSignup(inv.email));
      if (blocking)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This email is already registered",
        });

      const orphans = await db.transaction(async (tx: Tx) => {
        // A stale (unverified, abandoned) account from an earlier attempt
        // at this same invite would otherwise collide on the unique email
        // constraint when the new sign-up finally lands.
        const stale = await clearStaleUnverified(
          tx,
          and(
            lt(user.createdAt, graceCutoff()),
            eq(user.email, inv.email),
          ) as SQL,
        );
        const replaced = await upsertPending(tx, {
          ...BLANK_PENDING,
          email: inv.email,
          universityId: inv.universityId,
          // Platform OWNER invites carry no department (no tenant staff yet).
          department: inv.department ?? "Administration",
          title: inv.title,
          inviteId: inv.id,
          role: inv.role,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 30 * 60_000),
        });
        return [...stale, ...(await unreferenced(tx, replaced))];
      });
      await removeAll(orphans);
      return { ok: true as const };
    }),
});
