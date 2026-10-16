import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLog, invite, university, user } from "@/db/schema";
import { auth } from "@/server/auth";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let home: { id: string };
let platform: ReturnType<typeof callerFor>;

const apply = (over: Partial<{ email: string; universityName: string }> = {}) =>
  callerFor(null).auth.registerUniversity({
    universityName: "Eastern Tech",
    website: "https://eti.edu",
    name: "Rep Person",
    title: "Registrar",
    email: "rep@eti.edu",
    ...over,
  });

async function applyAndSignUp() {
  const { universityId } = await apply();
  await auth.api.signUpEmail({
    body: { name: "Rep Person", email: "rep@eti.edu", password: "password123" },
  });
  // Stand-in for the OTP step.
  await adminDb
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, "rep@eti.edu"));
  return universityId;
}
const userByEmail = (email: string) =>
  adminDb
    .select()
    .from(user)
    .where(eq(user.email, email))
    .then((r) => r[0]);

beforeEach(async () => {
  await resetDb();
  home = await makeUniversity("Home");
  // .env.test: PLATFORM_ADMIN_EMAILS=platform@test.edu
  platform = callerFor(
    (await makeUser(home.id, { email: "platform@test.edu", role: "STUDENT" }))
      .id,
  );
});

describe("platform gate", () => {
  test("non-platform users are FORBIDDEN on every procedure, even ADMIN/OWNER", async () => {
    const uniId = await applyAndSignUp();
    for (const role of ["OWNER", "ADMIN", "STUDENT"] as const) {
      const as = callerFor((await makeUser(home.id, { role })).id);
      await expect(as.platform.universities({})).rejects.toThrow(/FORBIDDEN/);
      await expect(
        as.platform.approve({ universityId: uniId }),
      ).rejects.toThrow(/FORBIDDEN/);
      await expect(as.platform.reject({ universityId: uniId })).rejects.toThrow(
        /FORBIDDEN/,
      );
      await expect(
        as.platform.createUniversity({ name: "X Uni", ownerEmail: "x@x.edu" }),
      ).rejects.toThrow(/FORBIDDEN/);
    }
    await expect(callerFor(null).platform.universities({})).rejects.toThrow(
      /UNAUTHORIZED/,
    );
  });
  test("listed but unverified email → FORBIDDEN", async () => {
    await adminDb
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.email, "platform@test.edu"));
    await expect(platform.platform.universities({})).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
  test("auth.me flags platform admins", async () => {
    expect((await platform.auth.me())?.isPlatformAdmin).toBe(true);
    const other = callerFor((await makeUser(home.id, { role: "OWNER" })).id);
    expect((await other.auth.me())?.isPlatformAdmin).toBe(false);
  });
});

describe("applications", () => {
  test("apply → PENDING university + PENDING owner; hidden from auth.universities", async () => {
    const uniId = await applyAndSignUp();
    const owner = await userByEmail("rep@eti.edu");
    expect(owner).toMatchObject({
      universityId: uniId,
      role: "OWNER",
      status: "PENDING",
      title: "Registrar",
      department: "Administration",
    });
    const list = await callerFor(null).auth.universities();
    expect(list.map((u) => u.id)).not.toContain(uniId);
    const pending = await platform.platform.universities({ status: "PENDING" });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: uniId,
      website: "https://eti.edu",
      members: 1,
      owner: { name: "Rep Person", email: "rep@eti.edu" },
    });
  });
  test("approve → university and owner ACTIVE, audited in tenant", async () => {
    const uniId = await applyAndSignUp();
    await platform.platform.approve({ universityId: uniId });
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, uniId));
    expect(uni.status).toBe("ACTIVE");
    expect((await userByEmail("rep@eti.edu")).status).toBe("ACTIVE");
    const logs = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.universityId, uniId));
    expect(logs.map((l) => l.action)).toContain("university.approve");
    expect(
      (await callerFor(null).auth.universities()).map((u) => u.id),
    ).toContain(uniId);
    await expect(
      platform.platform.reject({ universityId: uniId }),
    ).rejects.toThrow(/decided/);
  });
  test("reject → REJECTED and the pending owner is deleted", async () => {
    const uniId = await applyAndSignUp();
    await platform.platform.reject({ universityId: uniId });
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, uniId));
    expect(uni.status).toBe("REJECTED");
    expect(await userByEmail("rep@eti.edu")).toBeUndefined();
    // They can re-apply.
    await apply();
  });
  test("students can't startSignup into PENDING/REJECTED universities", async () => {
    const pendingId = (await apply()).universityId;
    const rejectedId = (
      await apply({ email: "b@b.edu", universityName: "Bravo" })
    ).universityId;
    await platform.platform.reject({ universityId: rejectedId });
    for (const universityId of [pendingId, rejectedId]) {
      await expect(
        callerFor(null).auth.startSignup({
          universityId,
          email: "s@s.edu",
          studentId: "S-1",
          batchNumber: 1,
          graduationYear: 2030,
          department: "CSE",
        }),
      ).rejects.toThrow(/NOT_FOUND|not found/);
    }
  });
  test("verified email blocks a new application; per-email rate limit", async () => {
    await makeUser(home.id, { email: "taken@x.edu" });
    await expect(apply({ email: "taken@x.edu" })).rejects.toThrow(
      /already registered/,
    );
    for (let i = 0; i < 3; i++) await apply({ email: "r@r.edu" });
    await expect(apply({ email: "r@r.edu" })).rejects.toThrow(/Too many/);
  });
  test("re-applying replaces the earlier unfinished application", async () => {
    const first = (await apply()).universityId;
    const second = (await apply({ universityName: "Eastern Tech 2" }))
      .universityId;
    expect(second).toBe(first);
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, first));
    expect(uni.name).toBe("Eastern Tech 2");
  });
});

describe("platform.createUniversity", () => {
  test("creates ACTIVE university + OWNER invite and returns its URL", async () => {
    const r = await platform.platform.createUniversity({
      name: "Home",
      website: "",
      ownerEmail: "Boss@New.edu",
    });
    expect(r.inviteUrl).toMatch(/\/invite\/[\w-]{20,}$/);
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, r.universityId));
    expect(uni.status).toBe("ACTIVE");
    expect(uni.slug).not.toBe("home"); // taken by the seed uni → suffixed
    const [inv] = await adminDb
      .select()
      .from(invite)
      .where(eq(invite.universityId, uni.id));
    expect(inv).toMatchObject({
      email: "boss@new.edu",
      role: "OWNER",
      acceptedAt: null,
    });
    expect(inv.tokenHash).not.toContain(r.inviteUrl.split("/").pop() ?? "");
    await expect(
      platform.platform.createUniversity({
        name: "Yale",
        ownerEmail: "platform@test.edu",
      }),
    ).rejects.toThrow(/already has an account/);
  });
});
