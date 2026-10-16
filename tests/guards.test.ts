import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { isActiveNow } from "@/lib/account-status";
import {
  adminProcedure,
  createCallerFactory,
  memberProcedure,
  modProcedure,
  ownerProcedure,
  platformProcedure,
  router,
} from "@/server/trpc";
import { adminDb, makeUniversity, makeUser, resetDb } from "./helpers";

const probe = router({
  member: memberProcedure.query(({ ctx }) => ctx.me.id),
  role: memberProcedure.query(({ ctx }) => ctx.me.role),
  mod: modProcedure.query(() => "ok"),
  admin: adminProcedure.query(() => "ok"),
  owner: ownerProcedure.query(() => "ok"),
  platform: platformProcedure.query(({ ctx }) => ctx.me.email),
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
  await expect(as(a.id).owner()).rejects.toThrow(/FORBIDDEN/);
  const o = await makeUser(uniId, { role: "OWNER" });
  expect(await as(o.id).mod()).toBe("ok");
  expect(await as(o.id).admin()).toBe("ok");
  expect(await as(o.id).owner()).toBe("ok");
  const st = await makeUser(uniId, {
    role: "STAFF",
    graduationYear: null,
    batchNumber: null,
    department: null,
  });
  await expect(as(st.id).mod()).rejects.toThrow(/FORBIDDEN/);
});

test("memberProcedure lazily promotes a STUDENT whose graduation year passed", async () => {
  const year = new Date().getFullYear();
  const grad = await makeUser(uniId, { graduationYear: year - 1 });
  const cur = await makeUser(uniId, { graduationYear: year });
  const mod = await makeUser(uniId, {
    role: "MODERATOR",
    graduationYear: year - 5,
  });
  for (const u of [grad, cur, mod]) await as(u.id).member();
  const roleOf = async (id: string) =>
    (
      await adminDb
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, id))
    )[0].role;
  expect(await roleOf(grad.id)).toBe("ALUMNUS");
  expect(await roleOf(cur.id)).toBe("STUDENT");
  expect(await roleOf(mod.id)).toBe("MODERATOR");
  // The promoted role is visible to the same request.
  const fresh = await makeUser(uniId, { graduationYear: year - 1 });
  expect(await as(fresh.id).role()).toBe("ALUMNUS");
});

test("platformProcedure: verified + email listed in PLATFORM_ADMIN_EMAILS only", async () => {
  // .env.test: PLATFORM_ADMIN_EMAILS=platform@test.edu
  const ok = await makeUser(uniId, { email: "Platform@test.edu" });
  expect(await as(ok.id).platform()).toBe("Platform@test.edu");
  await adminDb
    .update(schema.user)
    .set({ emailVerified: false })
    .where(eq(schema.user.id, ok.id));
  await expect(as(ok.id).platform()).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
  const banned = await makeUser(uniId, {
    email: "platform@test.edu",
    status: "BANNED",
  });
  await expect(as(banned.id).platform()).rejects.toThrow(/banned/i);
  const owner = await makeUser(uniId, { role: "OWNER" });
  await expect(as(owner.id).platform()).rejects.toThrow(/FORBIDDEN/);
  await expect(as(null).platform()).rejects.toThrow(/UNAUTHORIZED/);
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
