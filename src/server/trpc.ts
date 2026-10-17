import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";
import { db, type Tx, withTenant } from "@/db";
import {
  auditLog,
  isAdmin,
  isMod,
  platformAdmin,
  type UniversityStatus,
  university,
  user,
} from "@/db/schema";
import { isSuspendedNow } from "@/lib/account-status";
import { auth } from "./auth";
import { clientIp } from "./client-ip";
import { envPlatformAdmins } from "./super-admin";

export type Context = { userId: string | null; ip: string };

export async function createContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return {
    userId: session?.user.id ?? null,
    ip: clientIp(headers),
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
  me: Pick<Me, "status" | "suspendedUntil"> & {
    universityStatus: UniversityStatus | null;
  },
): string | null {
  if (me.status === "BANNED") return "Account banned";
  if (me.status === "PENDING") return "Account awaiting approval";
  if (isSuspendedNow(me)) return "Account suspended";
  if (me.universityStatus === "REJECTED")
    return "University application was rejected";
  return null;
}

export const memberProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [row] = await db
    .select({ me: user, universityStatus: university.status })
    .from(user)
    .leftJoin(university, eq(university.id, user.universityId))
    .where(eq(user.id, ctx.userId));
  if (!row || !row.me.emailVerified)
    throw new TRPCError({ code: "UNAUTHORIZED" });
  const me = row.me;
  // A super admin has no university, so no tenant to act in.
  const universityId = me.universityId;
  if (!universityId)
    throw new TRPCError({ code: "FORBIDDEN", message: "No university" });
  const statusError = activeStatusError({
    ...me,
    universityStatus: row.universityStatus,
  });
  if (statusError) {
    throw new TRPCError({ code: "FORBIDDEN", message: statusError });
  }
  return withTenant(universityId, async (tx) => {
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
            eq(user.universityId, universityId),
            eq(user.role, "STUDENT"),
          ),
        );
      role = "ALUMNUS";
    }
    const res = await next({
      ctx: { db: tx, me: { ...me, universityId, role } },
    });
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

/** Verified, and either has a platform_admin row or is in the env allow-list. */
export async function isPlatformAdmin(
  u: Pick<Me, "id" | "email" | "emailVerified">,
) {
  if (!u.emailVerified) return false;
  if (envPlatformAdmins.has(u.email.toLowerCase())) return true;
  const [row] = await db
    .select({ id: platformAdmin.userId })
    .from(platformAdmin)
    .where(eq(platformAdmin.userId, u.id));
  return !!row;
}

/** Platform admins (see isPlatformAdmin). ctx.db is the plain, untenanted db. */
export const platformProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [row] = await db
    .select({ me: user, universityStatus: university.status })
    .from(user)
    .leftJoin(university, eq(university.id, user.universityId))
    .where(eq(user.id, ctx.userId));
  if (!row) throw new TRPCError({ code: "UNAUTHORIZED" });
  const me = row.me;
  if (!(await isPlatformAdmin(me))) throw new TRPCError({ code: "FORBIDDEN" });
  const statusError = activeStatusError({
    ...me,
    universityStatus: row.universityStatus,
  });
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
