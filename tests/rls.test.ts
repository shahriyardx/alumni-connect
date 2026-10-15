import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { auditLog, post } from "@/db/schema";
import { makePost, makeUniversity, makeUser, resetDb } from "./helpers";

describe("row level security", () => {
  let a: { id: string };
  let b: { id: string };
  beforeEach(async () => {
    await resetDb();
    a = await makeUniversity("A Uni");
    b = await makeUniversity("B Uni");
    const ua = await makeUser(a.id);
    const ub = await makeUser(b.id);
    await makePost(a.id, ua.id, { title: "post in A" });
    await makePost(b.id, ub.id, { title: "post in B" });
  });

  test("tenant sees only own rows", async () => {
    const rows = await withTenant(a.id, (tx) => tx.select().from(post));
    expect(rows.map((r) => r.title)).toEqual(["post in A"]);
  });

  test("cannot insert into another tenant", async () => {
    const ub = await makeUser(b.id);
    await expect(
      withTenant(a.id, (tx) =>
        tx.insert(post).values({
          universityId: b.id,
          authorId: ub.id,
          title: "x",
          body: "y",
        }),
      ),
    ).rejects.toThrow();
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
    await expect(
      withTenant(a.id, (tx) => tx.update(auditLog).set({ action: "changed" })),
    ).rejects.toThrow();
    await expect(
      withTenant(a.id, (tx) => tx.delete(auditLog)),
    ).rejects.toThrow();
    await expect(
      Promise.resolve(db.execute(sql`delete from audit_log`)),
    ).rejects.toThrow();
  });
});
