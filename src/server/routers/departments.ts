import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { department, user } from "@/db/schema";
import { adminProcedure, audit, memberProcedure, router } from "../trpc";

const name = z.string().trim().min(1).max(80);

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string }).code === "23505" ||
  (e as { cause?: { code?: string } }).cause?.code === "23505";

const alreadyExists = () =>
  new TRPCError({
    code: "CONFLICT",
    message: "That department already exists",
  });

/**
 * Validates `raw` against this university's department list (case-insensitive
 * match), returning the list's canonical spelling. An empty list means the
 * university hasn't opted in yet, so free text still passes through as-is.
 */
export async function resolveDepartment(
  tx: Tx,
  universityId: string,
  raw: string,
): Promise<string> {
  const trimmed = raw.trim();
  const rows = await tx
    .select({ name: department.name })
    .from(department)
    .where(eq(department.universityId, universityId));
  if (rows.length === 0) return trimmed;
  const match = rows.find(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!match)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pick a department from the list",
    });
  return match.name;
}

export const departmentsRouter = router({
  /** Plain name list for members (invite dialog, settings' department picker). */
  list: memberProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ name: department.name })
      .from(department)
      .orderBy(asc(department.name));
    return rows.map((r) => r.name);
  }),

  /** Admin Departments page: each department with a member count by role group. */
  withCounts: adminProcedure.query(async ({ ctx }) => {
    const uni = ctx.me.universityId;
    const rows = await ctx.db
      .select({
        id: department.id,
        name: department.name,
        students: sql<number>`count(*) filter (where ${user.role} = 'STUDENT')`,
        alumni: sql<number>`count(*) filter (where ${user.role} = 'ALUMNUS')`,
        faculty: sql<number>`count(*) filter (where ${user.role} in ('OWNER','ADMIN','MODERATOR','STAFF'))`,
      })
      .from(department)
      .leftJoin(
        user,
        and(
          eq(user.universityId, uni),
          sql`lower(${user.department}) = lower(${department.name})`,
          sql`${user.status} <> 'PENDING'`,
        ),
      )
      .groupBy(department.id, department.name)
      .orderBy(asc(department.name));
    return rows.map((r) => ({
      ...r,
      students: Number(r.students),
      alumni: Number(r.alumni),
      faculty: Number(r.faculty),
    }));
  }),

  add: adminProcedure
    .input(z.object({ name }))
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      try {
        const [row] = await ctx.db
          .insert(department)
          .values({ universityId: uni, name: input.name })
          .returning({ id: department.id });
        await audit(ctx.db, uni, ctx.me.id, "department.add", row.id, {
          name: input.name,
        });
        return { id: row.id };
      } catch (e) {
        if (isUniqueViolation(e)) throw alreadyExists();
        throw e;
      }
    }),

  rename: adminProcedure
    .input(z.object({ id: z.string().uuid(), name }))
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      try {
        const [row] = await ctx.db
          .update(department)
          .set({ name: input.name })
          .where(
            and(eq(department.id, input.id), eq(department.universityId, uni)),
          )
          .returning({ id: department.id });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await audit(ctx.db, uni, ctx.me.id, "department.rename", input.id, {
          name: input.name,
        });
        return { ok: true as const };
      } catch (e) {
        if (isUniqueViolation(e)) throw alreadyExists();
        throw e;
      }
    }),

  /** Only removes the picklist entry; members' text department is untouched. */
  remove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const uni = ctx.me.universityId;
      const [row] = await ctx.db
        .delete(department)
        .where(
          and(eq(department.id, input.id), eq(department.universityId, uni)),
        )
        .returning({ name: department.name });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await audit(ctx.db, uni, ctx.me.id, "department.remove", input.id, {
        name: row.name,
      });
      return { ok: true as const };
    }),
});
