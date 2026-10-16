import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  batch,
  pendingSignup,
  rosterEntry,
  university,
  user,
} from "@/db/schema";
import { auth } from "@/server/auth";
import { MAX_BYTES, stat } from "@/server/storage";
import { hashStudentId } from "@/server/student-id";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  postUpload,
  resetDb,
} from "./helpers";

let uni: { id: string; emailDomain: string | null };
const base = () => ({
  universityId: uni.id,
  email: `alice@${uni.emailDomain}`,
  studentId: "NU-1001",
  batchNumber: 42,
  department: "CSE",
  idCardMime: "image/png" as const,
});
const put = async (upload: Parameters<typeof postUpload>[0]) =>
  expect((await postUpload(upload)).ok).toBe(true);
const pendingRow = async (email: string) =>
  (
    await adminDb
      .select()
      .from(pendingSignup)
      .where(eq(pendingSignup.email, email))
  )[0];
const signUp = (email = base().email, name = "Alice") =>
  auth.api.signUpEmail({ body: { name, email, password: "password123" } });
/** startSignup → PUT the card → confirmIdCard: everything before better-auth. */
async function startWithCard(over: Partial<ReturnType<typeof base>> = {}) {
  const input = { ...base(), ...over };
  const r = await callerFor(null).auth.startSignup(input);
  await put(r.upload);
  await callerFor(null).auth.confirmIdCard({
    email: input.email,
    signupToken: r.signupToken,
    key: r.upload.key,
  });
  return r;
}

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
  test("any email domain; always PENDING; roster match is stored, never returned", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      email: "alice@gmail.com",
    });
    expect(Object.keys(r).sort()).toEqual(["role", "signupToken", "upload"]);
    expect(r.upload.key).toMatch(
      new RegExp(`^${uni.id}/staging/idcard/[0-9a-f]{32}\\.png$`),
    );
    expect(await pendingRow("alice@gmail.com")).toMatchObject({
      status: "PENDING",
      rosterMatch: true,
      studentIdHint: "1001",
      batchNumber: 42,
      graduationYear: 2022,
      idCardKey: null,
    });
  });
  test("ID not in that batch's roster → still PENDING, rosterMatch false", async () => {
    await callerFor(null).auth.startSignup({ ...base(), studentId: "NU-9999" });
    await callerFor(null).auth.startSignup({
      ...base(),
      email: "b@north.edu",
      studentId: "NU-2002", // on batch 48's roster, not 42's
    });
    expect((await pendingRow(base().email)).rosterMatch).toBe(false);
    expect((await pendingRow("b@north.edu")).rosterMatch).toBe(false);
  });
  test("normalized ID matches; batch's year wins over input; past year → ALUMNUS", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      studentId: " nu-10 01 ",
      graduationYear: 2030,
    });
    expect(r.role).toBe("ALUMNUS");
    expect(await pendingRow(base().email)).toMatchObject({
      rosterMatch: true,
      studentIdHint: "1001",
      graduationYear: 2022,
      role: "ALUMNUS",
    });
  });
  test("future graduation year → STUDENT", async () => {
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      studentId: "NU-2002",
      batchNumber: 48,
    });
    expect(r.role).toBe("STUDENT");
  });
  test("batch that doesn't exist requires graduationYear", async () => {
    await expect(
      callerFor(null).auth.startSignup({ ...base(), batchNumber: 43 }),
    ).rejects.toThrow(/graduation year/i);
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      batchNumber: 43,
      graduationYear: 2031,
    });
    expect(r.role).toBe("STUDENT");
    expect(await pendingRow(base().email)).toMatchObject({
      batchNumber: 43,
      graduationYear: 2031,
      rosterMatch: null, // nothing to compare against
    });
  });
  test("accepts a migrated batch number (number = year, e.g. 2018)", async () => {
    await adminDb
      .insert(batch)
      .values({ universityId: uni.id, number: 2018, graduationYear: 2018 });
    const r = await callerFor(null).auth.startSignup({
      ...base(),
      batchNumber: 2018,
    });
    expect(r.role).toBe("ALUMNUS");
  });
  test("rejects an ID already used by an account", async () => {
    await makeUser(uni.id, { studentIdHash: hashStudentId(uni.id, "NU-1001") });
    await expect(callerFor(null).auth.startSignup(base())).rejects.toThrow(
      /already/i,
    );
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
  test("rate limits repeated attempts for the same student ID", async () => {
    const c = callerFor(null);
    for (let i = 0; i < 5; i++)
      await c.auth
        .startSignup({ ...base(), email: `id-${i}@north.edu` })
        .catch(() => {});
    await expect(
      c.auth.startSignup({ ...base(), email: "id-x@north.edu" }),
    ).rejects.toThrow(/too many/i);
  });
});

describe("auth.batches", () => {
  test("lists an ACTIVE university's batches; nothing for others", async () => {
    expect(
      await callerFor(null).auth.batches({ universityId: uni.id }),
    ).toEqual([
      { number: 42, graduationYear: 2022 },
      { number: 48, graduationYear: 2028 },
    ]);
    await adminDb
      .update(university)
      .set({ status: "PENDING" })
      .where(eq(university.id, uni.id));
    expect(
      await callerFor(null).auth.batches({ universityId: uni.id }),
    ).toEqual([]);
  });
});

describe("ID card + v2 sign-up", () => {
  test("happy path: user is PENDING with card, hint and roster match", async () => {
    await startWithCard();
    await signUp();
    const [u] = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, base().email));
    expect(u).toMatchObject({
      universityId: uni.id,
      role: "ALUMNUS",
      status: "PENDING",
      emailVerified: false,
      batchNumber: 42,
      graduationYear: 2022,
      rosterMatch: true,
      studentIdHint: "1001",
    });
    expect(u.idCardKey).toMatch(
      new RegExp(`^${uni.id}/idcard/f/[0-9a-f]{32}\\.png$`),
    );
    expect(await stat(u.idCardKey as string)).not.toBeNull();
    expect(await adminDb.select().from(pendingSignup)).toEqual([]);
  });
  test("sign-up without a confirmed card is refused", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    await put(r.upload); // uploaded but never confirmed
    expect((await apiError(signUp())).code).toBe("FAILED_TO_CREATE_USER");
    expect(
      await adminDb.select().from(user).where(eq(user.email, base().email)),
    ).toEqual([]);
  });
  test("wrong or missing token is rejected", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    await put(r.upload);
    const confirm = (email: string, signupToken: string) =>
      callerFor(null).auth.confirmIdCard({
        email,
        signupToken,
        key: r.upload.key,
      });
    await expect(confirm(base().email, `${r.signupToken}x`)).rejects.toThrow(
      /FORBIDDEN|expired/,
    );
    await expect(confirm("nobody@north.edu", r.signupToken)).rejects.toThrow(
      /expired/,
    );
    expect((await pendingRow(base().email)).idCardKey).toBeNull();
  });
  test("a key issued to another signup is rejected", async () => {
    const mine = await callerFor(null).auth.startSignup(base());
    const theirs = await callerFor(null).auth.startSignup({
      ...base(),
      email: "bob@north.edu",
      studentId: "NU-2002",
      batchNumber: 48,
    });
    await put(theirs.upload);
    await expect(
      callerFor(null).auth.confirmIdCard({
        email: base().email,
        signupToken: mine.signupToken,
        key: theirs.upload.key,
      }),
    ).rejects.toThrow(/not found/i);
    expect((await pendingRow(base().email)).idCardKey).toBeNull();
  });
  test("HTML disguised as a PNG is rejected and removed", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    await postUpload(r.upload, "<html><script>alert(1)</script></html>");
    await expect(
      callerFor(null).auth.confirmIdCard({
        email: base().email,
        signupToken: r.signupToken,
        key: r.upload.key,
      }),
    ).rejects.toThrow(/not a valid image/i);
    expect((await pendingRow(base().email)).idCardKey).toBeNull();
    expect(
      await stat(r.upload.key.replace("/staging/idcard/", "/idcard/f/")),
    ).toBeNull();
  });
  test("confirm is idempotent; restarting sign-up resets the card and old token", async () => {
    const r = await startWithCard();
    const again = {
      email: base().email,
      signupToken: r.signupToken,
      key: r.upload.key,
    };
    expect(await callerFor(null).auth.confirmIdCard(again)).toEqual({
      ok: true,
    });
    const oldCard = (await pendingRow(base().email)).idCardKey as string;
    expect(await stat(oldCard)).not.toBeNull();
    await callerFor(null).auth.startSignup(base());
    expect(await pendingRow(base().email)).toMatchObject({ idCardKey: null });
    expect(await stat(oldCard)).toBeNull(); // previous final card deleted
    await expect(callerFor(null).auth.confirmIdCard(again)).rejects.toThrow(
      /expired/,
    );
  });
  test("restart also deletes the previous unconfirmed staging upload", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    await put(r.upload);
    expect(await stat(r.upload.key)).not.toBeNull();
    await callerFor(null).auth.startSignup(base());
    expect(await stat(r.upload.key)).toBeNull();
  });
  test("expired pending rows and their cards are purged on the next startSignup", async () => {
    await startWithCard();
    const card = (await pendingRow(base().email)).idCardKey as string;
    await adminDb
      .update(pendingSignup)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pendingSignup.email, base().email));
    await callerFor(null).auth.startSignup({
      ...base(),
      email: "other@north.edu",
      studentId: "NU-2002",
      batchNumber: 48,
    });
    expect(await pendingRow(base().email)).toBeUndefined();
    expect(await stat(card)).toBeNull();
  });
  test("card keys are one-way: they reveal nothing of the stored token hash", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    const hash = (await pendingRow(base().email)).signupTokenHash as string;
    const id = r.upload.key.split("/").pop()?.split(".")[0] as string;
    expect(id).toHaveLength(32);
    expect(hash.includes(id.slice(0, 8))).toBe(false);
  });
  test("a card a user references survives a restart and an expired purge of rows pointing at it", async () => {
    await startWithCard();
    await signUp();
    const [u] = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, base().email));
    const card = u.idCardKey as string;
    // Stray pending rows that (wrongly) point at the user's card.
    const stray = (email: string, expiresAt: Date) => ({
      email,
      universityId: uni.id,
      department: "CSE",
      idCardKey: card,
      role: "STUDENT" as const,
      status: "PENDING" as const,
      expiresAt,
    });
    await adminDb
      .insert(pendingSignup)
      .values([
        stray("live@north.edu", new Date(Date.now() + 60_000)),
        stray("dead@north.edu", new Date(Date.now() - 1000)),
      ]);
    // Restart for live@ replaces its row; the purge deletes dead@.
    await callerFor(null).auth.startSignup({
      ...base(),
      email: "live@north.edu",
      studentId: "NU-2002",
      batchNumber: 48,
    });
    expect(await pendingRow("dead@north.edu")).toBeUndefined();
    expect((await pendingRow("live@north.edu")).idCardKey).toBeNull();
    expect(await stat(card)).not.toBeNull();
  });
  test("restart racing sign-up never leaves a user pointing at a deleted card", async () => {
    for (let i = 0; i < 3; i++) {
      const email = `race-${i}@north.edu`;
      const studentId = `RACE-${i}`;
      await startWithCard({ email, studentId });
      await Promise.allSettled([
        signUp(email),
        callerFor(null).auth.startSignup({ ...base(), email, studentId }),
      ]);
      const [u] = await adminDb
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (u) expect(await stat(u.idCardKey as string)).not.toBeNull();
    }
  });
  test("claimed row: blocks restart and confirm, keeps its card; abandoned after 5 min it is purged with the card", async () => {
    const r = await startWithCard();
    const card = (await pendingRow(base().email)).idCardKey as string;
    // As the sign-up hook leaves it when the user insert then fails.
    await adminDb
      .update(pendingSignup)
      .set({ claimedAt: new Date(), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pendingSignup.email, base().email));
    await expect(callerFor(null).auth.startSignup(base())).rejects.toThrow(
      /already registered/i,
    );
    await expect(
      callerFor(null).auth.confirmIdCard({
        email: base().email,
        signupToken: r.signupToken,
        key: r.upload.key,
      }),
    ).rejects.toThrow(/expired/);
    expect(await stat(card)).not.toBeNull();
    expect((await apiError(signUp())).code).toBe("FAILED_TO_CREATE_USER");

    await adminDb
      .update(pendingSignup)
      .set({ claimedAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(pendingSignup.email, base().email));
    // Any later startSignup (here another applicant's) purges it.
    await callerFor(null).auth.startSignup({
      ...base(),
      email: "other@north.edu",
      studentId: "NU-2002",
      batchNumber: 48,
    });
    expect(await pendingRow(base().email)).toBeUndefined();
    expect(await stat(card)).toBeNull();
  });
  test("a refused sign-up never claims the row (shape checks run first)", async () => {
    await adminDb.insert(pendingSignup).values({
      email: "bad-owner@north.edu",
      universityId: uni.id,
      department: "Admin",
      role: "OWNER",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await apiError(signUp("bad-owner@north.edu"))).code).toBe(
      "FAILED_TO_CREATE_USER",
    );
    expect((await pendingRow("bad-owner@north.edu")).claimedAt).toBeNull();
  });
  test("successful sign-up: claimed row is deleted by the after-hook", async () => {
    await startWithCard();
    await signUp();
    expect(await pendingRow(base().email)).toBeUndefined();
  });
  test("presigned POST: size-capped by MinIO, pinned key and content-type", async () => {
    const r = await callerFor(null).auth.startSignup(base());
    expect(r.upload.key.startsWith(`${uni.id}/staging/idcard/`)).toBe(true);
    expect(r.upload.fields["Content-Type"]).toBe("image/png");
    const big = await postUpload(r.upload, new Uint8Array(MAX_BYTES + 1));
    expect(big.status).toBeGreaterThanOrEqual(400);
    expect(big.status).toBeLessThan(500);
    expect(await stat(r.upload.key)).toBeNull();
    // Content-Type is a policy condition: a different one is refused.
    const form = new FormData();
    for (const [k, v] of Object.entries(r.upload.fields))
      form.append(k, k === "Content-Type" ? "text/html" : v);
    form.append("file", new Blob(["<html>"]));
    const html = await fetch(r.upload.url, { method: "POST", body: form });
    expect(html.status).toBe(403);
    await put(r.upload);
    expect(
      await callerFor(null).auth.confirmIdCard({
        email: base().email,
        signupToken: r.signupToken,
        key: r.upload.key,
      }),
    ).toEqual({ ok: true });
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
  test("two pending rows sharing a studentIdHash: the second sign-up is refused cleanly", async () => {
    const hash = hashStudentId(uni.id, "NU-1001");
    const row = (email: string) => ({
      email,
      universityId: uni.id,
      department: "CSE",
      studentIdHash: hash,
      idCardKey: `${uni.id}/idcard/f/x.png`,
      role: "STUDENT" as const,
      status: "PENDING" as const,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adminDb
      .insert(pendingSignup)
      .values([row("first@north.edu"), row("second@north.edu")]);
    const signUp = (email: string) =>
      auth.api.signUpEmail({
        body: { name: "Twin", email, password: "password123" },
      });
    await signUp("first@north.edu");
    const err = await apiError(signUp("second@north.edu"));
    expect(err).toEqual({
      status: "BAD_REQUEST",
      code: "FAILED_TO_CREATE_USER",
      message: "Failed to create user",
    });
    expect(
      await adminDb
        .select()
        .from(user)
        .where(eq(user.email, "second@north.edu")),
    ).toEqual([]);
  });
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
    await startWithCard();
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
    await startWithCard();
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
  test("a fresh unverified squatter still blocks the real owner (CONFLICT), row untouched", async () => {
    // Attacker knows the victim's roster ID and email; starts sign-up and
    // creates the account but never verifies it — this just happened, so
    // it might still be the victim's own in-progress verification.
    await startWithCard();
    await signUp(base().email, "Attacker");
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
    await startWithCard();
    await signUp(base().email, "Attacker");
    await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
      .where(eq(user.email, base().email));

    const [{ idCardKey: squatterCard }] = await adminDb
      .select()
      .from(user)
      .where(eq(user.email, base().email));
    expect(await stat(squatterCard as string)).not.toBeNull();

    // The real owner starts sign-up with the same ID/email: not CONFLICT.
    const r = await callerFor(null).auth.startSignup(base());
    expect(await stat(squatterCard as string)).toBeNull();
    expect(r.role).toBe("ALUMNUS");
    expect(
      await adminDb.select().from(user).where(eq(user.email, base().email)),
    ).toEqual([]);
  });
});
