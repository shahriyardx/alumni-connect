import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
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
import { BLANK_PENDING, removeAll, unreferenced, upsertPending } from "./auth";

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

/**
 * Finds the invite matching `token`'s hash, regardless of tenant: the
 * public /invite/[token] flow doesn't know the university yet, so RLS can't
 * be scoped by app.university_id the way every other read is. Instead it
 * proves it holds the secret by setting app.lookup_token_hash to the same
 * hash the row is looked up by (see the invite_token_lookup policy).
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
      .where(
        and(
          eq(invite.tokenHash, hash),
          isNull(invite.acceptedAt),
          gt(invite.expiresAt, new Date()),
        ),
      );
    return row;
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
      const [taken] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email));
      if (taken)
        throw new TRPCError({
          code: "CONFLICT",
          message: "That email already has an account",
        });

      const uni = ctx.me.universityId;
      // A dup open invite to the same email is replaced, not stacked.
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
          department: input.department,
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
    .query(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const inv = await findInvite(input.token);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, inv.email));
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This email is already registered",
        });
      const orphans = await db.transaction((tx: Tx) =>
        upsertPending(tx, {
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
        }).then((replaced) => unreferenced(tx, replaced)),
      );
      await removeAll(orphans);
      return { ok: true as const };
    }),
});
