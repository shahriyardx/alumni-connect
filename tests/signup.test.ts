import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { batch, pendingSignup, rosterEntry, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { hashStudentId } from "@/server/student-id";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uni: { id: string; emailDomain: string | null };
const base = () => ({
  universityId: uni.id,
  email: `alice@${uni.emailDomain}`,
  studentId: "NU-1001",
  batchNumber: 42,
  graduationYear: 2022,
  department: "CSE",
});

beforeEach(async () => {
  await resetDb();
  uni = await makeUniversity("North", "north.edu");
  const [b42, b48] = await adminDb
    .insert(batch)
    .values([
      { universityId: uni.id, number: 42, graduationYear: 2022 },
      { universityId: uni.id, number: 48, graduationYear: 2028 },
    ])
    .returning();
  await adminDb.insert(rosterEntry).values([
    {
      universityId: uni.id,
      batchId: b42.id,
      studentIdHash: hashStudentId(uni.id, "NU-1001"),
      department: "CSE",
    },
    {
      universityId: uni.id,
      batchId: b48.id,
      studentIdHash: hashStudentId(uni.id, "NU-2002"),
      department: "EEE",
    },
  ]);
});

describe("auth.startSignup", () => {
  test("accepts any email domain", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      email: "alice@gmail.com",
    });
    expect(r.status).toBe("ACTIVE");
  });
  test("rejects ID not in roster", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), studentId: "NU-9999" }),
    ).rejects.toThrow(/roster/i);
  });
  test("rejects batch number mismatch", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), batchNumber: 43 }),
    ).rejects.toThrow(/batch/i);
  });
  test("matches ID typed with spaces/lowercase; past graduation year → ALUMNUS", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      studentId: " nu-10 01 ",
    });
    expect(r).toEqual({ role: "ALUMNUS", status: "ACTIVE" });
  });
  test("future graduation year → STUDENT", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      email: "bob@north.edu",
      studentId: "NU-2002",
      batchNumber: 48,
      graduationYear: 2028,
      department: "EEE",
    });
    expect(r.role).toBe("STUDENT");
  });
  test("accepts a migrated batch number (number = year, e.g. 2018)", async () => {
    const [b] = await adminDb
      .insert(batch)
      .values({ universityId: uni.id, number: 2018, graduationYear: 2018 })
      .returning();
    await adminDb.insert(rosterEntry).values({
      universityId: uni.id,
      batchId: b.id,
      studentIdHash: hashStudentId(uni.id, "NU-3003"),
      department: "CSE",
    });
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      email: "old@north.edu",
      studentId: "NU-3003",
      batchNumber: 2018,
      graduationYear: 2018,
    });
    expect(r).toEqual({ role: "ALUMNUS", status: "ACTIVE" });
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
        .startSignup({
          ...base(),
          studentId: `BAD-${i}`,
          email: `ip-${i}@north.edu`,
        })
        .catch(() => {});
    await expect(c.auth.startSignup(base())).rejects.toThrow(/too many/i);
  });
  test("rate limits repeated attempts for the same email", async () => {
    const c = callerFor(null);
    for (let i = 0; i < 5; i++)
      await c.auth
        .startSignup({ ...base(), studentId: `BAD-${i}` })
        .catch(() => {});
    await expect(c.auth.startSignup(base())).rejects.toThrow(/too many/i);
  });
});

/** Extracts better-auth's structured APIError fields (status/code/message) when `p` rejects. */
async function apiError(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const err = e as {
      status?: string;
      body?: { code?: string };
      message?: string;
    };
    return { status: err.status, code: err.body?.code, message: err.message };
  }
  throw new Error("expected promise to reject");
}

describe("better-auth sign-up gate", () => {
  test("sign-up without startSignup is refused with FAILED_TO_CREATE_USER, no user row created", async () => {
    const err = await apiError(
      auth.api.signUpEmail({
        body: { name: "Eve", email: "eve@north.edu", password: "password123" },
      }),
    );
    expect(err).toEqual({
      status: "BAD_REQUEST",
      code: "FAILED_TO_CREATE_USER",
      message: "Failed to create user",
    });
    expect(
      await adminDb.select().from(user).where(eq(user.email, "eve@north.edu")),
    ).toEqual([]);
  });
  test("sign-up with an expired pending_signup row is refused", async () => {
    await callerFor(null).auth.startSignup(base());
    await adminDb
      .update(pendingSignup)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pendingSignup.email, base().email));
    const err = await apiError(
      auth.api.signUpEmail({
        body: { name: "Alice", email: base().email, password: "password123" },
      }),
    );
    expect(err.code).toBe("FAILED_TO_CREATE_USER");
    expect(
      await adminDb.select().from(user).where(eq(user.email, base().email)),
    ).toEqual([]);
  });
  test("sign-up for a pending_signup row under a different email is refused", async () => {
    await callerFor(null).auth.startSignup(base());
    const err = await apiError(
      auth.api.signUpEmail({
        body: {
          name: "Mallory",
          email: "mallory@north.edu",
          password: "password123",
        },
      }),
    );
    expect(err.code).toBe("FAILED_TO_CREATE_USER");
    expect(
      await adminDb
        .select()
        .from(user)
        .where(eq(user.email, "mallory@north.edu")),
    ).toEqual([]);
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
  test("a fresh unverified squatter still blocks the real owner (CONFLICT), row untouched", async () => {
    // Attacker knows the victim's roster ID and email; starts sign-up and
    // creates the account but never verifies it — this just happened, so
    // it might still be the victim's own in-progress verification.
    await callerFor(null).auth.startSignup(base());
    await auth.api.signUpEmail({
      body: { name: "Attacker", email: base().email, password: "password123" },
    });
    const squatter = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, base().email));
    expect(squatter).toHaveLength(1);
    expect(squatter[0].emailVerified).toBe(false);

    await expect(callerFor(null).auth.startSignup(base())).rejects.toThrow(
      /already/i,
    );
    expect(
      await adminDb.select().from(user).where(eq(user.email, base().email)),
    ).toHaveLength(1);
  });
  test("a stale (>15min) unverified squatter does not block the real owner, and is swept away", async () => {
    await callerFor(null).auth.startSignup(base());
    await auth.api.signUpEmail({
      body: { name: "Attacker", email: base().email, password: "password123" },
    });
    await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
      .where(eq(user.email, base().email));

    // The real owner starts sign-up with the same ID/email: not CONFLICT.
    const r = await callerFor(null).auth.startSignup(base());
    expect(r).toEqual({ role: "ALUMNUS", status: "ACTIVE" });
    expect(
      await adminDb.select().from(user).where(eq(user.email, base().email)),
    ).toEqual([]);
  });
});
