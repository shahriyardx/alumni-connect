import { beforeEach, expect, test } from "bun:test";
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
