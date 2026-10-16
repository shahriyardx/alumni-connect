import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { invite, pendingSignup, user } from "@/db/schema";
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
