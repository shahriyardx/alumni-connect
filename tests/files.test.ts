import { beforeEach, expect, test } from "bun:test";
import { resolveFileAccess } from "@/app/api/files/[...key]/route";
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
  expect(att.key).toBe(key);
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

  await c.files.confirm({ key });

  const noSession = await resolveFileAccess(null, key.split("/"));
  expect(noSession).toEqual({
    ok: false,
    status: 401,
    message: "Unauthorized",
  });

  const otherTenant = await resolveFileAccess(b.id, key.split("/"));
  expect(otherTenant).toEqual({ ok: false, status: 404, message: "Not found" });

  const banned = await makeUser(a.universityId, { status: "BANNED" });
  const bannedResult = await resolveFileAccess(banned.id, key.split("/"));
  expect(bannedResult).toEqual({
    ok: false,
    status: 403,
    message: "Account banned",
  });

  const ok = await resolveFileAccess(a.id, key.split("/"));
  expect(ok.ok).toBe(true);
  if (ok.ok) {
    const u = new URL(ok.url);
    expect(u.searchParams.get("response-content-type")).toBe("image/png");
    expect(u.searchParams.get("response-content-disposition")).toBe("inline");
  }
});
