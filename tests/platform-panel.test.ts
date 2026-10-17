import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  auditLog,
  broadcast,
  notification,
  platformAdmin,
  platformAudit,
  session,
  university,
  user,
} from "@/db/schema";
import {
  adminDb,
  callerFor,
  makePost,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let home: { id: string };
let envAdmin: { id: string };
let platform: ReturnType<typeof callerFor>;

const statusOf = (table: typeof university, id: string) =>
  adminDb
    .select({ s: table.status })
    .from(table)
    .where(eq(table.id, id))
    .then((r) => r[0].s);
const userRow = (id: string) =>
  adminDb
    .select()
    .from(user)
    .where(eq(user.id, id))
    .then((r) => r[0]);
const platformActions = () =>
  adminDb
    .select()
    .from(platformAudit)
    .then((r) => r.map((x) => x.action));

beforeEach(async () => {
  await resetDb();
  home = await makeUniversity("Home");
  // .env.test: PLATFORM_ADMIN_EMAILS=platform@test.edu
  envAdmin = await makeUser(home.id, { email: "platform@test.edu" });
  platform = callerFor(envAdmin.id);
});

describe("role gate", () => {
  test("member, OWNER and unverified users are refused on every procedure", async () => {
    const uni = await makeUniversity("Other");
    const target = await makeUser(uni.id);
    const callers = [
      callerFor((await makeUser(uni.id)).id),
      callerFor((await makeUser(uni.id, { role: "OWNER" })).id),
      callerFor(
        (
          await makeUser(home.id, {
            email: "platform-unverified@test.edu",
            emailVerified: false,
          })
        ).id,
      ),
    ];
    // An unverified platform_admin row is no admin either.
    const rowUnverified = await makeUser(uni.id, { emailVerified: false });
    await adminDb.insert(platformAdmin).values({ userId: rowUnverified.id });
    callers.push(callerFor(rowUnverified.id));
    for (const as of callers) {
      const p = as.platform;
      const calls = [
        () => p.overview(),
        () => p.universities({}),
        () => p.university({ universityId: uni.id }),
        () => p.suspend({ universityId: uni.id }),
        () => p.reactivate({ universityId: uni.id }),
        () => p.transferOwnership({ universityId: uni.id, userId: target.id }),
        () => p.users({}),
        () => p.setBanned({ userId: target.id, banned: true }),
        () => p.audit({}),
        () => p.admins(),
        () => p.addAdmin({ email: "x@x.edu" }),
        () => p.removeAdmin({ userId: target.id }),
        () => p.broadcast({ title: "Hello all", body: "Body" }),
        () => p.broadcasts(),
      ];
      for (const c of calls) await expect(c()).rejects.toThrow(/FORBIDDEN/);
    }
    expect(await statusOf(university, uni.id)).toBe("ACTIVE");
    expect((await userRow(target.id)).status).toBe("ACTIVE");
    expect(await adminDb.select().from(broadcast)).toHaveLength(0);
    await expect(callerFor(null).platform.overview()).rejects.toThrow(
      /UNAUTHORIZED/,
    );
  });
});

describe("overview + detail", () => {
  test("counts across tenants, sign-ups per day, detail activity", async () => {
    const a = await makeUniversity("A");
    const b = await makeUniversity("B");
    const ua = await makeUser(a.id, { role: "OWNER" });
    const ub = await makeUser(b.id);
    await makePost(a.id, ua.id);
    await makePost(b.id, ub.id);
    await makePost(b.id, ub.id, { deletedAt: new Date() });
    await adminDb
      .update(university)
      .set({ status: "PENDING" })
      .where(eq(university.id, b.id));
    const o = await platform.platform.overview();
    expect(o.posts).toBe(2);
    expect(o.comments).toBe(0);
    expect(o.universities).toMatchObject({ ACTIVE: 2, PENDING: 1 });
    expect(o.pendingApplications).toBe(1);
    expect(o.users).toMatchObject({ OWNER: 1, STUDENT: 2 });
    expect(o.signupsPerDay).toHaveLength(30);
    expect(o.signupsPerDay.at(-1)?.n).toBe(3);
    expect(o.signups7).toBe(3);
    expect(o.signups30).toBe(3);

    const d = await platform.platform.university({ universityId: a.id });
    expect(d).toMatchObject({
      name: "A",
      status: "ACTIVE",
      posts: 1,
      owner: { email: ua.email },
    });
    expect(d.members.OWNER).toBe(1);
    expect(d.lastActivity).toBeInstanceOf(Date);
  });
});

describe("suspend / reactivate", () => {
  test("suspended university blocks its members and hides from sign-up", async () => {
    const uni = await makeUniversity("Susp");
    const m = await makeUser(uni.id);
    await platform.platform.suspend({ universityId: uni.id });
    expect(await statusOf(university, uni.id)).toBe("SUSPENDED");
    await expect(callerFor(m.id).notification.unreadCount()).rejects.toThrow(
      /University is suspended/,
    );
    expect(
      (await callerFor(null).auth.universities()).map((u) => u.id),
    ).not.toContain(uni.id);
    await expect(
      platform.platform.suspend({ universityId: uni.id }),
    ).rejects.toThrow(/Only an active/);

    await platform.platform.reactivate({ universityId: uni.id });
    expect(await callerFor(m.id).notification.unreadCount()).toBe(0);
    await expect(
      platform.platform.reactivate({ universityId: uni.id }),
    ).rejects.toThrow(/Only a suspended/);

    expect(await platformActions()).toEqual(
      expect.arrayContaining(["university.suspend", "university.reactivate"]),
    );
    const tenant = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.universityId, uni.id));
    expect(tenant.map((t) => t.action)).toContain("university.suspend");
  });
  test("can't suspend a university a platform admin belongs to", async () => {
    await expect(
      platform.platform.suspend({ universityId: home.id }),
    ).rejects.toThrow(/platform admin/);
    const uni = await makeUniversity("Rowed");
    const rowAdmin = await makeUser(uni.id);
    await adminDb.insert(platformAdmin).values({ userId: rowAdmin.id });
    await expect(
      platform.platform.suspend({ universityId: uni.id }),
    ).rejects.toThrow(/platform admin/);
  });
});

describe("transfer ownership", () => {
  test("target becomes OWNER, old owner ADMIN; inactive targets refused", async () => {
    const uni = await makeUniversity("T");
    const owner = await makeUser(uni.id, { role: "OWNER" });
    const next = await makeUser(uni.id, { role: "STAFF" });
    const pending = await makeUser(uni.id, { status: "PENDING" });
    const outsider = await makeUser(home.id);
    for (const userId of [pending.id, outsider.id])
      await expect(
        platform.platform.transferOwnership({ universityId: uni.id, userId }),
      ).rejects.toThrow(/Pick an active member/);
    await platform.platform.transferOwnership({
      universityId: uni.id,
      userId: next.id,
    });
    expect((await userRow(owner.id)).role).toBe("ADMIN");
    expect((await userRow(next.id)).role).toBe("OWNER");
    await expect(
      platform.platform.transferOwnership({
        universityId: uni.id,
        userId: next.id,
      }),
    ).rejects.toThrow(/Already the owner/);
    const [row] = await adminDb
      .select()
      .from(platformAudit)
      .where(eq(platformAudit.action, "owner.transfer"));
    expect(row).toMatchObject({ actorId: envAdmin.id, target: next.id });
  });
  test("the workspace owner transfer still works through the shared helper", async () => {
    const uni = await makeUniversity("W");
    const owner = await makeUser(uni.id, { role: "OWNER" });
    const next = await makeUser(uni.id, { role: "ADMIN" });
    await callerFor(owner.id).workspace.transferOwnership({ userId: next.id });
    expect((await userRow(owner.id)).role).toBe("ADMIN");
    expect((await userRow(next.id)).role).toBe("OWNER");
  });
});

describe("users + ban", () => {
  test("search across universities; ban/unban; admins can't be banned", async () => {
    const uni = await makeUniversity("U");
    const m = await makeUser(uni.id, { name: "Zed Findme" });
    await makeUser(home.id, { name: "Someone Else" });
    const found = await platform.platform.users({ q: "findme" });
    expect(found.items).toHaveLength(1);
    expect(found.items[0]).toMatchObject({
      id: m.id,
      universityName: "U",
      isPlatformAdmin: false,
    });
    const all = await platform.platform.users({});
    expect(all.items.find((u) => u.id === envAdmin.id)?.isPlatformAdmin).toBe(
      true,
    );

    await adminDb.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: m.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      updatedAt: new Date(),
    });
    await platform.platform.setBanned({ userId: m.id, banned: true });
    expect((await userRow(m.id)).status).toBe("BANNED");
    expect(
      await adminDb.select().from(session).where(eq(session.userId, m.id)),
    ).toHaveLength(0);
    await expect(callerFor(m.id).notification.unreadCount()).rejects.toThrow(
      /banned/,
    );
    await platform.platform.setBanned({ userId: m.id, banned: false });
    expect((await userRow(m.id)).status).toBe("ACTIVE");
    expect(await platformActions()).toEqual(
      expect.arrayContaining(["user.ban", "user.unban"]),
    );

    const rowAdmin = await makeUser(uni.id);
    await adminDb.insert(platformAdmin).values({ userId: rowAdmin.id });
    for (const userId of [envAdmin.id, rowAdmin.id])
      await expect(
        platform.platform.setBanned({ userId, banned: true }),
      ).rejects.toThrow(/can't be banned/);
  });
});

describe("admins", () => {
  test("add by verified email, list env + rows, remove; self/env/last refused", async () => {
    const uni = await makeUniversity("Adm");
    const a = await makeUser(uni.id, { email: "a@adm.edu" });
    await makeUser(uni.id, { email: "unv@adm.edu", emailVerified: false });
    await expect(
      platform.platform.addAdmin({ email: "unv@adm.edu" }),
    ).rejects.toThrow(/No verified account/);
    await expect(
      platform.platform.addAdmin({ email: "platform@test.edu" }),
    ).rejects.toThrow(/Already an admin/);
    await platform.platform.addAdmin({ email: "A@adm.edu" });
    await expect(
      platform.platform.addAdmin({ email: "a@adm.edu" }),
    ).rejects.toThrow(/Already an admin/);

    const list = await platform.platform.admins();
    expect(list).toEqual([
      expect.objectContaining({ email: "platform@test.edu", fromEnv: true }),
      expect.objectContaining({ email: "a@adm.edu", fromEnv: false }),
    ]);

    const asA = callerFor(a.id);
    await expect(asA.platform.removeAdmin({ userId: a.id })).rejects.toThrow(
      /yourself/,
    );
    await expect(
      asA.platform.removeAdmin({ userId: envAdmin.id }),
    ).rejects.toThrow(/NOT_FOUND|\.env/);

    await platform.platform.removeAdmin({ userId: a.id });
    expect(await adminDb.select().from(platformAdmin)).toHaveLength(0);
    expect(await platformActions()).toEqual(
      expect.arrayContaining(["admin.add", "admin.remove"]),
    );
  });
  test("the last remaining admin stays", async () => {
    // Only one admin: a row admin, no verified env account.
    await adminDb.delete(user).where(eq(user.id, envAdmin.id));
    const a = await makeUser((await makeUniversity("Last")).id);
    await adminDb.insert(platformAdmin).values({ userId: a.id });
    // The only admin who could act is the last one, and self-removal is
    // refused, so the "last admin" check can never be reached from outside.
    await expect(
      callerFor(a.id).platform.removeAdmin({ userId: a.id }),
    ).rejects.toThrow(/yourself/);
    expect(await adminDb.select().from(platformAdmin)).toHaveLength(1);
  });
});

describe("broadcast", () => {
  test("one notification per ACTIVE verified member of ACTIVE universities", async () => {
    const live = await makeUniversity("Live");
    const susp = await makeUniversity("Susp");
    await adminDb
      .update(university)
      .set({ status: "SUSPENDED" })
      .where(eq(university.id, susp.id));
    const ok = await makeUser(live.id);
    await makeUser(live.id, { status: "PENDING" });
    await makeUser(live.id, { status: "BANNED" });
    await makeUser(live.id, { emailVerified: false });
    await makeUser(susp.id);
    const r = await platform.platform.broadcast({
      title: "Maintenance tonight",
      body: "Back at 2am.",
    });
    // ok + envAdmin (an ACTIVE member of Home).
    expect(r.recipients).toBe(2);
    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "PLATFORM_ANNOUNCEMENT"));
    expect(rows.map((n) => n.userId).sort()).toEqual(
      [ok.id, envAdmin.id].sort(),
    );
    const list = await callerFor(ok.id).notification.list({});
    expect(list.items[0]).toMatchObject({
      type: "PLATFORM_ANNOUNCEMENT",
      actor: null,
      broadcast: { title: "Maintenance tonight", body: "Back at 2am." },
    });
    expect(await callerFor(ok.id).notification.unreadCount()).toBe(1);

    const past = await platform.platform.broadcasts();
    expect(past[0]).toMatchObject({
      title: "Maintenance tonight",
      recipients: 2,
    });
    const [a] = await adminDb
      .select()
      .from(platformAudit)
      .where(
        and(
          eq(platformAudit.action, "broadcast.send"),
          eq(platformAudit.actorId, envAdmin.id),
        ),
      );
    expect(a.meta).toMatchObject({ recipients: 2 });
  });
});

describe("platform audit", () => {
  test("approve/create are logged; filters by action and date", async () => {
    await platform.platform.createUniversity({
      name: "Made Here",
      ownerEmail: "own@made.edu",
    });
    await platform.platform.broadcast({ title: "Hi there", body: "x" });
    const all = await platform.platform.audit({});
    expect(all.items.map((i) => i.action)).toEqual([
      "broadcast.send",
      "university.create",
    ]);
    expect(all.items[0].actorEmail).toBe("platform@test.edu");
    const one = await platform.platform.audit({ action: "university.create" });
    expect(one.items).toHaveLength(1);
    const future = await platform.platform.audit({
      from: new Date(Date.now() + 86_400_000),
    });
    expect(future.items).toHaveLength(0);
  });
});

describe("fix round 1", () => {
  const owners = (uniId: string) =>
    adminDb
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.universityId, uniId), eq(user.role, "OWNER")));

  test("concurrent transfers (platform+platform, platform+workspace) leave exactly one OWNER", async () => {
    for (let round = 0; round < 3; round++) {
      const uni = await makeUniversity(`Race ${round}`);
      const owner = await makeUser(uni.id, { role: "OWNER" });
      const x = await makeUser(uni.id, { role: "ADMIN" });
      const y = await makeUser(uni.id, { role: "STAFF" });
      await Promise.allSettled([
        platform.platform.transferOwnership({
          universityId: uni.id,
          userId: x.id,
        }),
        platform.platform.transferOwnership({
          universityId: uni.id,
          userId: y.id,
        }),
        callerFor(owner.id).workspace.transferOwnership({ userId: y.id }),
      ]);
      expect(await owners(uni.id)).toHaveLength(1);
    }
  });

  test("tenant OWNER/ADMIN can't ban, suspend or re-role a platform admin", async () => {
    const owner = await makeUser(home.id, { role: "OWNER" });
    const rowAdmin = await makeUser(home.id, { role: "STUDENT" });
    await adminDb.insert(platformAdmin).values({ userId: rowAdmin.id });
    const asOwner = callerFor(owner.id);
    for (const target of [envAdmin.id, rowAdmin.id]) {
      for (const status of ["BANNED", "SUSPENDED"] as const)
        await expect(
          asOwner.moderation.setUserStatus({
            userId: target,
            status,
            days: 3,
          }),
        ).rejects.toThrow(/Platform admins can't be moderated/);
      await expect(
        asOwner.admin.setRole({ userId: target, role: "MODERATOR" }),
      ).rejects.toThrow(/Platform admins can't be moderated/);
    }
    expect((await userRow(rowAdmin.id)).status).toBe("ACTIVE");
    expect((await userRow(envAdmin.id)).role).toBe("STUDENT");
  });

  test("unban restores the status before the ban", async () => {
    const uni = await makeUniversity("Restore");
    const applicant = await makeUser(uni.id, { status: "PENDING" });
    await platform.platform.setBanned({ userId: applicant.id, banned: true });
    expect(await userRow(applicant.id)).toMatchObject({
      status: "BANNED",
      statusBeforeBan: "PENDING",
    });
    await platform.platform.setBanned({ userId: applicant.id, banned: false });
    expect(await userRow(applicant.id)).toMatchObject({
      status: "PENDING",
      statusBeforeBan: null,
    });
  });

  test("a suspended university's member can't be made an admin", async () => {
    const uni = await makeUniversity("Susp2");
    const m = await makeUser(uni.id, { email: "m@susp2.edu" });
    await platform.platform.suspend({ universityId: uni.id });
    await expect(
      platform.platform.addAdmin({ email: "m@susp2.edu" }),
    ).rejects.toThrow(/isn't active/);
    expect(await adminDb.select().from(platformAdmin)).toHaveLength(0);
    expect(m.id).toBeTruthy();
  });

  test("two admins removing each other at once: one admin remains", async () => {
    await adminDb.delete(user).where(eq(user.id, envAdmin.id));
    for (let round = 0; round < 3; round++) {
      await adminDb.delete(platformAdmin);
      const uni = await makeUniversity(`Mutual ${round}`);
      const a = await makeUser(uni.id);
      const b = await makeUser(uni.id);
      await adminDb
        .insert(platformAdmin)
        .values([{ userId: a.id }, { userId: b.id }]);
      const r = await Promise.allSettled([
        callerFor(a.id).platform.removeAdmin({ userId: b.id }),
        callerFor(b.id).platform.removeAdmin({ userId: a.id }),
      ]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await adminDb.select().from(platformAdmin)).toHaveLength(1);
    }
  });
});
