import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { university } from "@/db/schema";

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
