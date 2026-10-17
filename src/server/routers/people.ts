import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { user } from "@/db/schema";
import { memberProcedure, router } from "../trpc";

export type AlumniListItem = {
  id: string;
  name: string;
  avatarKey: string | null;
  graduationYear: number | null;
  title: string | null;
  department: string | null;
  answerCount: number;
};

const LIMIT = 20;

export const peopleRouter = router({
  /**
   * ACTIVE ALUMNUS of the caller's university whose department matches the
   * caller's (case-insensitive), newest graduation year first.
   */
  alumniInMyDepartment: memberProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0) }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ items: AlumniListItem[]; nextCursor: number | null }> => {
        const myDepartment = ctx.me.department;
        if (!myDepartment) return { items: [], nextCursor: null };

        const rows = await ctx.db
          .select({
            id: user.id,
            name: user.name,
            avatarKey: user.avatarKey,
            graduationYear: user.graduationYear,
            title: user.title,
            department: user.department,
            // comment.author_id is a same-tenant FK to "user", so this
            // correlated count never crosses universities.
            // `"user".id` is written as plain SQL (not `${user.id}`) because
            // the outer query already selects FROM "user" unaliased —
            // interpolating the column here collides with this field's own
            // "id" output alias instead of qualifying it.
            answerCount: sql<number>`(select count(*) from comment c where c.author_id = "user".id and c.deleted_at is null)`,
          })
          .from(user)
          .where(
            and(
              eq(user.universityId, ctx.me.universityId),
              eq(user.role, "ALUMNUS"),
              eq(user.status, "ACTIVE"),
              // Plain `"user".department`, not `${user.department}` — see
              // the note on `answerCount` above.
              sql`lower("user".department) = lower(${myDepartment})`,
            ),
          )
          .orderBy(sql`"user".graduation_year desc nulls last`, user.name)
          .limit(LIMIT + 1)
          .offset(input.cursor);

        const items = rows.slice(0, LIMIT).map((r) => ({
          ...r,
          answerCount: Number(r.answerCount),
        }));
        return {
          items,
          nextCursor: rows.length > LIMIT ? input.cursor + LIMIT : null,
        };
      },
    ),
});
