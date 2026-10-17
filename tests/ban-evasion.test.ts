import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
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

const signupInput = (email: string) => ({
  universityId: uniId,
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
