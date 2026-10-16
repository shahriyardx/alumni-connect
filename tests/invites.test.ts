import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  invite,
  pendingSignup,
  rateLimit,
  university,
  user,
} from "@/db/schema";
import { auth } from "@/server/auth";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uniId: string;
let owner: { id: string; email: string };
let admin: { id: string; email: string };
let mod: { id: string };

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  owner = await makeUser(uniId, { role: "OWNER" });
  admin = await makeUser(uniId, { role: "ADMIN" });
  mod = await makeUser(uniId, { role: "MODERATOR" });
});

const tokenOf = (r: { inviteUrl: string }) =>
  r.inviteUrl.split("/").pop() as string;

const userByEmail = (email: string) =>
  adminDb
    .select()
    .from(user)
    .where(eq(user.email, email))
    .then((r) => r[0]);

const inviteByEmail = (email: string) =>
  adminDb
    .select()
    .from(invite)
    .where(eq(invite.email, email))
    .then((r) => r[0]);

const signUp = (email: string, name = "New Member") =>
  auth.api.signUpEmail({ body: { name, email, password: "password123" } });

/**
 * There's no SMTP in tests (see src/server/mail.ts), so the OTP is printed
 * to the console instead of sent — capture it the same way a developer
 * reads it in dev.
 */
async function signUpAndCaptureOtp(email: string, name: string) {
  const logs: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((msg?: unknown) => {
    logs.push(String(msg));
  });
  try {
    await signUp(email, name);
  } finally {
    logSpy.mockRestore();
  }
  const otp = logs.join("\n").match(/Alumni Connect code: (\d+)/)?.[1];
  if (!otp) throw new Error("OTP was not printed to the console");
  return otp;
}

describe("invites.create", () => {
  test("admin creates a MODERATOR invite; a dup open invite is replaced, not stacked", async () => {
    const asAdmin = callerFor(admin.id);
    const r1 = await asAdmin.invites.create({
      email: "Mod@X.edu",
      role: "MODERATOR",
      department: "CSE",
    });
    expect(r1.inviteUrl).toMatch(/\/invite\/[\w-]{20,}$/);
    expect(await inviteByEmail("mod@x.edu")).toMatchObject({
      role: "MODERATOR",
      department: "CSE",
    });

    const r2 = await asAdmin.invites.create({
      email: "mod@x.edu",
      role: "STAFF",
      department: "Physics",
      title: "Lecturer",
    });
    const rows = await adminDb
      .select()
      .from(invite)
      .where(eq(invite.universityId, uniId));
    expect(rows).toHaveLength(1); // replaced, not stacked
    expect(rows[0]).toMatchObject({
      role: "STAFF",
      department: "Physics",
      title: "Lecturer",
    });
    expect(r2.inviteUrl).not.toBe(r1.inviteUrl);
  });

  test("MODERATOR can't create invites", async () => {
    await expect(
      callerFor(mod.id).invites.create({
        email: "x@x.edu",
        role: "STAFF",
        department: "CSE",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test("ADMIN can't invite ADMIN; OWNER can", async () => {
    await expect(
      callerFor(admin.id).invites.create({
        email: "a@x.edu",
        role: "ADMIN",
        department: "CSE",
      }),
    ).rejects.toThrow(/owner/i);
    const r = await callerFor(owner.id).invites.create({
      email: "a@x.edu",
      role: "ADMIN",
      department: "CSE",
    });
    expect(r.inviteUrl).toBeTruthy();
  });

  test("OWNER invite is not creatable through invites.create", async () => {
    await expect(
      callerFor(owner.id).invites.create({
        email: "o@x.edu",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        role: "OWNER" as any,
        department: "CSE",
      }),
    ).rejects.toThrow();
  });

  test("an already-registered email can't be invited", async () => {
    await expect(
      callerFor(admin.id).invites.create({
        email: owner.email,
        role: "STAFF",
        department: "CSE",
      }),
    ).rejects.toThrow(/already has an account/);
  });
});

describe("invites.create rate limit (I3: a PENDING university could otherwise spam invites)", () => {
  test("a university at its hourly cap is blocked; a different university is unaffected", async () => {
    await adminDb.insert(rateLimit).values({
      id: `app:invite-create:uni:${uniId}`,
      key: `app:invite-create:uni:${uniId}`,
      count: 20,
      lastRequest: Date.now(),
    });
    await expect(
      callerFor(admin.id).invites.create({
        email: "blocked@x.edu",
        role: "STAFF",
        department: "CSE",
      }),
    ).rejects.toThrow(/too many/i);

    const otherUni = (await makeUniversity()).id;
    const otherAdmin = await makeUser(otherUni, { role: "ADMIN" });
    const r = await callerFor(otherAdmin.id).invites.create({
      email: "fine@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    expect(r.inviteUrl).toBeTruthy();
  });

  test("an inviter at their own hourly cap is blocked even under the university cap", async () => {
    await adminDb.insert(rateLimit).values({
      id: `app:invite-create:actor:${admin.id}`,
      key: `app:invite-create:actor:${admin.id}`,
      count: 20,
      lastRequest: Date.now(),
    });
    await expect(
      callerFor(admin.id).invites.create({
        email: "blocked2@x.edu",
        role: "STAFF",
        department: "CSE",
      }),
    ).rejects.toThrow(/too many/i);

    // A different inviter in the same university still has their own budget.
    const r = await callerFor(owner.id).invites.create({
      email: "fine2@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    expect(r.inviteUrl).toBeTruthy();
  });
});

describe("invites.list / revoke", () => {
  test("list shows open invites; revoke deletes it; cross-tenant revoke is NOT_FOUND", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "s@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const list = await callerFor(admin.id).invites.list();
    expect(list).toHaveLength(1);
    const id = list[0].id;

    const otherUni = (await makeUniversity()).id;
    const otherAdmin = await makeUser(otherUni, { role: "ADMIN" });
    await expect(
      callerFor(otherAdmin.id).invites.revoke({ id }),
    ).rejects.toThrow(/NOT_FOUND/);

    await callerFor(admin.id).invites.revoke({ id });
    expect(await callerFor(admin.id).invites.list()).toHaveLength(0);
    await expect(
      callerFor(null).invites.lookup({ token: tokenOf(r) }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("revoking an ADMIN invite needs the owner", async () => {
    const r = await callerFor(owner.id).invites.create({
      email: "a2@x.edu",
      role: "ADMIN",
      department: "CSE",
    });
    const row = await inviteByEmail("a2@x.edu");
    await expect(
      callerFor(admin.id).invites.revoke({ id: row.id }),
    ).rejects.toThrow(/owner/i);
    expect(r.inviteUrl).toBeTruthy();
  });

  test("an ADMIN can't replace (or delete-by-replacing) an open ADMIN invite", async () => {
    await callerFor(owner.id).invites.create({
      email: "openadmin@x.edu",
      role: "ADMIN",
      department: "CSE",
    });
    await expect(
      callerFor(admin.id).invites.create({
        email: "openadmin@x.edu",
        role: "STAFF",
        department: "CSE",
      }),
    ).rejects.toThrow(/owner/i);
    const row = await inviteByEmail("openadmin@x.edu");
    expect(row.role).toBe("ADMIN"); // untouched
  });
});

describe("invite accept lifecycle", () => {
  test("happy path: lookup -> accept -> sign-up -> ACTIVE user with role+department; invite single-use", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "staff@x.edu",
      role: "STAFF",
      department: "Physics",
      title: "Lecturer",
    });
    const token = tokenOf(r);

    const look = await callerFor(null).invites.lookup({ token });
    expect(look).toMatchObject({
      role: "STAFF",
      email: "staff@x.edu",
      department: "Physics",
    });

    await callerFor(null).invites.accept({ token, name: "Staff Person" });
    const pending = await adminDb
      .select()
      .from(pendingSignup)
      .where(eq(pendingSignup.email, "staff@x.edu"))
      .then((r) => r[0]);
    expect(pending).toMatchObject({
      role: "STAFF",
      department: "Physics",
      title: "Lecturer",
      status: "ACTIVE",
      universityId: uniId,
    });

    await signUp("staff@x.edu", "Staff Person");
    const u = await userByEmail("staff@x.edu");
    expect(u).toMatchObject({
      role: "STAFF",
      department: "Physics",
      title: "Lecturer",
      status: "ACTIVE",
      universityId: uniId,
    });

    const invRow = await inviteByEmail("staff@x.edu");
    expect(invRow.acceptedAt).not.toBeNull();
    expect(
      await adminDb
        .select()
        .from(pendingSignup)
        .where(eq(pendingSignup.email, "staff@x.edu")),
    ).toHaveLength(0);
  });

  test("expired token -> NOT_FOUND on lookup and accept", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "exp@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await adminDb
      .update(invite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invite.email, "exp@x.edu"));
    await expect(callerFor(null).invites.lookup({ token })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      callerFor(null).invites.accept({ token, name: "X" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("reused (already-accepted) token -> NOT_FOUND", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "reuse@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "Reuse Person" });
    await signUp("reuse@x.edu", "Reuse Person");
    await expect(callerFor(null).invites.lookup({ token })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(
      callerFor(null).invites.accept({ token, name: "Reuse Person" }),
    ).rejects.toThrow();
  });

  test("an email registered elsewhere before accept -> CONFLICT", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "dup@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    await makeUser(uniId, { email: "dup@x.edu" });
    await expect(
      callerFor(null).invites.accept({ token: tokenOf(r), name: "Dup" }),
    ).rejects.toThrow(/CONFLICT|already registered/);
  });

  test("the sign-up hook refuses a pending row whose invite was revoked after accept()", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "revoked@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "X" });
    const row = await inviteByEmail("revoked@x.edu");
    await callerFor(admin.id).invites.revoke({ id: row.id });
    await expect(signUp("revoked@x.edu", "X")).rejects.toThrow();
    expect(await userByEmail("revoked@x.edu")).toBeUndefined();
  });

  test("a platform-created OWNER invite accepts through the same flow", async () => {
    const newUniId = (await makeUniversity("NewCo")).id;
    const token = "owner-test-token";
    await adminDb.insert(invite).values({
      universityId: newUniId,
      email: "newowner@x.edu",
      role: "OWNER",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });

    const look = await callerFor(null).invites.lookup({ token });
    expect(look).toMatchObject({ role: "OWNER", email: "newowner@x.edu" });

    await callerFor(null).invites.accept({ token, name: "New Owner" });
    await signUp("newowner@x.edu", "New Owner");
    const u = await userByEmail("newowner@x.edu");
    expect(u).toMatchObject({
      role: "OWNER",
      universityId: newUniId,
      department: "Administration",
      status: "ACTIVE",
    });
    const invRow = await inviteByEmail("newowner@x.edu");
    expect(invRow.acceptedAt).not.toBeNull();
  });
});

describe("the sign-up hook's own invite guards (not just invites.* NOT_FOUND)", () => {
  /** A hand-crafted pending_signup row, as invites.accept would have written it. */
  const plantPending = (over: Partial<typeof pendingSignup.$inferInsert>) =>
    adminDb.insert(pendingSignup).values({
      email: "x@x.edu",
      universityId: uniId,
      department: "CSE",
      role: "STAFF",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30 * 60_000),
      ...over,
    });

  test("a pending row whose email doesn't match the invite's email is refused", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "real@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const invRow = await inviteByEmail("real@x.edu");
    await plantPending({
      email: "spoofed@x.edu",
      inviteId: invRow.id,
      role: "STAFF",
    });
    await expect(signUp("spoofed@x.edu", "Spoof")).rejects.toThrow();
    expect(await userByEmail("spoofed@x.edu")).toBeUndefined();
    expect(r.inviteUrl).toBeTruthy();
  });

  test("an invite that expires between accept() and sign-up is refused", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "expgap@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "X" });
    await adminDb
      .update(invite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invite.email, "expgap@x.edu"));
    await expect(signUp("expgap@x.edu", "X")).rejects.toThrow();
    expect(await userByEmail("expgap@x.edu")).toBeUndefined();
  });

  test("M5: a university rejected between accept() and sign-up refuses the hook", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "rejecteduni@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "X" });
    await adminDb
      .update(university)
      .set({ status: "REJECTED" })
      .where(eq(university.id, uniId));
    await expect(signUp("rejecteduni@x.edu", "X")).rejects.toThrow();
    expect(await userByEmail("rejecteduni@x.edu")).toBeUndefined();
  });

  test("a role mismatch between the pending row and the invite is refused", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "rolemismatch@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "X" });
    await adminDb
      .update(pendingSignup)
      .set({ role: "ADMIN" })
      .where(eq(pendingSignup.email, "rolemismatch@x.edu"));
    await expect(signUp("rolemismatch@x.edu", "X")).rejects.toThrow();
    expect(await userByEmail("rolemismatch@x.edu")).toBeUndefined();
  });

  test("a pending row for an invite already marked accepted is refused (the hook's own guard, independent of invites.* NOT_FOUND)", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "racer@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "X" });
    // Simulate a concurrent request that already claimed this invite via
    // the hook's own compare-and-set (see auth.ts) — the pending row is
    // untouched, only the invite's accepted_at changed underneath it.
    await adminDb
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.email, "racer@x.edu"));
    await expect(signUp("racer@x.edu", "X")).rejects.toThrow();
    expect(await userByEmail("racer@x.edu")).toBeUndefined();
  });

  test("an abandoned (never-verified) accept recovers: the invite can be re-accepted past the grace window", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "abandoned@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "First Try" });
    await signUp("abandoned@x.edu", "First Try"); // unverified user; invite marked accepted
    expect((await inviteByEmail("abandoned@x.edu")).acceptedAt).not.toBeNull();

    // Still within the 15-minute grace window: genuinely in-flight, so the
    // invite stays "used" rather than reopening under someone else.
    await expect(callerFor(null).invites.lookup({ token })).rejects.toThrow(
      /NOT_FOUND/,
    );

    // Backdate past the grace window — this sign-up was abandoned.
    await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(user.email, "abandoned@x.edu"));

    const look = await callerFor(null).invites.lookup({ token });
    expect(look.email).toBe("abandoned@x.edu");

    await callerFor(null).invites.accept({ token, name: "Second Try" });
    await signUp("abandoned@x.edu", "Second Try");
    const u = await userByEmail("abandoned@x.edu");
    expect(u).toMatchObject({
      role: "STAFF",
      department: "CSE",
      status: "ACTIVE",
    });
    // The stale account was cleared, not duplicated: exactly one user row.
    expect(
      await adminDb
        .select()
        .from(user)
        .where(eq(user.email, "abandoned@x.edu")),
    ).toHaveLength(1);
  });

  test("I1: a staff account that never verified past the grace window can't complete email verification", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "stale-verify@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "Stale Person" });
    const otp = await signUpAndCaptureOtp("stale-verify@x.edu", "Stale Person");
    expect((await userByEmail("stale-verify@x.edu")).role).toBe("STAFF");

    // Abandoned: well past the 15-minute grace window, whether or not
    // anyone ever revoked the (already-consumed) invite.
    await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(user.email, "stale-verify@x.edu"));

    await expect(
      auth.api.verifyEmailOTP({
        body: { email: "stale-verify@x.edu", otp },
      }),
    ).rejects.toThrow();
    expect((await userByEmail("stale-verify@x.edu")).emailVerified).toBe(false);
  });

  test("I1: a fresh staff account can still verify within the grace window", async () => {
    const r = await callerFor(admin.id).invites.create({
      email: "fresh-verify@x.edu",
      role: "STAFF",
      department: "CSE",
    });
    const token = tokenOf(r);
    await callerFor(null).invites.accept({ token, name: "Fresh Person" });
    const otp = await signUpAndCaptureOtp("fresh-verify@x.edu", "Fresh Person");

    await auth.api.verifyEmailOTP({
      body: { email: "fresh-verify@x.edu", otp },
    });
    expect((await userByEmail("fresh-verify@x.edu")).emailVerified).toBe(true);
  });
});
