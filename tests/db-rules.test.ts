import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, batch, bookmark, post, rosterEntry } from "@/db/schema";
import { makePost, makeUniversity, makeUser, resetDb } from "./helpers";

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

describe("database rules", () => {
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
    postB = await makePost(b.id, ub.id, { title: "post in B" });
  });

  test("audit log is append only", async () => {
    await db.insert(auditLog).values({ universityId: a.id, action: "test" });
    await rejectsWith(
      Promise.resolve(db.update(auditLog).set({ action: "changed" })),
      /append-only/,
    );
    await rejectsWith(
      Promise.resolve(db.execute(sql`delete from audit_log`)),
      /append-only/,
    );
  });

  test("cannot reference another tenant's row via a same-tenant foreign key", async () => {
    // bookmark with university_id A + user from A, but post_id points at B's post
    await rejectsWith(
      Promise.resolve(
        db
          .insert(bookmark)
          .values({ universityId: a.id, userId: ua.id, postId: postB.id }),
      ),
      /foreign key/,
    );
    // post with university_id A but author from B
    await rejectsWith(
      Promise.resolve(
        db.insert(post).values({
          universityId: a.id,
          authorId: ub.id,
          title: "x",
          body: "y",
        }),
      ),
      /foreign key/,
    );
  });

  test("roster can't point at another tenant's batch", async () => {
    const [batchB] = await db
      .insert(batch)
      .values({ universityId: b.id, number: 1, graduationYear: 2020 })
      .returning();
    await rejectsWith(
      Promise.resolve(
        db.insert(rosterEntry).values({
          universityId: a.id,
          batchId: batchB.id,
          studentIdHash: "h",
          department: "CSE",
        }),
      ),
      /foreign key/,
    );
  });
});
