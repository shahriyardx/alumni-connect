import { beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLog, post, report, session, user } from "@/db/schema";
import {
  adminDb,
  callerFor,
  makePost,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uniId: string;
let student: { id: string };
let spammer: { id: string };
let mod: { id: string };
let admin: { id: string };
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  student = await makeUser(uniId);
  spammer = await makeUser(uniId);
  mod = await makeUser(uniId, { role: "MODERATOR" });
  admin = await makeUser(uniId, { role: "ADMIN" });
});

test("report → queue → remove → audit", async () => {
  const p = await makePost(uniId, spammer.id, {
    title: "Pay 5000 for referral",
  });
  const { id } = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p.id,
    reason: "Scam job offer",
  });
  expect(
    (
      await callerFor(student.id).moderation.report({
        targetType: "POST",
        targetId: p.id,
        reason: "again please",
      })
    ).id,
  ).toBe(id);
  await expect(callerFor(student.id).moderation.queue({})).rejects.toThrow(
    /FORBIDDEN/,
  );
  const q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0]).toMatchObject({
    id,
    preview: { title: "Pay 5000 for referral" },
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: id,
    action: "remove",
  });
  const [row] = await adminDb.select().from(post).where(eq(post.id, p.id));
  expect(row.deletedAt).not.toBeNull();
  const logs = await adminDb
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "report.remove"));
  expect(logs).toHaveLength(1);
  expect(logs[0].actorId).toBe(mod.id);
});

test("suspend and ban via report; role limits", async () => {
  const p = await makePost(uniId, spammer.id);
  const r1 = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p.id,
    reason: "spam spam",
  });
  await expect(
    callerFor(mod.id).moderation.resolve({
      reportId: r1.id,
      action: "suspend",
    }),
  ).rejects.toThrow(); // days required
  await callerFor(mod.id).moderation.resolve({
    reportId: r1.id,
    action: "suspend",
    days: 7,
  });
  const [s] = await adminDb.select().from(user).where(eq(user.id, spammer.id));
  expect(s.status).toBe("SUSPENDED");
  await expect(callerFor(spammer.id).post.feed({})).rejects.toThrow(
    /suspended/i,
  );
  const r2 = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: admin.id,
    reason: "abuse of power",
  });
  await expect(
    callerFor(mod.id).moderation.resolve({ reportId: r2.id, action: "ban" }),
  ).rejects.toThrow(/FORBIDDEN/);
});

test("admin: roster import, approve, roles, stats", async () => {
  const a = callerFor(admin.id);
  const imp = await a.admin.importRoster({
    csv: "student_id,batch_year,department,graduated\nNU-1,2022,CSE,true\nNU-2,2028,CSE,false",
  });
  expect(imp).toMatchObject({ inserted: 2, updated: 0, errors: [] });
  expect(
    (
      await a.admin.importRoster({
        csv: "student_id,batch_year,department,graduated\nNU-1,2022,CSE,true",
      })
    ).updated,
  ).toBe(1);
  expect(await a.admin.rosterStats()).toEqual({ total: 2, graduated: 1 });
  const pending = await makeUser(uniId, { status: "PENDING" });
  expect((await a.admin.pendingUsers()).map((u) => u.id)).toEqual([pending.id]);
  await a.admin.approveUser({ userId: pending.id });
  await a.admin.setRole({ userId: student.id, role: "MODERATOR" });
  await expect(
    a.admin.setRole({ userId: admin.id, role: "STUDENT" }),
  ).rejects.toThrow(/BAD_REQUEST/);
  await expect(callerFor(mod.id).admin.stats()).rejects.toThrow(/FORBIDDEN/);
  const st = await a.admin.stats();
  expect(st.members.MODERATOR).toBe(2);
  expect(st.postsPerWeek).toHaveLength(8);
  expect((await a.admin.audit({})).items.map((i) => i.action)).toContain(
    "user.role",
  );
});

test("approveUser requires a pending account", async () => {
  const a = callerFor(admin.id);
  await expect(a.admin.approveUser({ userId: student.id })).rejects.toThrow(
    /No pending account/,
  );
  const banned = await makeUser(uniId, { status: "BANNED" });
  await expect(a.admin.approveUser({ userId: banned.id })).rejects.toThrow(
    /No pending account/,
  );
});

test("setUserStatus rejects PENDING targets (no mod bypass of admin approval)", async () => {
  const pending = await makeUser(uniId, { status: "PENDING" });
  await expect(
    callerFor(mod.id).moderation.setUserStatus({
      userId: pending.id,
      status: "ACTIVE",
    }),
  ).rejects.toThrow(/Use admin approval for pending accounts/);
});

test("setUserStatus: ACTIVE only valid from SUSPENDED/BANNED; mods lift suspensions, not bans", async () => {
  const mods = callerFor(mod.id);
  const admins = callerFor(admin.id);

  // Can't "activate" an already-active account.
  await expect(
    mods.moderation.setUserStatus({ userId: student.id, status: "ACTIVE" }),
  ).rejects.toThrow(/Can only activate a suspended or banned account/);

  // A mod can suspend and then lift the suspension.
  await mods.moderation.setUserStatus({
    userId: student.id,
    status: "SUSPENDED",
    days: 3,
  });
  await mods.moderation.setUserStatus({
    userId: student.id,
    status: "ACTIVE",
  });
  const [afterLift] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, student.id));
  expect(afterLift.status).toBe("ACTIVE");

  // A mod can ban, but cannot lift or downgrade that ban.
  await mods.moderation.setUserStatus({ userId: spammer.id, status: "BANNED" });
  await expect(
    mods.moderation.setUserStatus({ userId: spammer.id, status: "ACTIVE" }),
  ).rejects.toThrow(/Only an admin can lift a ban/);
  await expect(
    mods.moderation.setUserStatus({
      userId: spammer.id,
      status: "SUSPENDED",
      days: 3,
    }),
  ).rejects.toThrow(/Only an admin can lift a ban/);
  const [stillBanned] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, spammer.id));
  expect(stillBanned.status).toBe("BANNED");

  // Only an admin can lift the ban.
  await admins.moderation.setUserStatus({
    userId: spammer.id,
    status: "ACTIVE",
  });
  const [unbanned] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, spammer.id));
  expect(unbanned.status).toBe("ACTIVE");
});

test("setUserStatus: a mod cannot act on themselves or ban another moderator", async () => {
  const mod2 = await makeUser(uniId, { role: "MODERATOR" });
  await expect(
    callerFor(mod.id).moderation.setUserStatus({
      userId: mod.id,
      status: "BANNED",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    callerFor(mod.id).moderation.setUserStatus({
      userId: mod2.id,
      status: "BANNED",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

test("setUserStatus: BANNED deletes the user's sessions", async () => {
  await adminDb.insert(session).values({
    id: randomUUID(),
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 3_600_000),
    userId: spammer.id,
    updatedAt: new Date(),
  });
  await callerFor(mod.id).moderation.setUserStatus({
    userId: spammer.id,
    status: "BANNED",
  });
  const sessions = await adminDb
    .select()
    .from(session)
    .where(eq(session.userId, spammer.id));
  expect(sessions).toHaveLength(0);
});

test("resolve: a report that's already handled can't be resolved again", async () => {
  const p = await makePost(uniId, spammer.id);
  const r = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p.id,
    reason: "spam spam",
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: r.id,
    action: "dismiss",
  });
  await expect(
    callerFor(mod.id).moderation.resolve({ reportId: r.id, action: "dismiss" }),
  ).rejects.toThrow(/Report already handled/);
});

test("resolve: remove is rejected for a USER target", async () => {
  const r = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "fake account",
  });
  await expect(
    callerFor(mod.id).moderation.resolve({ reportId: r.id, action: "remove" }),
  ).rejects.toThrow(/BAD_REQUEST/);
});

test("resolve: suspend does not downgrade an already-banned user", async () => {
  const rBan = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "serious abuse",
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: rBan.id,
    action: "ban",
  });
  const [afterBan] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, spammer.id));
  expect(afterBan.status).toBe("BANNED");

  const p2 = await makePost(uniId, spammer.id);
  const rSuspend = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p2.id,
    reason: "more spam",
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: rSuspend.id,
    action: "suspend",
    days: 5,
  });
  const [afterSuspend] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, spammer.id));
  expect(afterSuspend.status).toBe("BANNED");
  const [reportRow] = await adminDb
    .select()
    .from(report)
    .where(eq(report.id, rSuspend.id));
  expect(reportRow.status).toBe("RESOLVED");
});

test("admin.importRoster dedupes duplicate student IDs instead of crashing", async () => {
  const a = callerFor(admin.id);
  const res = await a.admin.importRoster({
    csv: "student_id,batch_year,department,graduated\nNU-9,2022,CSE,true\nnu-9,2023,EEE,false",
  });
  expect(res.inserted).toBe(1);
  expect(res.updated).toBe(0);
  expect(res.errors).toEqual([
    { line: 3, message: "Duplicate student ID (also on line 2)" },
  ]);
});

test("admin.importRoster rejects out-of-range batch_year without crashing", async () => {
  const a = callerFor(admin.id);
  const res = await a.admin.importRoster({
    csv: "student_id,batch_year,department,graduated\nNU-8,2200,CSE,true",
  });
  expect(res).toMatchObject({ inserted: 0, updated: 0 });
  expect(res.errors[0]).toMatchObject({ line: 2 });
});

test("admin.users escapes % and _ in search so they match literally", async () => {
  const a = callerFor(admin.id);
  const exact = await makeUser(uniId, { name: "under_score" });
  const wildcardVictim = await makeUser(uniId, { name: "underXscore" });
  const ids = (await a.admin.users({ q: "under_score" })).items.map(
    (u) => u.id,
  );
  expect(ids).toContain(exact.id);
  expect(ids).not.toContain(wildcardVictim.id);
});

test("admin.stats: members exclude PENDING/BANNED; postsPerWeek excludes soft-deleted", async () => {
  const a = callerFor(admin.id);
  await makeUser(uniId, { status: "PENDING" });
  await makeUser(uniId, { status: "BANNED" });
  const p = await makePost(uniId, spammer.id);
  await adminDb
    .update(post)
    .set({ deletedAt: new Date() })
    .where(eq(post.id, p.id));

  const st = await a.admin.stats();
  expect(st.members.STUDENT).toBe(2); // student + spammer only
  const totalPostsThisWindow = st.postsPerWeek.reduce(
    (sum, w) => sum + w.posts,
    0,
  );
  expect(totalPostsThisWindow).toBe(0);
});
