import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { university, user } from "@/db/schema";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "university"
  );
}
const suffixed = (base: string) => `${base}-${randomBytes(3).toString("hex")}`;

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string; cause?: { code?: string } }).code === "23505" ||
  (e as { cause?: { code?: string } }).cause?.code === "23505";

/**
 * Inserts a university with a slug from its name (random suffix when taken).
 * A concurrent insert can still win the slug between check and insert, so
 * a unique violation is retried once with a fresh suffix (in a savepoint,
 * so the caller's transaction survives).
 */
export async function insertUniversity(
  tx: Tx,
  values: Omit<typeof university.$inferInsert, "slug">,
) {
  const base = slugify(values.name);
  const [taken] = await db
    .select({ id: university.id })
    .from(university)
    .where(eq(university.slug, base));
  let slug = taken ? suffixed(base) : base;
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await tx.transaction((sp) =>
        sp
          .insert(university)
          .values({ ...values, slug })
          .returning(),
      );
      return row;
    } catch (e) {
      if (attempt > 0 || !isUniqueViolation(e)) throw e;
      slug = suffixed(base);
    }
  }
}

/**
 * Makes targetId (an ACTIVE, verified member) the OWNER; the current OWNER
 * becomes ADMIN. With `from`, only that account may be the one demoted (the
 * owner handing over); the row lock + role check makes a concurrent second
 * transfer fail cleanly. Returns the target's previous role.
 */
export async function transferOwner(
  tx: Tx,
  universityId: string,
  targetId: string,
  from?: string,
) {
  const [target] = await tx
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(
      and(
        eq(user.id, targetId),
        eq(user.universityId, universityId),
        eq(user.status, "ACTIVE"),
        eq(user.emailVerified, true),
      ),
    );
  if (!target)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pick an active member",
    });
  if (target.role === "OWNER")
    throw new TRPCError({ code: "BAD_REQUEST", message: "Already the owner" });
  const demoted = await tx
    .update(user)
    .set({ role: "ADMIN" })
    .where(
      and(
        eq(user.universityId, universityId),
        eq(user.role, "OWNER"),
        from ? eq(user.id, from) : undefined,
      ),
    )
    .returning({ id: user.id });
  if (from && demoted.length === 0)
    throw new TRPCError({
      code: "CONFLICT",
      message: "You're no longer the owner",
    });
  await tx
    .update(user)
    .set({ role: "OWNER" })
    .where(and(eq(user.id, target.id), eq(user.universityId, universityId)));
  return target.role;
}
