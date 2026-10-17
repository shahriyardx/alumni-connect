import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { platformAdmin, user } from "@/db/schema";
import { env } from "@/env";
import { auth } from "@/server/auth";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

const claim = (email: string, setupToken?: string) =>
  callerFor(null).auth.claimSuperAdmin({
    name: "Root Person",
    email,
    setupToken,
  });
const signUp = (email: string) =>
  auth.api.signUpEmail({
    body: { name: "Root Person", email, password: "password123" },
  });
const userByEmail = (email: string) =>
  adminDb
    .select()
    .from(user)
    .where(eq(user.email, email))
    .then((r) => r[0]);
const admins = () => adminDb.select().from(platformAdmin);

async function captureOtp(send: () => Promise<unknown>) {
  const logs: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((m?: unknown) => {
    logs.push(String(m));
  });
  try {
    await send();
  } finally {
    spy.mockRestore();
  }
  const otp = logs.join("\n").match(/Alumni Connect code: (\d+)/)?.[1];
  if (!otp) throw new Error("no OTP printed");
  return otp;
}

/** Full flow: claim → sign-up → OTP verify. Returns the user. */
async function claimAndVerify(email = "root@x.edu") {
  await claim(email);
  const otp = await captureOtp(() => signUp(email));
  await auth.api.verifyEmailOTP({ body: { email, otp } });
  return userByEmail(email);
}

beforeEach(resetDb);
afterEach(() => {
  env.SETUP_TOKEN = undefined;
});

describe("claim the first super admin", () => {
  test("first claim succeeds: no university, platform_admin row, platform access", async () => {
    expect(await callerFor(null).auth.claimStatus()).toEqual({
      open: true,
      tokenRequired: false,
    });
    const root = await claimAndVerify();
    expect(root).toMatchObject({ universityId: null, emailVerified: true });
    expect((await admins()).map((a) => a.userId)).toEqual([root.id]);
    expect((await callerFor(null).auth.claimStatus()).open).toBe(false);

    const me = await callerFor(root.id).auth.me();
    expect(me).toMatchObject({
      universityId: null,
      universityName: null,
      isPlatformAdmin: true,
    });
    // Platform procedures accept them; member procedures refuse them.
    expect(await callerFor(root.id).platform.universities({})).toEqual([]);
    await expect(callerFor(root.id).departments.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a second claim is refused once one exists", async () => {
    await claimAndVerify();
    await expect(claim("other@x.edu")).rejects.toThrow(/already set up/);
    expect(await admins()).toHaveLength(1);
  });

  test("a pending claim loses at sign-up if someone else got there first", async () => {
    await claim("a@x.edu");
    await claim("b@x.edu");
    await signUp("a@x.edu");
    await expect(signUp("b@x.edu")).rejects.toThrow();
    expect(await userByEmail("b@x.edu")).toBeUndefined();
    expect(await admins()).toHaveLength(1);
  });

  test("two concurrent claims: exactly one wins", async () => {
    await claim("a@x.edu");
    await claim("b@x.edu");
    const results = await Promise.allSettled([
      signUp("a@x.edu"),
      signUp("b@x.edu"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await admins()).toHaveLength(1);
    const users = await adminDb.select().from(user);
    expect(users).toHaveLength(1);
  });

  test("an abandoned (stale, unverified) claim frees the slot and can't verify late", async () => {
    await claim("slow@x.edu");
    const otp = await captureOtp(() => signUp("slow@x.edu"));
    await adminDb
      .update(user)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(user.email, "slow@x.edu"));
    await expect(
      auth.api.verifyEmailOTP({ body: { email: "slow@x.edu", otp } }),
    ).rejects.toThrow();
    expect((await callerFor(null).auth.claimStatus()).open).toBe(true);
    const root = await claimAndVerify("fast@x.edu");
    expect(await userByEmail("slow@x.edu")).toBeUndefined();
    expect((await admins()).map((a) => a.userId)).toEqual([root.id]);
  });

  test("SETUP_TOKEN is enforced when set", async () => {
    env.SETUP_TOKEN = "s3cret-token";
    expect((await callerFor(null).auth.claimStatus()).tokenRequired).toBe(true);
    await expect(claim("root@x.edu")).rejects.toThrow(/Wrong setup token/);
    await expect(claim("root@x.edu", "nope")).rejects.toThrow(
      /Wrong setup token/,
    );
    await claim("root@x.edu", "s3cret-token");
    await signUp("root@x.edu");
    expect(await admins()).toHaveLength(1);
  });
});

describe("platform admin access", () => {
  test("env-email fallback still works for a university member", async () => {
    const home = await makeUniversity();
    const viaEnv = await makeUser(home.id, { email: "platform@test.edu" });
    expect((await callerFor(viaEnv.id).auth.me())?.isPlatformAdmin).toBe(true);
    expect(await callerFor(viaEnv.id).platform.universities({})).toHaveLength(
      1,
    );
  });

  test("an unverified platform_admin row grants nothing", async () => {
    const [u] = await adminDb
      .insert(user)
      .values({
        id: "root-unverified",
        name: "Root",
        email: "root@x.edu",
        emailVerified: false,
      })
      .returning();
    await adminDb.insert(platformAdmin).values({ userId: u.id });
    await expect(callerFor(u.id).platform.universities({})).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
