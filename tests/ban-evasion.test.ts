import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLog, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { hashStudentId } from "@/server/student-id";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

// A banned account that never verified its email used to count as a "stale
// squatter": past the 15-minute grace window every sign-up path deleted it
// (clearStaleUnverified) and let the same email / student ID / invite
// register a fresh, unbanned account.

let uniId: string;
const stale = () => new Date(Date.now() - 20 * 60_000);

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
});

const platformBanned = { status: "BANNED", platformBanned: true } as const;

const banned = (email: string, over = {}) =>
  makeUser(uniId, {
    email,
    emailVerified: false,
    createdAt: stale(),
    ...platformBanned,
    ...over,
  });

const stillThere = async (id: string) =>
  (await adminDb.select().from(user).where(eq(user.id, id))).length === 1;

const signupInput = (email: string, universityId = uniId) => ({
  universityId,
  email,
  studentId: "2019-1-60-001",
  batchNumber: 42,
  graduationYear: 2023,
  department: "CSE",
  idCardMime: "image/png" as const,
});

describe("banned unverified accounts can't be swept and re-registered", () => {
  test("startSignup with the banned email", async () => {
    const b = await banned("evader@x.edu", { studentIdHash: "other" });
    await expect(
      callerFor(null).auth.startSignup(signupInput("evader@x.edu")),
    ).rejects.toThrow(/already registered/);
    expect(await stillThere(b.id)).toBe(true);
  });

  test("startSignup with the banned student ID under a new email (tenant ban)", async () => {
    const b = await banned("old@x.edu", {
      studentIdHash: hashStudentId(uniId, "2019-1-60-001"),
      platformBanned: false,
    });
    await expect(
      callerFor(null).auth.startSignup(signupInput("new@x.edu")),
    ).rejects.toThrow(/already registered/);
    expect(await stillThere(b.id)).toBe(true);
  });

  test("registerUniversity with the banned email", async () => {
    const b = await banned("rep@x.edu");
    await expect(
      callerFor(null).auth.registerUniversity({
        universityName: "Evasion U",
        name: "Rep",
        title: "Registrar",
        email: "rep@x.edu",
      }),
    ).rejects.toThrow(/already registered/);
    expect(await stillThere(b.id)).toBe(true);
  });

  test("re-accepting the invite that created the banned account", async () => {
    const admin = await makeUser(uniId, { role: "ADMIN" });
    const r = await callerFor(admin.id).invites.create({
      email: "staff@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = r.inviteUrl.split("/").pop() as string;
    await callerFor(null).invites.accept({ token, name: "Staff" });
    await auth.api.signUpEmail({
      body: { name: "Staff", email: "staff@x.edu", password: "password123" },
    });
    const [u] = await adminDb
      .update(user)
      .set({ ...platformBanned, createdAt: stale() })
      .where(eq(user.email, "staff@x.edu"))
      .returning();

    await expect(callerFor(null).invites.lookup({ token })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      callerFor(null).invites.accept({ token, name: "Staff Again" }),
    ).rejects.toThrow(/NOT_FOUND/);
    expect(await stillThere(u.id)).toBe(true);
  });
});

// Ruling on cross-tenant squatting: a tenant ban of a never-verified account
// only holds inside that tenant. Otherwise any owner could sign up a
// victim's email at their own university, ban it, and lock the victim out
// of the whole platform. A platform ban holds everywhere.
describe("tenant bans of unverified accounts stay inside their tenant", () => {
  const tenantBanned = (email: string, over = {}) =>
    banned(email, { platformBanned: false, ...over });

  test("doesn't block startSignup at another university; the row is cleared and audited at A", async () => {
    const b = await tenantBanned("victim@x.edu", { studentIdHash: "a-id" });
    const otherUni = (await makeUniversity()).id;
    const r = await callerFor(null).auth.startSignup(
      signupInput("victim@x.edu", otherUni),
    );
    expect(r.signupToken).toBeString();
    expect(await stillThere(b.id)).toBe(false);
    const rows = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.target, b.id));
    expect(rows).toMatchObject([
      { universityId: uniId, action: "user.purge", actorId: null },
    ]);
  });

  test("doesn't block registerUniversity", async () => {
    const b = await tenantBanned("rep2@x.edu");
    await callerFor(null).auth.registerUniversity({
      universityName: "Victim U",
      name: "Rep",
      title: "Registrar",
      email: "rep2@x.edu",
    });
    expect(await stillThere(b.id)).toBe(false);
  });

  test("still blocks re-sign-up at the same university by email", async () => {
    const b = await tenantBanned("again@x.edu", { studentIdHash: "a-id" });
    await expect(
      callerFor(null).auth.startSignup(signupInput("again@x.edu")),
    ).rejects.toThrow(/already registered/);
    expect(await stillThere(b.id)).toBe(true);
  });

  test("a platform ban blocks startSignup at another university too", async () => {
    const b = await banned("pb@x.edu", { studentIdHash: "a-id" });
    const otherUni = (await makeUniversity()).id;
    await expect(
      callerFor(null).auth.startSignup(signupInput("pb@x.edu", otherUni)),
    ).rejects.toThrow(/already registered/);
    expect(await stillThere(b.id)).toBe(true);
  });
});

// Follow-up: clearing A's banned row for a sign-up at B must not let the
// same person come straight back to A, and neither side may learn of the
// other (no university id in A's audit, identical errors at B).
describe("tenant ban tombstones and no cross-tenant disclosure", () => {
  const idA = () => hashStudentId(uniId, "2019-1-60-001");

  async function bannedAtAThenJoinedB(email: string) {
    const b = await banned(email, {
      platformBanned: false,
      studentIdHash: idA(),
    });
    const uniB = (await makeUniversity()).id;
    await callerFor(null).auth.startSignup(signupInput(email, uniB));
    expect(await stillThere(b.id)).toBe(false);
    return { b, uniB };
  }

  test("two-step evasion back into A is blocked by email", async () => {
    await bannedAtAThenJoinedB("twostep@x.edu");
    await expect(
      callerFor(null).auth.startSignup({
        ...signupInput("twostep@x.edu"),
        studentId: "2019-9-99-999",
      }),
    ).rejects.toThrow("This student ID or email is already registered");
  });

  test("two-step evasion back into A is blocked by student ID", async () => {
    await bannedAtAThenJoinedB("twostep2@x.edu");
    await expect(
      callerFor(null).auth.startSignup(signupInput("fresh-mail@x.edu")),
    ).rejects.toThrow("This student ID or email is already registered");
  });

  test("two-step evasion back into A through an invite is blocked", async () => {
    await bannedAtAThenJoinedB("twostep3@x.edu");
    const admin = await makeUser(uniId, { role: "ADMIN" });
    const r = await callerFor(admin.id).invites.create({
      email: "twostep3@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = r.inviteUrl.split("/").pop() as string;
    await expect(
      callerFor(null).invites.accept({ token, name: "Back Again" }),
    ).rejects.toThrow("This email is already registered");
  });

  test("A's purge audit row names nothing of B", async () => {
    const { b, uniB } = await bannedAtAThenJoinedB("quiet@x.edu");
    const [row] = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.target, b.id));
    expect(row.universityId).toBe(uniId);
    expect(JSON.stringify(row)).not.toContain(uniB);
    expect(row.meta).not.toHaveProperty("into");
  });

  test("sign-up errors at B are identical with or without a ban at A", async () => {
    const uniB = (await makeUniversity()).id;
    const attempt = async (email: string) => {
      try {
        await callerFor(null).auth.startSignup(signupInput(email, uniB));
        return "ok";
      } catch (e) {
        const err = e as { code: string; message: string };
        return `${err.code}:${err.message}`;
      }
    };
    // Fresh (mid-signup) rows at A: both block B the same way.
    await makeUser(uniId, { email: "fa@x.edu", emailVerified: false });
    await makeUser(uniId, {
      email: "fb@x.edu",
      emailVerified: false,
      status: "BANNED",
    });
    const plain = await attempt("fa@x.edu");
    expect(plain).toBe(
      "CONFLICT:This student ID or email is already registered",
    );
    expect(await attempt("fb@x.edu")).toBe(plain);
    // Stale rows at A: both are swept and B proceeds the same way.
    await makeUser(uniId, {
      email: "sa@x.edu",
      emailVerified: false,
      createdAt: stale(),
    });
    await banned("sb@x.edu", { platformBanned: false });
    expect(await attempt("sa@x.edu")).toBe("ok");
    expect(await attempt("sb@x.edu")).toBe("ok");
  });
});
