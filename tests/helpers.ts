// tests/helpers.ts — superuser access (bypasses RLS) for arranging data
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createCaller } from "@/server/root";

export const callerFor = (userId: string | null) =>
  createCaller({ userId, ip: "127.0.0.1" });

export const adminClient = postgres(process.env.DATABASE_ADMIN_URL ?? "", {
  max: 2,
  onnotice: () => {},
});
export const adminDb = drizzle(adminClient, { schema });

export async function resetDb() {
  await adminDb.execute(sql`
    truncate university, "user", session, account, verification, rate_limit, pending_signup,
      roster_entry, post, comment, tag, post_tag, vote, bookmark, follow_user, follow_tag,
      notification, attachment, report restart identity cascade`);
  // audit_log: trigger blocks DELETE but TRUNCATE skips row triggers; superuser may truncate.
  await adminDb.execute(sql`truncate audit_log`);
}

export async function makeUniversity(
  name = `Uni ${randomUUID().slice(0, 6)}`,
  emailDomain = `${randomUUID().slice(0, 6)}.edu`,
) {
  const [u] = await adminDb
    .insert(schema.university)
    .values({
      name,
      slug: name.toLowerCase().replace(/\W+/g, "-"),
      emailDomain,
    })
    .returning();
  return u;
}

export async function makeUser(
  universityId: string,
  over: Partial<typeof schema.user.$inferInsert> = {},
) {
  const id = randomUUID();
  const [u] = await adminDb
    .insert(schema.user)
    .values({
      id,
      name: `User ${id.slice(0, 4)}`,
      email: `${id}@test.edu`,
      emailVerified: true,
      universityId,
      role: "STUDENT",
      batchYear: 2027,
      department: "CSE",
      studentIdHash: id,
      status: "ACTIVE",
      ...over,
    })
    .returning();
  return u;
}

export async function makePost(
  universityId: string,
  authorId: string,
  over: Partial<typeof schema.post.$inferInsert> = {},
) {
  const [p] = await adminDb
    .insert(schema.post)
    .values({
      universityId,
      authorId,
      title: "Hello world post",
      body: "Body text",
      ...over,
    })
    .returning();
  return p;
}
