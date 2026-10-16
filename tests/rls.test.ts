import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db, withTenant } from "@/db";
import {
  auditLog,
  batch,
  bookmark,
  invite,
  post,
  rosterEntry,
} from "@/db/schema";
import {
  adminDb,
  makePost,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

/** drizzle-orm wraps the real Postgres error message in `.cause`, not `.message` — match both. */
async function rejectsWith(p: Promise<unknown>, pattern: RegExp) {
  try {
    await p;
  } catch (err) {
    const cause =
      err instanceof Error ? (err.cause as Error | undefined) : undefined;
    const message = `${err instanceof Error ? err.message : String(err)} ${cause?.message ?? ""}`;
    expect(message).toMatch(pattern);
    return;
  }
  throw new Error("expected promise to reject");
}

describe("row level security", () => {
  let a: { id: string };
  let b: { id: string };
  let ua: { id: string };
  let ub: { id: string };
  let postB: { id: string };
  beforeEach(async () => {
    await resetDb();
    a = await makeUniversity("A Uni");
    b = await makeUniversity("B Uni");
    ua = await makeUser(a.id);
    ub = await makeUser(b.id);
    await makePost(a.id, ua.id, { title: "post in A" });
    postB = await makePost(b.id, ub.id, { title: "post in B" });
  });

  test("tenant sees only own rows", async () => {
    const rows = await withTenant(a.id, (tx) => tx.select().from(post));
    expect(rows.map((r) => r.title)).toEqual(["post in A"]);
  });

  test("cannot insert into another tenant", async () => {
    const other = await makeUser(b.id);
    await rejectsWith(
      withTenant(a.id, (tx) =>
        tx.insert(post).values({
          universityId: b.id,
          authorId: other.id,
          title: "x",
          body: "y",
        }),
      ),
      /row-level security/,
    );
  });

  test("no tenant set → zero rows, also after a pooled connection was used by a tenant tx", async () => {
    await withTenant(a.id, (tx) => tx.select().from(post));
    for (let i = 0; i < 12; i++) {
      expect(await db.select().from(post)).toEqual([]);
    }
  });

  test("audit log is append only for app_user", async () => {
    await withTenant(a.id, (tx) =>
      tx.insert(auditLog).values({ universityId: a.id, action: "test" }),
    );
    await rejectsWith(
      withTenant(a.id, (tx) => tx.update(auditLog).set({ action: "changed" })),
      /permission denied|append-only/,
    );
    await rejectsWith(
      withTenant(a.id, (tx) => tx.delete(auditLog)),
      /permission denied|append-only/,
    );
    await rejectsWith(
      Promise.resolve(db.execute(sql`delete from audit_log`)),
      /permission denied|append-only/,
    );
  });

  test("cannot reference another tenant's row via a same-tenant foreign key", async () => {
    // bookmark with university_id A + user from A, but post_id points at B's post
    await rejectsWith(
      withTenant(a.id, (tx) =>
        tx.insert(bookmark).values({
          universityId: a.id,
          userId: ua.id,
          postId: postB.id,
        }),
      ),
      /foreign key/,
    );

    // post with university_id A but author from B
    await rejectsWith(
      withTenant(a.id, (tx) =>
        tx.insert(post).values({
          universityId: a.id,
          authorId: ub.id,
          title: "x",
          body: "y",
        }),
      ),
      /foreign key/,
    );
  });

  test("batch and invite are tenant-isolated; roster can't point at another tenant's batch", async () => {
    const [batchB] = await adminDb
      .insert(batch)
      .values({ universityId: b.id, number: 1, graduationYear: 2020 })
      .returning();
    await adminDb.insert(invite).values({
      universityId: b.id,
      email: "x@b.edu",
      role: "STAFF",
      tokenHash: "t",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await withTenant(a.id, (tx) => tx.select().from(batch))).toEqual([]);
    expect(await withTenant(a.id, (tx) => tx.select().from(invite))).toEqual(
      [],
    );
    await rejectsWith(
      withTenant(a.id, (tx) =>
        tx.insert(batch).values({
          universityId: b.id,
          number: 2,
          graduationYear: 2020,
        }),
      ),
      /row-level security/,
    );
    await rejectsWith(
      adminDb.insert(rosterEntry).values({
        universityId: a.id,
        batchId: batchB.id,
        studentIdHash: "h",
        department: "CSE",
      }),
      /foreign key/,
    );
  });
});
