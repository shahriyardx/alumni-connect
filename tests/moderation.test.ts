import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLog, post, user } from "@/db/schema";
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
