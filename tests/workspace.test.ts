import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { rosterEntry, university, user } from "@/db/schema";
import { env } from "@/env";
import { minio, stat } from "@/server/storage";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uniId: string;
let owner: { id: string };
let admin: { id: string };
let mod: { id: string };
let student: { id: string };
const thisYear = new Date().getFullYear();

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  owner = await makeUser(uniId, { role: "OWNER" });
  admin = await makeUser(uniId, { role: "ADMIN" });
  mod = await makeUser(uniId, { role: "MODERATOR" });
  student = await makeUser(uniId);
});

const row = async (id: string) =>
  (await adminDb.select().from(user).where(eq(user.id, id)))[0];

async function putCard() {
  const key = `${uniId}/idcard/f/${randomUUID()}.png`;
  await minio.putObject(env.S3_BUCKET, key, Buffer.from([137, 80, 78, 71]));
  return key;
}

describe("approvals", () => {
  test("list → approve → reject (card deleted)", async () => {
    const a = callerFor(admin.id);
    const card1 = await putCard();
    const card2 = await putCard();
    const p1 = await makeUser(uniId, {
      status: "PENDING",
      idCardKey: card1,
      studentIdHint: "1234",
      rosterMatch: true,
    });
    const p2 = await makeUser(uniId, { status: "PENDING", idCardKey: card2 });
    await makeUser(uniId, { status: "PENDING", emailVerified: false });

    const list = await a.workspace.approvals();
    expect(list.map((u) => u.id)).toEqual([p1.id, p2.id]);
    expect(list[0]).toMatchObject({
      studentIdHint: "1234",
      rosterMatch: true,
      hasIdCard: true,
    });

    await a.workspace.decide({ userId: p1.id, action: "approve" });
    const approved = await row(p1.id);
    expect(approved.status).toBe("ACTIVE");
    expect(approved.decidedAt).not.toBeNull();
    expect(approved.idCardKey).toBe(card1); // kept until the 30-day purge

    await a.workspace.decide({ userId: p2.id, action: "reject" });
    expect(await row(p2.id)).toBeUndefined();
    expect(await stat(card2)).toBeNull();

    await expect(
      a.workspace.decide({ userId: p1.id, action: "reject" }),
    ).rejects.toThrow(/No pending account/);
    await expect(
      a.workspace.decide({ userId: student.id, action: "approve" }),
    ).rejects.toThrow(/No pending account/);
    const actions = (await a.admin.audit({})).items.map((i) => i.action);
    expect(actions).toEqual(
      expect.arrayContaining(["user.approve", "user.reject"]),
    );
  });

  test("approvals purges ID cards decided over 30 days ago", async () => {
    const oldCard = await putCard();
    const freshCard = await putCard();
    const old = await makeUser(uniId, {
      idCardKey: oldCard,
      decidedAt: new Date(Date.now() - 31 * 86_400_000),
    });
    const fresh = await makeUser(uniId, {
      idCardKey: freshCard,
      decidedAt: new Date(Date.now() - 29 * 86_400_000),
    });
    await callerFor(admin.id).workspace.approvals();
    expect((await row(old.id)).idCardKey).toBeNull();
    expect(await stat(oldCard)).toBeNull();
    expect((await row(fresh.id)).idCardKey).toBe(freshCard);
    expect(await stat(freshCard)).not.toBeNull();
  });

  test("moderators and members can't reach admin procedures", async () => {
    for (const id of [mod.id, student.id]) {
      const c = callerFor(id);
      await expect(c.workspace.approvals()).rejects.toThrow(/FORBIDDEN/);
      await expect(c.workspace.batches()).rejects.toThrow(/FORBIDDEN/);
      await expect(
        c.workspace.decide({ userId: student.id, action: "approve" }),
      ).rejects.toThrow(/FORBIDDEN/);
      await expect(
        c.workspace.saveBatch({ number: 1, graduationYear: 2020 }),
      ).rejects.toThrow(/FORBIDDEN/);
    }
    expect(await callerFor(mod.id).workspace.counts()).toEqual({
      approvals: 0,
      reports: 0,
    });
    await expect(callerFor(student.id).workspace.counts()).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});

describe("batches", () => {
  test("CRUD, unique number, promotion recompute", async () => {
    const a = callerFor(admin.id);
    const { id } = await a.workspace.saveBatch({
      number: 42,
      graduationYear: thisYear + 1,
    });
    await expect(
      a.workspace.saveBatch({ number: 42, graduationYear: 2000 }),
    ).rejects.toThrow(/already exists/);
    const s = await makeUser(uniId, {
      batchNumber: 42,
      graduationYear: thisYear + 1,
    });
    const staff = await makeUser(uniId, { role: "STAFF", batchNumber: 42 });
    expect(await a.workspace.batches()).toEqual([
      {
        id,
        number: 42,
        graduationYear: thisYear + 1,
        rosterCount: 0,
        members: 6, // makeUser defaults everyone to batch 42
      },
    ]);

    await a.workspace.saveBatch({
      id,
      number: 42,
      graduationYear: thisYear - 1,
    });
    expect(await row(s.id)).toMatchObject({
      role: "ALUMNUS",
      graduationYear: thisYear - 1,
    });
    expect((await row(staff.id)).role).toBe("STAFF");
    await a.workspace.saveBatch({ id, number: 42, graduationYear: thisYear });
    expect((await row(s.id)).role).toBe("STUDENT");

    await expect(a.workspace.deleteBatch({ id })).rejects.toThrow(
      /has members/,
    );
    const { id: empty } = await a.workspace.saveBatch({
      number: 7,
      graduationYear: 2020,
    });
    await a.admin.importRoster({
      batchId: empty,
      csv: "student_id,department\nNU-1,CSE",
    });
    await a.workspace.deleteBatch({ id: empty });
    expect(await adminDb.select().from(rosterEntry)).toEqual([]);
  });

  test("importRoster per batch; an ID moves between batches", async () => {
    const a = callerFor(admin.id);
    const { id: b1 } = await a.workspace.saveBatch({
      number: 1,
      graduationYear: 2020,
    });
    const { id: b2 } = await a.workspace.saveBatch({
      number: 2,
      graduationYear: 2021,
    });
    expect(
      await a.admin.importRoster({
        batchId: b1,
        csv: "student_id,department,name\nNU-1,CSE,Rahim\nNU-2,EEE,",
      }),
    ).toEqual({ inserted: 2, updated: 0, errors: [] });
    expect(
      await a.admin.importRoster({
        batchId: b2,
        csv: "student_id,department\nnu-1,CSE",
      }),
    ).toEqual({ inserted: 0, updated: 1, errors: [] });
    const counts = Object.fromEntries(
      (await a.workspace.batches()).map((b) => [b.number, b.rosterCount]),
    );
    expect(counts).toEqual({ 1: 1, 2: 1 });
    await expect(
      a.admin.importRoster({ batchId: randomUUID(), csv: "x" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("owner protections", () => {
  test("admin can't suspend/ban/demote the owner or change another admin", async () => {
    const a = callerFor(admin.id);
    const admin2 = await makeUser(uniId, { role: "ADMIN" });
    await expect(
      a.moderation.setUserStatus({ userId: owner.id, status: "BANNED" }),
    ).rejects.toThrow(/owner/i);
    await expect(
      a.admin.setRole({ userId: owner.id, role: "ADMIN" }),
    ).rejects.toThrow(/owner's role/);
    await expect(
      a.admin.setRole({ userId: admin2.id, role: "STUDENT" }),
    ).rejects.toThrow(/Only the owner/);
    await expect(
      a.admin.setRole({ userId: student.id, role: "ADMIN" }),
    ).rejects.toThrow(/Only the owner/);
    await expect(
      a.moderation.setUserStatus({
        userId: admin2.id,
        status: "SUSPENDED",
        days: 1,
      }),
    ).rejects.toThrow(/Only the owner/);
    await expect(
      callerFor(owner.id).admin.setRole({ userId: owner.id, role: "ADMIN" }),
    ).rejects.toThrow(/BAD_REQUEST/);

    const o = callerFor(owner.id);
    await o.admin.setRole({ userId: student.id, role: "ADMIN" });
    await o.admin.setRole({ userId: admin2.id, role: "MODERATOR" });
    await o.moderation.setUserStatus({
      userId: admin.id,
      status: "SUSPENDED",
      days: 1,
    });
    expect((await row(student.id)).role).toBe("ADMIN");
    expect((await row(admin2.id)).role).toBe("MODERATOR");
    expect((await row(admin.id)).status).toBe("SUSPENDED");
  });

  test("transfer ownership", async () => {
    const o = callerFor(owner.id);
    await expect(
      callerFor(admin.id).workspace.transferOwnership({ userId: admin.id }),
    ).rejects.toThrow(/FORBIDDEN/);
    const pending = await makeUser(uniId, { status: "PENDING" });
    await expect(
      o.workspace.transferOwnership({ userId: pending.id }),
    ).rejects.toThrow(/active member/);
    await expect(
      o.workspace.transferOwnership({ userId: owner.id }),
    ).rejects.toThrow(/BAD_REQUEST/);
    await o.workspace.transferOwnership({ userId: student.id });
    expect((await row(student.id)).role).toBe("OWNER");
    expect((await row(owner.id)).role).toBe("ADMIN");
    const audit = await callerFor(student.id).admin.audit({});
    expect(audit.items[0]).toMatchObject({
      action: "owner.transfer",
      target: student.id,
    });
  });
});

describe("settings", () => {
  test("owner updates name, website, logo; others can't", async () => {
    await expect(callerFor(admin.id).workspace.settings()).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(
      callerFor(admin.id).files.createUpload({
        kind: "logo",
        mime: "image/png",
        size: 4,
      }),
    ).rejects.toThrow(/FORBIDDEN/);

    const o = callerFor(owner.id);
    const { key, url } = await o.files.createUpload({
      kind: "logo",
      mime: "image/png",
      size: 4,
    });
    expect(key.startsWith(`${uniId}/logo/`)).toBe(true);
    await fetch(url, {
      method: "PUT",
      body: new Uint8Array([137, 80, 78, 71]),
      headers: { "Content-Type": "image/png" },
    });
    await expect(callerFor(admin.id).files.confirm({ key })).rejects.toThrow(
      /FORBIDDEN/,
    );
    const att = await o.files.confirm({ key });
    expect(att.key.startsWith(`${uniId}/logo/f/`)).toBe(true);

    await expect(
      o.workspace.updateSettings({
        name: "New Name",
        logoKey: `${uniId}/logo/f/${randomUUID()}.png`,
      }),
    ).rejects.toThrow(/Upload not found/);
    await o.workspace.updateSettings({
      name: "New Name",
      website: "https://new.edu",
      logoKey: att.key,
    });
    expect(await o.workspace.settings()).toMatchObject({
      name: "New Name",
      website: "https://new.edu",
      logoKey: att.key,
    });
    expect((await callerFor(student.id).auth.me())?.universityLogoKey).toBe(
      att.key,
    );
    await o.workspace.updateSettings({ name: "New Name", logoKey: null });
    const [u] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, uniId));
    expect(u.logoKey).toBeNull();
  });
});
