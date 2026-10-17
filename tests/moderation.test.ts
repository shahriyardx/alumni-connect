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
  ).rejects.toThrow(/Moderators can't act on moderators or admins/);
});

test("nobody can suspend or ban the OWNER", async () => {
  const owner = await makeUser(uniId, { role: "OWNER" });
  for (const actor of [mod, admin]) {
    await expect(
      callerFor(actor.id).moderation.setUserStatus({
        userId: owner.id,
        status: "BANNED",
      }),
    ).rejects.toThrow(/owner/i);
  }
});

test("admin: roles, stats, audit", async () => {
  const a = callerFor(admin.id);
  await a.admin.setRole({ userId: student.id, role: "MODERATOR" });
  const owner = await makeUser(uniId, { role: "OWNER" });
  await expect(
    a.admin.setRole({ userId: student.id, role: "OWNER" }),
  ).rejects.toThrow(/transfer ownership/);
  await expect(
    a.admin.setRole({ userId: owner.id, role: "STUDENT" }),
  ).rejects.toThrow(/owner's role/);
  // OWNER passes every admin gate.
  expect((await callerFor(owner.id).admin.stats()).members.OWNER).toBe(1);
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

test("M1: setRole refuses a PENDING account (it would otherwise become invisible to Approvals)", async () => {
  const pending = await makeUser(uniId, { status: "PENDING" });
  await expect(
    callerFor(admin.id).admin.setRole({
      userId: pending.id,
      role: "MODERATOR",
    }),
  ).rejects.toThrow(/pending/i);
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
  ).rejects.toThrow(/You can't do this to your own account/);
  await expect(
    callerFor(mod.id).moderation.setUserStatus({
      userId: mod2.id,
      status: "BANNED",
    }),
  ).rejects.toThrow(/Moderators can't act on moderators or admins/);
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

  // F2 fix round 2: the no-op suspend still writes a `report.suspend`
  // audit row (a moderator's decision is never left un-logged, even when
  // it didn't change anything) — but with `statusChanged: false` and no
  // `authorId`, so it can't be counted as a strike.
  const suspendAudits = await adminDb
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "report.suspend"));
  expect(suspendAudits).toHaveLength(1);
  expect(suspendAudits[0].actorId).toBe(mod.id);
  expect(suspendAudits[0].meta).toMatchObject({ statusChanged: false });
  expect(suspendAudits[0].meta).not.toHaveProperty("authorId");
  const q = await callerFor(mod.id).moderation.queue({ status: "RESOLVED" });
  const strikesRow = q.items.find((i) => i.id === rSuspend.id);
  expect(strikesRow?.priorStrikes).toBe(1); // only the ban, not a phantom suspend too
});

// F2 fix round 2: every resolve() call is audited, even a no-op one — a
// moderator's decision must never be left un-logged (repudiation gap).
test("resolve: a no-op ban (already banned) is audited without a phantom strike", async () => {
  // Resolving a report auto-resolves every other OPEN report on the exact
  // same target, so to reach the no-op branch legitimately, use a second
  // report on a *different* target that resolves to the same account —
  // same shape as the existing already-banned/suspend test above.
  const rBan = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "serious abuse",
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: rBan.id,
    action: "ban",
  });

  const p1 = await makePost(uniId, spammer.id);
  const rBanAgain = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p1.id,
    reason: "still at it",
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: rBanAgain.id,
    action: "ban",
  });
  const banAudits = await adminDb
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "report.ban"));
  expect(banAudits).toHaveLength(2); // both decisions logged
  const noopBan = banAudits.find((a) => a.meta?.reportId === rBanAgain.id);
  expect(noopBan?.meta).toMatchObject({ statusChanged: false });
  expect(noopBan?.meta).not.toHaveProperty("authorId");

  // Only the first ban counts as a strike — the no-op re-ban doesn't add
  // another one (it's a genuine no-op on the *account*, unlike "remove"
  // below, which is always a strike on upholding the report).
  const r2 = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "once more",
  });
  const q2 = await callerFor(mod.id).moderation.queue({});
  expect(q2.items[0].priorStrikes).toBe(1);
  await callerFor(mod.id).moderation.resolve({
    reportId: r2.id,
    action: "dismiss",
  });
});

// F2 fix round 2: closes a moderation-evasion trick. `remove` must always
// count as a strike on upholding a report, no matter who deleted the
// content or when — otherwise an author could delete their own reported
// post the moment they're reported, and a moderator later resolving that
// (now redundant) report as "remove" would silently erase the strike.
test("resolve: 'remove' still counts as a strike even when the content is already gone by the time a moderator acts", async () => {
  // Case 1: the reported author deletes their own post first.
  const p1 = await makePost(uniId, spammer.id);
  const rSelfDeleted = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p1.id,
    reason: "obvious spam",
  });
  await callerFor(spammer.id).post.remove({ id: p1.id }); // self-delete evasion attempt
  await callerFor(mod.id).moderation.resolve({
    reportId: rSelfDeleted.id,
    action: "remove",
  });

  // Case 2: someone else (another moderator) removed it first.
  const p2 = await makePost(uniId, spammer.id);
  const rRemovedByOther = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p2.id,
    reason: "also spam",
  });
  await callerFor(admin.id).post.remove({ id: p2.id });
  await callerFor(mod.id).moderation.resolve({
    reportId: rRemovedByOther.id,
    action: "remove",
  });

  const removeAudits = await adminDb
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "report.remove"));
  expect(removeAudits).toHaveLength(2);
  for (const row of removeAudits) {
    // Neither flipped `deletedAt` itself (the content was already gone),
    // but both are still a strike on the author.
    expect(row.meta).toMatchObject({
      statusChanged: false,
      authorId: spammer.id,
    });
  }

  // Both count — resolving "remove" on already-gone content is never free.
  await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "pattern of behavior",
  });
  const q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0].priorStrikes).toBe(2);
});

test("admin.importRoster dedupes duplicate student IDs and reports bad rows", async () => {
  const a = callerFor(admin.id);
  const { id: batchId } = await a.workspace.saveBatch({
    number: 42,
    graduationYear: 2022,
  });
  const res = await a.admin.importRoster({
    batchId,
    csv: "student_id,department\nNU-9,CSE\nnu-9,EEE\nNU-8,",
  });
  expect(res.inserted).toBe(1);
  expect(res.updated).toBe(0);
  expect(res.errors).toEqual([
    { line: 3, message: "Duplicate student ID (also on line 2)" },
    expect.objectContaining({ line: 4 }),
  ]);
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

test("admin.stats: pending counts only email-verified PENDING users", async () => {
  const a = callerFor(admin.id);
  await makeUser(uniId, { status: "PENDING" });
  await makeUser(uniId, { status: "PENDING", emailVerified: false });
  const st = await a.admin.stats();
  expect(st.pending).toBe((await a.workspace.approvals()).length);
  expect(st.pending).toBe(1);
});

test("resolve: suspend/ban rejects PENDING targets (use admin approval)", async () => {
  const pending = await makeUser(uniId, { status: "PENDING" });
  for (const action of ["suspend", "ban"] as const) {
    const r = await callerFor(student.id).moderation.report({
      targetType: "USER",
      targetId: pending.id,
      reason: "suspicious signup",
    });
    await expect(
      callerFor(admin.id).moderation.resolve({
        reportId: r.id,
        action,
        days: action === "suspend" ? 3 : undefined,
      }),
    ).rejects.toThrow(/Use admin approval for pending accounts/);
  }
  const [row] = await adminDb
    .select()
    .from(user)
    .where(eq(user.id, pending.id));
  expect(row.status).toBe("PENDING");
});

test("profile.get exposes account status to moderators only", async () => {
  await adminDb
    .update(user)
    .set({
      status: "SUSPENDED",
      suspendedUntil: new Date(Date.now() + 86_400_000),
    })
    .where(eq(user.id, spammer.id));
  const asMod = await callerFor(mod.id).profile.get({ id: spammer.id });
  expect(asMod.moderation?.status).toBe("SUSPENDED");
  expect(asMod.moderation?.suspendedUntil).toBeInstanceOf(Date);
  const asStudent = await callerFor(student.id).profile.get({ id: spammer.id });
  expect(asStudent.moderation).toBeNull();
  expect(asStudent).not.toHaveProperty("status");
});

// F2.1: moderation queue shows the reported author + prior strikes.
test("F2: queue shows the reported author and a running prior-strikes count, tenant isolated", async () => {
  const p1 = await makePost(uniId, spammer.id, { title: "spam 1" });
  const r1 = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p1.id,
    reason: "spam post",
  });
  let q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0]).toMatchObject({
    reportedAuthor: { id: spammer.id, role: "STUDENT" },
    priorStrikes: 0,
  });

  await callerFor(mod.id).moderation.resolve({
    reportId: r1.id,
    action: "remove",
  });

  const p2 = await makePost(uniId, spammer.id, { title: "spam 2" });
  const r2 = await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p2.id,
    reason: "spam again",
  });
  q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0].priorStrikes).toBe(1); // 1 prior removal

  await callerFor(mod.id).moderation.resolve({
    reportId: r2.id,
    action: "suspend",
    days: 3,
  });

  const r3 = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "more abuse",
  });
  q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0].priorStrikes).toBe(2); // + 1 prior suspension

  await callerFor(mod.id).moderation.resolve({
    reportId: r3.id,
    action: "ban",
  });

  const r4 = await callerFor(student.id).moderation.report({
    targetType: "USER",
    targetId: spammer.id,
    reason: "still bad",
  });
  q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0].priorStrikes).toBe(3); // + 1 prior ban

  // A direct status change (no report involved) also counts as a strike.
  await adminDb
    .update(user)
    .set({ status: "ACTIVE", suspendedUntil: null })
    .where(eq(user.id, spammer.id));
  await callerFor(mod.id).moderation.setUserStatus({
    userId: spammer.id,
    status: "SUSPENDED",
    days: 1,
  });
  await callerFor(mod.id).moderation.resolve({
    reportId: r4.id,
    action: "dismiss",
  });
  const p3 = await makePost(uniId, spammer.id, { title: "spam 3" });
  await callerFor(student.id).moderation.report({
    targetType: "POST",
    targetId: p3.id,
    reason: "again",
  });
  q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0].priorStrikes).toBe(4);

  // Tenant isolation: an identical scenario in a second university counts
  // independently, never bleeding into uniId's total.
  const uni2 = await makeUniversity();
  const student2 = await makeUser(uni2.id);
  const mod2 = await makeUser(uni2.id, { role: "MODERATOR" });
  const spammer2 = await makeUser(uni2.id);
  const p4 = await makePost(uni2.id, spammer2.id, { title: "spam in uni2" });
  await callerFor(student2.id).moderation.report({
    targetType: "POST",
    targetId: p4.id,
    reason: "spam post",
  });
  const q2 = await callerFor(mod2.id).moderation.queue({});
  expect(q2.items[0].priorStrikes).toBe(0);
  expect(q2.items[0].reportedAuthor?.id).toBe(spammer2.id);
});

// F2.3: audit log filters by actor and date range.
test("F2: admin.audit filters by actor and date range; auditActors lists staff with entries", async () => {
  const a = callerFor(admin.id);
  await a.admin.setRole({ userId: student.id, role: "STAFF" }); // actor = admin
  await callerFor(mod.id).moderation.setUserStatus({
    userId: spammer.id,
    status: "SUSPENDED",
    days: 1,
  }); // actor = mod
  const [old] = await adminDb
    .insert(auditLog)
    .values({
      universityId: uniId,
      actorId: admin.id,
      action: "settings.update",
      createdAt: new Date(Date.now() - 40 * 86_400_000),
    })
    .returning({ id: auditLog.id });

  const byAdmin = await a.admin.audit({ actorId: admin.id });
  expect(byAdmin.items.length).toBeGreaterThan(0);
  expect(byAdmin.items.every((i) => i.actor?.id === admin.id)).toBe(true);
  expect(byAdmin.items.some((i) => i.action === "user.role")).toBe(true);

  const byMod = await a.admin.audit({ actorId: mod.id });
  expect(byMod.items).toHaveLength(1);
  expect(byMod.items[0].action).toBe("user.status");

  const recent = await a.admin.audit({ range: "30d" });
  expect(recent.items.some((i) => i.id === old.id)).toBe(false);

  const everything = await a.admin.audit({});
  expect(everything.items.some((i) => i.id === old.id)).toBe(true);

  const actorIds = (await a.admin.auditActors()).map((x) => x.id);
  expect(actorIds).toContain(admin.id);
  expect(actorIds).toContain(mod.id);
  expect(actorIds).not.toContain(student.id); // never acted, just acted on
});
