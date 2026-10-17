import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { resolveFileAccess } from "@/app/api/files/[...key]/route";
import { resolveIdCardAccess } from "@/app/api/id-cards/[userId]/route";
import { university } from "@/db/schema";
import { stat } from "@/server/storage";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  postUpload,
  resetDb,
} from "./helpers";

let a: { id: string; universityId: string };
let b: { id: string; universityId: string };
beforeEach(async () => {
  await resetDb();
  a = await makeUser((await makeUniversity()).id);
  b = await makeUser((await makeUniversity()).id);
});

test("upload round-trip and tenant-scoped keys", async () => {
  const c = callerFor(a.id);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: 4,
  });
  const { key } = up;
  expect(key.startsWith(`${a.universityId}/attachment/`)).toBe(true);
  const put = await postUpload(up, new Uint8Array([137, 80, 78, 71]));
  expect(put.ok).toBe(true);
  const att = await c.files.confirm({ key });
  // `confirm` stores a server-only FINAL key, never the staging key the
  // presigned PUT targeted (see the TOCTOU test below for why).
  expect(att.key).not.toBe(key);
  expect(att.key.startsWith(`${a.universityId}/attachment/f/`)).toBe(true);
  expect(await stat(key)).toBeNull(); // staging object was deleted
  await expect(callerFor(b.id).files.confirm({ key })).rejects.toThrow(
    /FORBIDDEN/,
  );
});

test("rejects bad type, oversize, missing object", async () => {
  const c = callerFor(a.id);
  await expect(
    c.files.createUpload({ kind: "avatar", ext: "html", size: 10 }),
  ).rejects.toThrow();
  await expect(
    c.files.createUpload({
      kind: "avatar",
      ext: "png",
      size: 6 * 1024 * 1024,
    }),
  ).rejects.toThrow();
  await expect(
    c.files.confirm({ key: `${a.universityId}/avatar/nope.png` }),
  ).rejects.toThrow(/not found/i);
});

test("rejects content whose bytes don't match the claimed image type, and removes it", async () => {
  const c = callerFor(a.id);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: 25,
  });
  const { key } = up;
  const put = await postUpload(up, "<script>alert(1)</script>");
  expect(put.ok).toBe(true);
  await expect(c.files.confirm({ key })).rejects.toThrow(/not a valid image/i);
  expect(await stat(key)).toBeNull();
});

test("post.create ignores an attachmentId owned by someone else", async () => {
  const c = callerFor(a.id);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: 4,
  });
  await postUpload(up, new Uint8Array([137, 80, 78, 71]));
  const att = await c.files.confirm({ key: up.key });

  const { id: postId } = await callerFor(b.id).post.create({
    title: "Not my attachment",
    body: "Trying to claim someone else's upload",
    tags: [],
    attachmentIds: [att.id],
  });
  const bPost = await callerFor(b.id).post.byId({ id: postId });
  expect(bPost.attachments).toHaveLength(0);
});

test("resolveFileAccess: session, tenant, status, and confirmed-object checks", async () => {
  const c = callerFor(a.id);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: 4,
  });
  await postUpload(up, new Uint8Array([137, 80, 78, 71]));
  const { key } = up;

  // Unconfirmed: never ran files.confirm, so no attachment row exists yet.
  const unconfirmed = await resolveFileAccess(a.id, key.split("/"));
  expect(unconfirmed).toEqual({
    ok: false,
    status: 404,
    message: "Not found",
  });

  const att = await c.files.confirm({ key });
  const finalKey = att.key.split("/");

  const noSession = await resolveFileAccess(null, finalKey);
  expect(noSession).toEqual({
    ok: false,
    status: 401,
    message: "Unauthorized",
  });

  const otherTenant = await resolveFileAccess(b.id, finalKey);
  expect(otherTenant).toEqual({ ok: false, status: 404, message: "Not found" });

  const banned = await makeUser(a.universityId, { status: "BANNED" });
  const bannedResult = await resolveFileAccess(banned.id, finalKey);
  expect(bannedResult).toEqual({
    ok: false,
    status: 403,
    message: "Account banned",
  });

  const ok = await resolveFileAccess(a.id, finalKey);
  expect(ok.ok).toBe(true);
  if (ok.ok && "url" in ok) {
    const u = new URL(ok.url);
    expect(u.searchParams.get("response-content-type")).toBe("image/png");
    expect(u.searchParams.get("response-content-disposition")).toBe("inline");
  }

  // The staging key itself is never servable, confirmed or not.
  const stagingNotServed = await resolveFileAccess(a.id, key.split("/"));
  expect(stagingNotServed).toEqual({
    ok: false,
    status: 404,
    message: "Not found",
  });
});

test("TOCTOU: replaying the staging presigned POST after confirm doesn't touch the final object", async () => {
  const c = callerFor(a.id);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: 4,
  });
  await postUpload(up, new Uint8Array([137, 80, 78, 71]));
  const stagingKey = up.key;
  const att = await c.files.confirm({ key: stagingKey });

  const before = await stat(att.key);
  expect(before).not.toBeNull();

  // The presigned POST is still valid (300s). Oversize is refused by the
  // policy itself; a same-size non-image payload lands in staging, as a
  // malicious or confused client might send after confirm.
  const big = await postUpload(up, new Uint8Array(6 * 1024 * 1024).fill(1));
  expect(big.ok).toBe(false);
  const replay = await postUpload(up, new Uint8Array([60, 104, 49, 62]));
  expect(replay.ok).toBe(true);

  // The confirmed, served object is a separate copy and is untouched.
  const after = await stat(att.key);
  expect(after).toEqual(before);

  const access = await resolveFileAccess(a.id, att.key.split("/"));
  expect(access.ok).toBe(true);

  // Re-confirming the same staging key (now holding the replayed garbage)
  // must never re-copy over the already-confirmed final object — it just
  // hands back the same attachment, untouched.
  const reconfirm = await c.files.confirm({ key: stagingKey });
  expect(reconfirm).toEqual(att);
  expect(await stat(att.key)).toEqual(before);
});

test("resolveIdCardAccess: only OWNER/ADMIN of the same university, or a platform admin", async () => {
  const uni = a.universityId;
  const applicant = await makeUser(uni, {
    status: "PENDING",
    idCardKey: `${uni}/idcard/f/${"a".repeat(32)}.jpg`,
  });
  const owner = await makeUser(uni, { role: "OWNER" });
  const admin = await makeUser(uni, { role: "ADMIN" });
  const otherAdmin = await makeUser(b.universityId, { role: "ADMIN" });
  const platform = await makeUser(b.universityId, {
    email: "platform@test.edu",
  });

  expect(await resolveIdCardAccess(null, applicant.id)).toMatchObject({
    status: 401,
  });
  expect(await resolveIdCardAccess(a.id, applicant.id)).toMatchObject({
    status: 403,
  });
  expect(await resolveIdCardAccess(otherAdmin.id, applicant.id)).toMatchObject({
    status: 404,
  });
  // Same-tenant admin, but the target has no card.
  expect(await resolveIdCardAccess(admin.id, owner.id)).toMatchObject({
    status: 404,
  });
  for (const viewer of [owner, admin]) {
    const r = await resolveIdCardAccess(viewer.id, applicant.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const u = new URL(r.url);
      expect(u.pathname.endsWith(applicant.idCardKey as string)).toBe(true);
      expect(u.searchParams.get("response-content-type")).toBe("image/jpeg");
    }
  }
  // A platform admin isn't OWNER/ADMIN of `uni`, and `applicant` is a
  // regular STUDENT in an ACTIVE university — neither widens into this.
  expect(await resolveIdCardAccess(platform.id, applicant.id)).toMatchObject({
    status: 404,
  });
  const bannedAdmin = await makeUser(uni, {
    role: "ADMIN",
    status: "BANNED",
  });
  expect(await resolveIdCardAccess(bannedAdmin.id, applicant.id)).toMatchObject(
    { status: 403 },
  );
});

test("resolveIdCardAccess: a platform admin may only view a PENDING university's OWNER card", async () => {
  const pendingUni = await makeUniversity();
  const rep = await makeUser(pendingUni.id, {
    role: "OWNER",
    idCardKey: `${pendingUni.id}/idcard/f/${"c".repeat(32)}.jpg`,
  });
  const staffInPendingUni = await makeUser(pendingUni.id, {
    role: "STAFF",
    idCardKey: `${pendingUni.id}/idcard/f/${"d".repeat(32)}.jpg`,
  });
  const platform = await makeUser(b.universityId, {
    email: "platform@test.edu",
  });
  await adminDb
    .update(university)
    .set({ status: "PENDING" })
    .where(eq(university.id, pendingUni.id));

  const r = await resolveIdCardAccess(platform.id, rep.id);
  expect(r.ok).toBe(true);

  // Never widens past OWNER, even within the same PENDING university.
  expect(
    await resolveIdCardAccess(platform.id, staffInPendingUni.id),
  ).toMatchObject({ status: 404 });

  // Once the university is decided (no longer PENDING), platform access to
  // the rep's card closes again.
  await adminDb
    .update(university)
    .set({ status: "ACTIVE" })
    .where(eq(university.id, pendingUni.id));
  expect(await resolveIdCardAccess(platform.id, rep.id)).toMatchObject({
    status: 404,
  });
});
