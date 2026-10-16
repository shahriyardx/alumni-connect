import { beforeEach, expect, test } from "bun:test";
import { isActiveNow } from "@/lib/account-status";
import {
  adminProcedure,
  createCallerFactory,
  memberProcedure,
  modProcedure,
  router,
} from "@/server/trpc";
import { makeUniversity, makeUser, resetDb } from "./helpers";

const probe = router({
  member: memberProcedure.query(({ ctx }) => ctx.me.id),
  mod: modProcedure.query(() => "ok"),
  admin: adminProcedure.query(() => "ok"),
});
const call = createCallerFactory(probe);
const as = (userId: string | null) => call({ userId, ip: "t" });

let uniId: string;
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
});

test("anonymous → UNAUTHORIZED", async () => {
  await expect(as(null).member()).rejects.toThrow(/UNAUTHORIZED/);
});
test("unverified email → UNAUTHORIZED", async () => {
  const u = await makeUser(uniId, { emailVerified: false });
  await expect(as(u.id).member()).rejects.toThrow(/UNAUTHORIZED/);
});
test("pending, banned, active suspension → FORBIDDEN", async () => {
  for (const over of [
    { status: "PENDING" as const },
    { status: "BANNED" as const },
    {
      status: "SUSPENDED" as const,
      suspendedUntil: new Date(Date.now() + 86_400_000),
    },
  ]) {
    const u = await makeUser(uniId, over);
    await expect(as(u.id).member()).rejects.toThrow(
      /FORBIDDEN|banned|approval|suspended/i,
    );
  }
});
test("expired suspension → allowed", async () => {
  const u = await makeUser(uniId, {
    status: "SUSPENDED",
    suspendedUntil: new Date(Date.now() - 1000),
  });
  expect(await as(u.id).member()).toBe(u.id);
});
test("role guards", async () => {
  const s = await makeUser(uniId, { role: "STUDENT" });
  const m = await makeUser(uniId, { role: "MODERATOR" });
  const a = await makeUser(uniId, { role: "ADMIN" });
  await expect(as(s.id).mod()).rejects.toThrow(/FORBIDDEN/);
  expect(await as(m.id).mod()).toBe("ok");
  await expect(as(m.id).admin()).rejects.toThrow(/FORBIDDEN/);
  expect(await as(a.id).admin()).toBe("ok");
});

test("isActiveNow (client shell): expired suspension counts as active", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  expect(isActiveNow({ status: "ACTIVE" })).toBe(true);
  expect(isActiveNow({ status: "SUSPENDED", suspendedUntil: past })).toBe(true);
  expect(isActiveNow({ status: "SUSPENDED", suspendedUntil: future })).toBe(
    false,
  );
  expect(isActiveNow({ status: "SUSPENDED", suspendedUntil: null })).toBe(
    false,
  );
  expect(isActiveNow({ status: "BANNED" })).toBe(false);
  expect(isActiveNow({ status: "PENDING" })).toBe(false);
});
