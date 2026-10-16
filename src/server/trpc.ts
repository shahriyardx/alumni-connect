import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";
import { db, type Tx, withTenant } from "@/db";
import { auditLog, isAdmin, isMod, user } from "@/db/schema";
import { env } from "@/env";
import { isSuspendedNow } from "@/lib/account-status";
import { auth } from "./auth";

export type Context = { userId: string | null; ip: string };

export async function createContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return {
    userId: session?.user.id ?? null,
    // Next.js (node_modules/next/dist/server/base-server.js) only *sets*
    // x-forwarded-for via `??=` from the raw socket address when the header
    // is absent; it never appends to or overwrites an existing value. So
    // when the app sits behind a real reverse proxy that appends the hop's
    // address (the standard `proxy_add_x_forwarded_for` convention), the
    // right-most entry is the one added by that nearest, trusted hop —
    // everything left of it can be attacker-supplied. The left-most entry
    // (the previous code's choice) is always attacker-controlled input and
    // must never be used for rate limiting.
    ip:
      headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
      headers.get("x-real-ip") ||
      "local",
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
    },
  }),
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export type Me = typeof user.$inferSelect;

/**
 * Shared between `memberProcedure` and anything outside tRPC (e.g. the
 * `/api/files` route handler) that needs the same "is this account allowed
 * to use the app right now" check. Returns a human-readable reason, or null
 * when the account is active.
 */
export function activeStatusError(
  me: Pick<Me, "status" | "suspendedUntil">,
): string | null {
  if (me.status === "BANNED") return "Account banned";
  if (me.status === "PENDING") return "Account awaiting approval";
  if (isSuspendedNow(me)) return "Account suspended";
  return null;
}

export const memberProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [me] = await db.select().from(user).where(eq(user.id, ctx.userId));
  if (!me || !me.emailVerified) throw new TRPCError({ code: "UNAUTHORIZED" });
  const statusError = activeStatusError(me);
  if (statusError) {
    throw new TRPCError({ code: "FORBIDDEN", message: statusError });
  }
  return withTenant(me.universityId, async (tx) => {
    // Lazy alumnus promotion: only ever STUDENT -> ALUMNUS.
    let role = me.role;
    if (
      role === "STUDENT" &&
      me.graduationYear !== null &&
      me.graduationYear < new Date().getFullYear()
    ) {
      await tx
        .update(user)
        .set({ role: "ALUMNUS" })
        .where(
          and(
            eq(user.id, me.id),
            eq(user.universityId, me.universityId),
            eq(user.role, "STUDENT"),
          ),
        );
      role = "ALUMNUS";
    }
    const res = await next({ ctx: { db: tx, me: { ...me, role } } });
    if (!res.ok) throw res.error; // roll the transaction back on any procedure error
    return res;
  });
});

export { isAdmin, isMod };
export const modProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isMod(ctx.me.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
export const adminProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.me.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
export const ownerProcedure = memberProcedure.use(({ ctx, next }) => {
  if (ctx.me.role !== "OWNER") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

const platformAdmins = new Set(
  env.PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
export const isPlatformAdmin = (u: Pick<Me, "email" | "emailVerified">) =>
  u.emailVerified && platformAdmins.has(u.email.toLowerCase());

/** Platform admins (env allow-list, verified email). ctx.db is the plain, untenanted db. */
export const platformProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [me] = await db.select().from(user).where(eq(user.id, ctx.userId));
  if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!isPlatformAdmin(me)) throw new TRPCError({ code: "FORBIDDEN" });
  const statusError = activeStatusError(me);
  if (statusError) {
    throw new TRPCError({ code: "FORBIDDEN", message: statusError });
  }
  return next({ ctx: { db, me } });
});

export async function audit(
  tx: Tx,
  universityId: string,
  actorId: string | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
  ip?: string,
) {
  await tx
    .insert(auditLog)
    .values({ universityId, actorId, action, target, meta, ip });
}
