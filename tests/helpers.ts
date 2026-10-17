// tests/helpers.ts — direct DB access for arranging data
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { truncateAll } from "@/db/reset";
import * as schema from "@/db/schema";
import { createCaller } from "@/server/root";

export const callerFor = (userId: string | null) =>
  createCaller({ userId, ip: "127.0.0.1" });

export const adminClient = postgres(process.env.DATABASE_URL ?? "", {
  max: 2,
  onnotice: () => {},
});
export const adminDb = drizzle(adminClient, { schema });

export const resetDb = () => truncateAll(adminDb);

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
      graduationYear: new Date().getFullYear() + 1,
      batchNumber: 42,
      department: "CSE",
      studentIdHash: id,
      status: "ACTIVE",
      ...over,
    })
    .returning();
  return { ...u, universityId };
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

/** Multipart POST to a presigned POST policy (the ID card upload). */
export function postUpload(
  upload: { url: string; fields: Record<string, string> },
  body: BlobPart = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append("file", new Blob([body]));
  return fetch(upload.url, { method: "POST", body: form });
}
