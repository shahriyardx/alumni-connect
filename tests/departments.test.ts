import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  invite,
  pendingSignup,
  rosterEntry,
  university,
  user,
} from "@/db/schema";
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
let staff: { id: string };
let student: { id: string };

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  // Department distinct from the ones each test adds, so the shared fixtures
  // never pollute a count/list assertion below.
  owner = await makeUser(uniId, { role: "OWNER", department: "Admin" });
  admin = await makeUser(uniId, { role: "ADMIN", department: "Admin" });
  mod = await makeUser(uniId, { role: "MODERATOR", department: "Admin" });
  staff = await makeUser(uniId, { role: "STAFF", department: "Admin" });
  student = await makeUser(uniId, { department: "Admin" });
});

describe("departments CRUD", () => {
  test("add/rename/remove by admin; STAFF/MODERATOR/STUDENT forbidden", async () => {
    const a = callerFor(admin.id);
    for (const id of [mod.id, staff.id, student.id]) {
      await expect(
        callerFor(id).departments.add({ name: "CSE" }),
      ).rejects.toThrow(/FORBIDDEN/);
    }
    const { id } = await a.departments.add({ name: "CSE" });
    expect(await a.departments.list()).toEqual(["CSE"]);

    for (const id2 of [mod.id, staff.id, student.id]) {
      await expect(
        callerFor(id2).departments.rename({ id, name: "EEE" }),
      ).rejects.toThrow(/FORBIDDEN/);
      await expect(callerFor(id2).departments.remove({ id })).rejects.toThrow(
        /FORBIDDEN/,
      );
    }
    await a.departments.rename({ id, name: "EEE" });
    expect(await a.departments.list()).toEqual(["EEE"]);

    await a.departments.remove({ id });
    expect(await a.departments.list()).toEqual([]);
    await expect(a.departments.remove({ id })).rejects.toThrow(/NOT_FOUND/);
  });

  test("owner can also manage departments", async () => {
    const o = callerFor(owner.id);
    const { id } = await o.departments.add({ name: "BBA" });
    await o.departments.rename({ id, name: "Business" });
    await o.departments.remove({ id });
    expect(await o.departments.list()).toEqual([]);
  });

  test("duplicate name is rejected case-insensitively", async () => {
    const a = callerFor(admin.id);
    await a.departments.add({ name: "CSE" });
    await expect(a.departments.add({ name: "cse" })).rejects.toThrow(
      /already exists/,
    );
    const { id: eee } = await a.departments.add({ name: "EEE" });
    await expect(
      a.departments.rename({ id: eee, name: "Cse" }),
    ).rejects.toThrow(/already exists/);
  });

  test("remove only drops the picklist entry; members keep their text", async () => {
    const a = callerFor(admin.id);
    const { id } = await a.departments.add({ name: "CSE" });
    const u = await makeUser(uniId, { department: "CSE" });
    await a.departments.remove({ id });
    const row = (await adminDb.select().from(user).where(eq(user.id, u.id)))[0];
    expect(row.department).toBe("CSE");
  });
});

describe("departments.withCounts", () => {
  test("splits members by role group, case-insensitive match, excludes PENDING", async () => {
    const a = callerFor(admin.id);
    await a.departments.add({ name: "CSE" });
    await a.departments.add({ name: "EEE" });
    await makeUser(uniId, { department: "cse", role: "STUDENT" });
    await makeUser(uniId, {
      department: "CSE",
      role: "ALUMNUS",
      graduationYear: 2000,
    });
    await makeUser(uniId, { department: "CSE", role: "STAFF" });
    await makeUser(uniId, { department: "CSE", status: "PENDING" });
    await makeUser(uniId, { department: "Unlisted", role: "STUDENT" });

    const rows = await a.departments.withCounts();
    expect(rows.find((r) => r.name === "CSE")).toMatchObject({
      students: 1,
      alumni: 1,
      faculty: 1,
    });
    expect(rows.find((r) => r.name === "EEE")).toMatchObject({
      students: 0,
      alumni: 0,
      faculty: 0,
    });
  });

  test("STAFF/MODERATOR/STUDENT can't read counts", async () => {
    for (const id of [mod.id, staff.id, student.id])
      await expect(callerFor(id).departments.withCounts()).rejects.toThrow(
        /FORBIDDEN/,
      );
  });
});

describe("public auth.departments", () => {
  test("ACTIVE university's names, sorted; others return []", async () => {
    const a = callerFor(admin.id);
    await a.departments.add({ name: "EEE" });
    await a.departments.add({ name: "CSE" });
    expect(
      await callerFor(null).auth.departments({ universityId: uniId }),
    ).toEqual(["CSE", "EEE"]);

    const pending = await makeUniversity("Pending U");
    await adminDb
      .update(university)
      .set({ status: "PENDING" })
      .where(eq(university.id, pending.id));
    expect(
      await callerFor(null).auth.departments({ universityId: pending.id }),
    ).toEqual([]);
  });
});

describe("department validation when the list is non-empty", () => {
  const signupBase = () => ({
    universityId: uniId,
    email: "newbie@north.edu",
    studentId: "NU-9001",
    batchNumber: 1,
    graduationYear: new Date().getFullYear() + 2,
    department: "CSE",
    idCardMime: "image/png" as const,
  });

  test("startSignup: free text ok with 0 departments; rejected once the list is non-empty; canonical spelling stored", async () => {
    // Empty list: anything goes.
    await callerFor(null).auth.startSignup({
      ...signupBase(),
      department: "Whatever Dept",
    });
    const freeRow = (
      await adminDb
        .select()
        .from(pendingSignup)
        .where(eq(pendingSignup.email, signupBase().email))
    )[0];
    expect(freeRow.department).toBe("Whatever Dept");

    const a = callerFor(admin.id);
    await a.departments.add({ name: "CSE" });

    await expect(
      callerFor(null).auth.startSignup({
        ...signupBase(),
        email: "bad@north.edu",
        studentId: "NU-9002",
        department: "Not Listed",
      }),
    ).rejects.toThrow(/Pick a department/);

    await callerFor(null).auth.startSignup({
      ...signupBase(),
      email: "good@north.edu",
      studentId: "NU-9003",
      department: "cse",
    });
    const row = (
      await adminDb
        .select()
        .from(pendingSignup)
        .where(eq(pendingSignup.email, "good@north.edu"))
    )[0];
    expect(row.department).toBe("CSE"); // canonical spelling, not "cse"
  });

  test("invites.create rejects an unlisted department once the list is non-empty", async () => {
    const a = callerFor(admin.id);
    await expect(
      a.invites.create({
        email: "x@x.edu",
        role: "STAFF",
        department: "Anything",
      }),
    ).resolves.toBeTruthy(); // still free text, list empty

    await a.departments.add({ name: "CSE" });
    await expect(
      a.invites.create({
        email: "y@x.edu",
        role: "STAFF",
        department: "Nope",
      }),
    ).rejects.toThrow(/Pick a department/);
    await a.invites.create({
      email: "z@x.edu",
      role: "STAFF",
      department: "cse",
    });
    const inv = (
      await adminDb.select().from(invite).where(eq(invite.email, "z@x.edu"))
    )[0];
    expect(inv.department).toBe("CSE");
  });

  test("profile.update rejects an unlisted department once the list is non-empty", async () => {
    const u = callerFor(student.id);
    await u.profile.update({
      name: "Stu Dent",
      bio: "",
      department: "Free Text",
    });

    const a = callerFor(admin.id);
    await a.departments.add({ name: "CSE" });
    await expect(
      u.profile.update({ name: "Stu Dent", bio: "", department: "Nope" }),
    ).rejects.toThrow(/Pick a department/);
    await u.profile.update({ name: "Stu Dent", bio: "", department: "cse" });
    const row = (
      await adminDb.select().from(user).where(eq(user.id, student.id))
    )[0];
    expect(row.department).toBe("CSE");
  });
});

describe("members list department filter", () => {
  test("admin.users filters by department, case-insensitive, tenant-scoped", async () => {
    const cse = await makeUser(uniId, { department: "CSE", name: "In CSE" });
    await makeUser(uniId, { department: "EEE", name: "In EEE" });
    const a = callerFor(admin.id);
    const ids = (await a.admin.users({ department: "cse" })).items.map(
      (u) => u.id,
    );
    expect(ids).toEqual([cse.id]);
    expect((await a.admin.users({})).items.length).toBeGreaterThanOrEqual(2);
  });
});

// Keep the roster-import shape test honest: it still imports arbitrary
// per-student department text regardless of the picklist.
describe("roster import is unaffected by the picklist", () => {
  test("importRoster still accepts free text", async () => {
    const a = callerFor(admin.id);
    await a.departments.add({ name: "CSE" });
    const { id: batchId } = await a.workspace.saveBatch({
      number: 1,
      graduationYear: 2020,
    });
    const res = await a.admin.importRoster({
      batchId,
      csv: "student_id,department\nNU-1,NotListedDept",
    });
    expect(res.errors).toEqual([]);
    const [row] = await adminDb
      .select()
      .from(rosterEntry)
      .where(eq(rosterEntry.batchId, batchId));
    expect(row.department).toBe("NotListedDept");
  });
});
