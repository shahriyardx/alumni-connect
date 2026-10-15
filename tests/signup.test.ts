import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { pendingSignup, rosterEntry, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { hashStudentId } from "@/server/student-id";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uni: { id: string; emailDomain: string };
const base = () => ({
  universityId: uni.id,
  email: `alice@${uni.emailDomain}`,
  studentId: "NU-1001",
  batchYear: 2022,
  department: "CSE",
});

beforeEach(async () => {
  await resetDb();
  uni = await makeUniversity("North", "north.edu");
  await adminDb.insert(rosterEntry).values([
    {
      universityId: uni.id,
      studentIdHash: hashStudentId(uni.id, "NU-1001"),
      batchYear: 2022,
      department: "CSE",
      graduated: true,
    },
    {
      universityId: uni.id,
      studentIdHash: hashStudentId(uni.id, "NU-2002"),
      batchYear: 2028,
      department: "EEE",
      graduated: false,
    },
  ]);
});

describe("auth.startSignup", () => {
  test("rejects email outside the university domain", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), email: "alice@gmail.com" }),
    ).rejects.toThrow(/domain/i);
  });
  test("rejects ID not in roster", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), studentId: "NU-9999" }),
    ).rejects.toThrow(/roster/i);
  });
  test("rejects batch year mismatch", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), batchYear: 2023 }),
    ).rejects.toThrow(/batch/i);
  });
  test("matches ID typed with spaces/lowercase; graduated → ALUMNUS", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      studentId: " nu-10 01 ",
    });
    expect(r).toEqual({ role: "ALUMNUS", status: "ACTIVE" });
  });
  test("not graduated → STUDENT", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      email: "bob@north.edu",
      studentId: "NU-2002",
      batchYear: 2028,
      department: "EEE",
    });
    expect(r.role).toBe("STUDENT");
  });
  test("rejects an ID already used by an account", async () => {
    await makeUser(uni.id, { studentIdHash: hashStudentId(uni.id, "NU-1001") });
    await expect(callerFor(null).auth.startSignup(base())).rejects.toThrow(
      /already/i,
    );
  });
  test("university with no roster → PENDING (admin approval)", async () => {
    const open = await makeUniversity("Open", "open.edu");
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      universityId: open.id,
      email: "x@open.edu",
    });
    expect(r.status).toBe("PENDING");
  });
  test("rate limits repeated attempts from one IP", async () => {
    const c = callerFor(null);
    for (let i = 0; i < 10; i++)
      await c.auth
        .startSignup({ ...base(), studentId: `BAD-${i}` })
        .catch(() => {});
    await expect(c.auth.startSignup(base())).rejects.toThrow(/too many/i);
  });
});

describe("better-auth sign-up gate", () => {
  test("sign-up without startSignup is refused", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Eve", email: "eve@north.edu", password: "password123" },
      }),
    ).rejects.toThrow();
  });
  test("sign-up after startSignup creates a tenant-bound unverified user", async () => {
    await callerFor(null).auth.startSignup(base());
    await auth.api.signUpEmail({
      body: {
        name: "Alice",
        email: `alice@${uni.emailDomain}`,
        password: "password123",
      },
    });
    const [u] = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, "alice@north.edu"));
    expect(u.universityId).toBe(uni.id);
    expect(u.role).toBe("ALUMNUS");
    expect(u.emailVerified).toBe(false);
    expect(await adminDb.select().from(pendingSignup)).toEqual([]);
  });
});
