import { beforeEach, expect, test } from "bun:test";
import { resolveFileAccess } from "@/app/api/files/[...key]/route";
import { resolveIdCardAccess } from "@/app/api/id-cards/[userId]/route";
import { stat } from "@/server/storage";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let a: { id: string; universityId: string };
let b: { id: string; universityId: string };
beforeEach(async () => {
  await resetDb();
  a = await makeUser((await makeUniversity()).id);
  b = await makeUser((await makeUniversity()).id);
});

test("upload round-trip and tenant-scoped keys", async () => {
  const c = callerFor(a.id);
  const { key, url } = await c.files.createUpload({
    kind: "attachment",
    mime: "image/png",
    size: 4,
  });
  expect(key.startsWith(`${a.universityId}/attachment/`)).toBe(true);
  const put = await fetch(url, {
    method: "PUT",
    body: new Uint8Array([137, 80, 78, 71]),
    headers: { "Content-Type": "image/png" },
  });
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
    // @ts-expect-error invalid mime on purpose
    c.files.createUpload({ kind: "avatar", mime: "text/html", size: 10 }),
  ).rejects.toThrow();
  await expect(
    c.files.createUpload({
      kind: "avatar",
      mime: "image/png",
      size: 6 * 1024 * 1024,
    }),
  ).rejects.toThrow();
  await expect(
    c.files.confirm({ key: `${a.universityId}/avatar/nope.png` }),
  ).rejects.toThrow(/not found/i);
});

test("rejects content whose bytes don't match the claimed image type, and removes it", async () => {
  const c = callerFor(a.id);
  const { key, url } = await c.files.createUpload({
    kind: "attachment",
    mime: "image/png",
    size: 25,
  });
  const put = await fetch(url, {
    method: "PUT",
    body: "<script>alert(1)</script>",
    headers: { "Content-Type": "image/png" },
  });
  expect(put.ok).toBe(true);
  await expect(c.files.confirm({ key })).rejects.toThrow(/not a valid image/i);
  expect(await stat(key)).toBeNull();
});

test("post.create ignores an attachmentId owned by someone else", async () => {
  const c = callerFor(a.id);
  const { key, url } = await c.files.createUpload({
    kind: "attachment",
    mime: "image/png",
    size: 4,
  });
  await fetch(url, {
    method: "PUT",
    body: new Uint8Array([137, 80, 78, 71]),
    headers: { "Content-Type": "image/png" },
  });
  const att = await c.files.confirm({ key });

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
  const { key, url } = await c.files.createUpload({
    kind: "attachment",
    mime: "image/png",
    size: 4,
  });
  await fetch(url, {
    method: "PUT",
    body: new Uint8Array([137, 80, 78, 71]),
    headers: { "Content-Type": "image/png" },
  });

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
  if (ok.ok) {
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

test("TOCTOU: replaying the staging presigned PUT after confirm doesn't touch the final object", async () => {
  const c = callerFor(a.id);
  const { key: stagingKey, url } = await c.files.createUpload({
    kind: "attachment",
    mime: "image/png",
    size: 4,
  });
  await fetch(url, {
    method: "PUT",
    body: new Uint8Array([137, 80, 78, 71]),
    headers: { "Content-Type": "image/png" },
  });
  const att = await c.files.confirm({ key: stagingKey });

  const before = await stat(att.key);
  expect(before).not.toBeNull();

  // The presigned PUT URL is still valid (300s) — replay it with a
  // different, oversize, non-image payload, as a malicious or confused
  // client might after the object was already validated and confirmed.
  const replay = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(6 * 1024 * 1024).fill(1),
    headers: { "Content-Type": "image/png" },
  });
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
  for (const viewer of [owner, admin, platform]) {
    const r = await resolveIdCardAccess(viewer.id, applicant.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const u = new URL(r.url);
      expect(u.pathname.endsWith(applicant.idCardKey as string)).toBe(true);
      expect(u.searchParams.get("response-content-type")).toBe("image/jpeg");
    }
  }
  const bannedAdmin = await makeUser(uni, {
    role: "ADMIN",
    status: "BANNED",
  });
  expect(await resolveIdCardAccess(bannedAdmin.id, applicant.id)).toMatchObject(
    { status: 403 },
  );
});
