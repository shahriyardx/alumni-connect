import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLog, invite, pendingSignup, university, user } from "@/db/schema";
import { auth } from "@/server/auth";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  postUpload,
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

const signUp = (email = "rep@eti.edu") =>
  auth.api.signUpEmail({
    body: { name: "Rep Person", email, password: "password123" },
  });
async function applyAndSignUp() {
  await apply();
  await signUp();
  // Stand-in for the OTP step.
  const [u] = await adminDb
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, "rep@eti.edu"))
    .returning();
  return u.universityId;
}
const pendingRow = (email: string) =>
  adminDb
    .select()
    .from(pendingSignup)
    .where(eq(pendingSignup.email, email))
    .then((r) => r[0]);
async function pendingUni(name: string) {
  const u = await makeUniversity(name);
  await adminDb
    .update(university)
    .set({ status: "PENDING" })
    .where(eq(university.id, u.id));
  return u.id;
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
  test("apply → PENDING university + ACTIVE owner; hidden from auth.universities", async () => {
    const uniId = await applyAndSignUp();
    const owner = await userByEmail("rep@eti.edu");
    expect(owner).toMatchObject({
      universityId: uniId,
      role: "OWNER",
      status: "ACTIVE",
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
  test("owner of a PENDING university can use member/admin procedures once verified", async () => {
    await applyAndSignUp();
    const owner = await userByEmail("rep@eti.edu");
    const as = callerFor(owner.id);
    expect(await as.notification.unreadCount()).toBe(0);
    expect(await as.workspace.batches()).toEqual([]);
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
  test("reject → REJECTED; the owner keeps their account but is FORBIDDEN", async () => {
    const uniId = await applyAndSignUp();
    await platform.platform.reject({ universityId: uniId });
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, uniId));
    expect(uni.status).toBe("REJECTED");
    const owner = await userByEmail("rep@eti.edu");
    expect(owner).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    const as = callerFor(owner.id);
    await expect(as.notification.unreadCount()).rejects.toThrow(
      /University application was rejected/,
    );
  });
  test("students can't startSignup into PENDING/REJECTED universities", async () => {
    const pendingId = await pendingUni("Pend");
    const rejectedId = await pendingUni("Rej");
    await platform.platform.reject({ universityId: rejectedId });
    for (const universityId of [pendingId, rejectedId]) {
      await expect(
        callerFor(null).auth.startSignup({
          universityId,
          email: "s@s.edu",
          studentId: "S-1",
          batchNumber: 1,
          graduationYear: 2030,
          idCardMime: "image/png",
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
  test("an application abandoned before sign-up creates no university", async () => {
    await apply();
    await apply({ universityName: "Eastern Tech 2" });
    expect(await adminDb.select().from(university)).toHaveLength(1); // just Home
    expect((await pendingRow("rep@eti.edu")).applicationName).toBe(
      "Eastern Tech 2",
    );
  });
  test("sign-up creates the PENDING university, audited with the application", async () => {
    const uniId = await applyAndSignUp();
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, uniId));
    expect(uni).toMatchObject({
      name: "Eastern Tech",
      slug: "eastern-tech",
      status: "PENDING",
      website: "https://eti.edu",
    });
    const logs = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.universityId, uniId));
    expect(logs.map((l) => l.action)).toEqual(["university.apply"]);
  });
  test("a stale unverified rep re-applying abandons the old application", async () => {
    await apply();
    await signUp();
    const [stale] = await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(user.email, "rep@eti.edu"))
      .returning();
    await apply();
    const [old] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, stale.universityId));
    expect(old.status).toBe("REJECTED");
    expect(await userByEmail("rep@eti.edu")).toBeUndefined();
  });
  test("student row overwritten by an application keeps no student fields", async () => {
    await callerFor(null).auth.startSignup({
      universityId: home.id,
      email: "rep@eti.edu",
      studentId: "S-1",
      batchNumber: 4,
      graduationYear: 2030,
      idCardMime: "image/png",
      department: "CSE",
    });
    await apply();
    expect(await pendingRow("rep@eti.edu")).toMatchObject({
      universityId: null,
      studentIdHash: null,
      batchNumber: null,
      graduationYear: null,
      signupTokenHash: null,
      idCardKey: null,
      rosterMatch: null,
      studentIdHint: null,
      role: "OWNER",
      applicationName: "Eastern Tech",
    });
  });
  test("application overwritten by a student sign-up keeps no application fields", async () => {
    await apply();
    const r = await callerFor(null).auth.startSignup({
      universityId: home.id,
      email: "rep@eti.edu",
      studentId: "S-1",
      batchNumber: 4,
      graduationYear: 2030,
      idCardMime: "image/png",
      department: "CSE",
    });
    await postUpload(r.upload);
    await callerFor(null).auth.confirmIdCard({
      email: "rep@eti.edu",
      signupToken: r.signupToken,
      key: r.upload.key,
    });
    expect(await pendingRow("rep@eti.edu")).toMatchObject({
      universityId: home.id,
      title: null,
      applicationName: null,
      applicationWebsite: null,
      role: "STUDENT",
    });
    await signUp();
    expect(await userByEmail("rep@eti.edu")).toMatchObject({
      universityId: home.id,
      role: "STUDENT",
      title: null,
    });
  });
  test("an OWNER pending row without an application never grants ownership", async () => {
    await adminDb.insert(pendingSignup).values({
      email: "sneaky@x.edu",
      universityId: home.id,
      department: "Admin",
      role: "OWNER",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(signUp("sneaky@x.edu")).rejects.toThrow();
    expect(await userByEmail("sneaky@x.edu")).toBeUndefined();
  });
  test("unverified owner: listed as unverified, approve refused", async () => {
    await apply();
    await signUp();
    const [{ universityId }] = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, "rep@eti.edu"));
    const [row] = await platform.platform.universities({ status: "PENDING" });
    expect(row.owner).toEqual({
      name: "Rep Person",
      email: "rep@eti.edu",
      verified: false,
    });
    await expect(platform.platform.approve({ universityId })).rejects.toThrow(
      /hasn't verified/,
    );
    // The account is ACTIVE already (set on sign-up); the unverified email
    // keeps memberProcedure out, not the account status.
    expect((await userByEmail("rep@eti.edu")).status).toBe("ACTIVE");
  });
  test("startSignup's stale cleanup rejects the abandoned application it orphans", async () => {
    await apply();
    await signUp();
    const [stale] = await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(user.email, "rep@eti.edu"))
      .returning();
    await callerFor(null).auth.startSignup({
      universityId: home.id,
      email: "rep@eti.edu",
      studentId: "S-9",
      batchNumber: 4,
      graduationYear: 2030,
      idCardMime: "image/png",
      department: "CSE",
    });
    expect(await userByEmail("rep@eti.edu")).toBeUndefined();
    const [old] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, stale.universityId));
    expect(old.status).toBe("REJECTED");
    const [log] = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "university.reject"));
    expect(log).toMatchObject({
      universityId: old.id,
      meta: { reason: "abandoned" },
    });
  });
  test("approve refuses an application with no owner", async () => {
    const id = await pendingUni("Ownerless");
    await expect(
      platform.platform.approve({ universityId: id }),
    ).rejects.toThrow(/no owner/);
    const [uni] = await adminDb
      .select()
      .from(university)
      .where(eq(university.id, id));
    expect(uni.status).toBe("PENDING");
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
