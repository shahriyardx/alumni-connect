import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  fileResponse,
  resolveFileAccess,
} from "@/app/api/files/[...key]/route";
import { attachment, comment, post as postTable } from "@/db/schema";
import { FILE_TYPES } from "@/lib/uploads";
import { leadingMarkup } from "@/server/sniff";
import { finalKeyFor, stat } from "@/server/storage";
import {
  adminDb,
  callerFor,
  makePost,
  makeUniversity,
  makeUser,
  postUpload,
  resetDb,
} from "./helpers";

/** Minimal stored (uncompressed) zip; enough structure for the sniffer. */
function zip(entries: [string, string][]): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, body] of entries) {
    const n = Buffer.from(name);
    const d = Buffer.from(body);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt32LE(d.length, 18);
    lh.writeUInt32LE(d.length, 22);
    lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, d);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt32LE(d.length, 20);
    ch.writeUInt32LE(d.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

const ooxml = (dir: string) =>
  zip([
    ["[Content_Types].xml", "<Types/>"],
    ["_rels/.rels", "<Relationships/>"],
    [`${dir}/main.xml`, "<x/>"],
  ]);
const odf = (sub: string) =>
  zip([
    ["mimetype", `application/vnd.oasis.opendocument.${sub}`],
    ["content.xml", "<office:document-content/>"],
  ]);
/** OLE2 header + one directory sector holding Root Entry and `stream`. */
function ole(stream: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.alloc(1024);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(b, 0);
  b.writeUInt16LE(9, 30); // 512-byte sectors
  b.writeUInt32LE(0, 48); // directory starts at sector 0 → offset 512
  for (const [i, name] of ["Root Entry", stream].entries()) {
    const at = 512 + i * 128;
    b.write(name, at, "utf16le");
    b.writeUInt16LE((name.length + 1) * 2, at + 64);
  }
  return new Uint8Array(b);
}
const text = (s: string) => new TextEncoder().encode(s);
const PDF = text("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let uni: string;
let a: { id: string; universityId: string };
let b: { id: string; universityId: string };
beforeEach(async () => {
  await resetDb();
  uni = (await makeUniversity()).id;
  a = await makeUser(uni);
  b = await makeUser((await makeUniversity()).id);
});

async function upload(
  userId: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  const c = callerFor(userId);
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const up = await c.files.createUpload({
    kind: "attachment",
    ext,
    size: bytes.length,
  });
  const res = await postUpload(up, bytes);
  if (!res.ok) throw new Error(`POST ${res.status}`);
  return c.files.confirm({ key: up.key, name });
}

async function serve(userId: string, key: string) {
  return fileResponse(await resolveFileAccess(userId, key.split("/")));
}

const rowFor = async (id: string) =>
  (await adminDb.select().from(attachment).where(eq(attachment.id, id)))[0];

describe("allowed types", () => {
  const cases: [string, Uint8Array<ArrayBuffer>][] = [
    ["notes.pdf", PDF],
    ["essay.docx", ooxml("word")],
    ["marks.xlsx", ooxml("xl")],
    ["deck.pptx", ooxml("ppt")],
    ["old.doc", ole("WordDocument")],
    ["old.xls", ole("Workbook")],
    ["old.ppt", ole("PowerPoint Document")],
    ["open.odt", odf("text")],
    ["open.ods", odf("spreadsheet")],
    ["open.odp", odf("presentation")],
    ["readme.txt", text("plain notes\n")],
    ["readme.md", text("# Title\n\n<b>inline html is fine in md</b>\n")],
    ["data.csv", text("a,b\n1,2\n")],
  ];
  test.each(
    cases,
  )("%s is stored as a DOCUMENT with the detected type", async (name, bytes) => {
    const att = await upload(a.id, name, bytes);
    const row = await rowFor(att.id);
    const ext = name.split(".").pop() as string;
    expect(row.kind).toBe("DOCUMENT");
    expect(row.mime).toBe(FILE_TYPES[ext].mime);
    expect(row.filename).toBe(name);
    expect(att.key).toMatch(
      new RegExp(`/attachment/f/[0-9a-f-]{36}\\.${ext}$`),
    );
  });

  test("images stay IMAGE and are still redirected inline", async () => {
    const att = await upload(
      a.id,
      "pic.png",
      new Uint8Array([137, 80, 78, 71]),
    );
    expect((await rowFor(att.id)).kind).toBe("IMAGE");
    const res = await serve(a.id, att.key);
    expect(res.status).toBe(302);
  });

  test("each code extension is accepted and served as text/plain attachment", async () => {
    const code = Object.entries(FILE_TYPES)
      .filter(([, t]) => t.icon === "code")
      .map(([e]) => e);
    expect(code).toContain("py");
    expect(code).toContain("ipynb");
    for (const ext of code) {
      const att = await upload(a.id, `main.${ext}`, text("x = 1\n"));
      const res = await serve(a.id, att.key);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename*=UTF-8''main.${ext}`,
      );
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await res.text()).toBe("x = 1\n");
    }
  });
});

describe("refused", () => {
  const spoofs: [string, string, Uint8Array<ArrayBuffer>][] = [
    ["exe renamed .pdf", "setup.pdf", text("MZ\x90\x00\x03\x00 This program")],
    [
      "HTML renamed .txt",
      "page.txt",
      text("<!DOCTYPE html><script>1</script>"),
    ],
    ["HTML renamed .md", "page.md", text("  <html><body>x</body></html>")],
    [
      "SVG renamed .xml",
      "icon.xml",
      text('<?xml version="1.0"?>\n<svg onload="x"/>'),
    ],
    ["zip that isn't OOXML", "files.docx", zip([["a.txt", "hi"]])],
    ["xlsx bytes named .docx", "sheet.docx", ooxml("xl")],
    ["pdf bytes named .xlsx", "doc.xlsx", PDF],
    ["odt bytes named .ods", "open.ods", odf("text")],
    ["xls bytes named .doc", "old.doc", ole("Workbook")],
    ["text with a NUL byte", "notes.txt", text("hello\x00world")],
    ["code with a NUL byte", "main.py", text("print(1)\x00")],
    ["invalid UTF-8", "notes.csv", new Uint8Array([0x61, 0xff, 0xfe, 0x62])],
  ];
  test.each(spoofs)("%s", async (_, name, bytes) => {
    await expect(upload(a.id, name, bytes)).rejects.toThrow(
      /doesn't match its type/,
    );
    const rows = await adminDb.select().from(attachment);
    expect(rows).toHaveLength(0);
  });

  test("html, htm, svg, exe and zip extensions are never accepted", async () => {
    for (const ext of ["html", "htm", "svg", "exe", "zip", "js.map"]) {
      await expect(
        callerFor(a.id).files.createUpload({
          kind: "attachment",
          ext,
          size: 10,
        }),
      ).rejects.toThrow();
    }
  });

  test("documents only go on posts/comments, not avatars or logos", async () => {
    await expect(
      callerFor(a.id).files.createUpload({
        kind: "avatar",
        ext: "pdf",
        size: 10,
      }),
    ).rejects.toThrow(/Only images/);
  });
});

describe("size limits", () => {
  const MB = 1024 * 1024;
  test.each([
    ["png", 5 * MB + 1],
    ["txt", 2 * MB + 1],
    ["py", 2 * MB + 1],
    ["pdf", 20 * MB + 1],
  ])("%s over its limit is refused at createUpload", async (ext, size) => {
    await expect(
      callerFor(a.id).files.createUpload({ kind: "attachment", ext, size }),
    ).rejects.toThrow();
  });

  test("the POST policy itself caps text at 2 MB and documents at 20 MB", async () => {
    const c = callerFor(a.id);
    const txt = await c.files.createUpload({
      kind: "attachment",
      ext: "txt",
      size: 10,
    });
    expect(
      (await postUpload(txt, new Uint8Array(2 * MB + 1).fill(97))).ok,
    ).toBe(false);
    expect((await postUpload(txt, new Uint8Array(2 * MB).fill(97))).ok).toBe(
      true,
    );
    const pdf = await c.files.createUpload({
      kind: "attachment",
      ext: "pdf",
      size: 10,
    });
    const big = new Uint8Array(6 * MB);
    big.set(PDF);
    expect((await postUpload(pdf, big)).ok).toBe(true);
    await c.files.confirm({ key: pdf.key, name: "big.pdf" });
  });
});

describe("serving", () => {
  test("a document is an attachment with the forced type and nosniff", async () => {
    const att = await upload(a.id, "Lecture 1 — notes.pdf", PDF);
    const res = await serve(a.id, att.key);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("Lecture 1 — notes.pdf")}`,
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
  });

  test("a .js file is never served with a JS content-type", async () => {
    const att = await upload(a.id, "app.js", text("alert(document.cookie)"));
    const res = await serve(a.id, att.key);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-type")).not.toMatch(/javascript/);
    expect(res.headers.get("content-disposition")).toStartWith("attachment;");
  });

  test("the stored name is sanitized and keeps the real extension", async () => {
    const c = callerFor(a.id);
    const up = await c.files.createUpload({
      kind: "attachment",
      ext: "txt",
      size: 2,
    });
    await postUpload(up, text("hi"));
    const evil = await c.files.confirm({
      key: up.key,
      name: "../../ev\u0000il\u202e.html",
    });
    const name = (await rowFor(evil.id)).filename as string;
    expect(name).toBe("evil.html.txt");
  });
});

describe("comments and caps", () => {
  test("comment attachments: listed, capped at 5, owner- and tenant-scoped", async () => {
    const post = await makePost(uni, a.id);
    const ids = [];
    for (let i = 0; i < 6; i++)
      ids.push((await upload(a.id, `n${i}.txt`, text(`file ${i}`))).id);

    const c = callerFor(a.id);
    await expect(
      c.comment.create({ postId: post.id, body: "six", attachmentIds: ids }),
    ).rejects.toThrow();
    const { id } = await c.comment.create({
      postId: post.id,
      body: "five",
      attachmentIds: ids.slice(0, 5),
    });
    const [listed] = await c.comment.list({ postId: post.id });
    expect(listed.id).toBe(id);
    expect(listed.attachments.map((x) => x.id).sort()).toEqual(
      ids.slice(0, 5).sort(),
    );
    expect(listed.attachments[0]).toMatchObject({ kind: "DOCUMENT" });

    // Already used on a comment: can't be moved onto a post.
    const { id: postId } = await c.post.create({
      title: "Reuse attempt",
      body: "body",
      attachmentIds: [ids[0], ids[5]],
    });
    const p = await c.post.byId({ id: postId });
    expect(p.attachments.map((x) => x.id)).toEqual([ids[5]]);

    // Same-tenant other user can't claim a's upload on their comment.
    const mate = await makeUser(uni);
    const spare = (await upload(a.id, "spare.txt", text("s"))).id;
    await callerFor(mate.id).comment.create({
      postId: post.id,
      body: "claim",
      attachmentIds: [spare],
    });
    expect((await rowFor(spare)).commentId).toBeNull();

    // Other tenant: can't claim it nor download a comment file.
    const bPost = await makePost(b.universityId, b.id);
    await callerFor(b.id).comment.create({
      postId: bPost.id,
      body: "cross-tenant",
      attachmentIds: [spare],
    });
    expect((await rowFor(spare)).commentId).toBeNull();
    const key = listed.attachments[0].key;
    expect((await serve(b.id, key)).status).toBe(404);
    expect((await serve(a.id, key)).status).toBe(200);

    // A removed comment no longer lists its files.
    await c.comment.remove({ id });
    const [gone] = await c.comment.list({ postId: post.id });
    expect(gone.attachments).toEqual([]);
  });

  test("post.create caps attachments at 5 and the feed counts documents", async () => {
    const c = callerFor(a.id);
    const ids = [];
    for (let i = 0; i < 6; i++)
      ids.push((await upload(a.id, `d${i}.pdf`, PDF)).id);
    await expect(
      c.post.create({ title: "Too many files", body: "x", attachmentIds: ids }),
    ).rejects.toThrow();
    const img = await upload(a.id, "p.png", new Uint8Array([137, 80, 78, 71]));
    const { id } = await c.post.create({
      title: "Four files",
      body: "x",
      attachmentIds: [...ids.slice(0, 3), img.id],
    });
    const p = await c.post.byId({ id });
    expect(p.attachments).toHaveLength(4);
    expect(p.fileCount).toBe(3);
  });
});

describe("fix round 1", () => {
  test("leadingMarkup is linear on adversarial input", () => {
    const inputs = [
      `${"<!---->".repeat(5000)}x`,
      `${"<!---->".repeat(5000)}<svg>`,
      `${"<!--".repeat(15000)}`,
      `${"<?xml".repeat(12000)}`,
      `${" ".repeat(60000)}<html`,
      `${"<!-- -->\n".repeat(6000)}<!doctype   html>`,
      `<!--${"-".repeat(60000)}`,
    ];
    const verdicts: boolean[] = [];
    for (const s of inputs) {
      const t = performance.now();
      verdicts.push(leadingMarkup(s));
      expect(performance.now() - t).toBeLessThan(50);
    }
    // Unterminated comments/prologs are refused rather than guessed at.
    expect(verdicts).toEqual([false, true, true, true, true, true, true]);
    // Same comment rules as the HTML tokenizer (no parser differential).
    expect(leadingMarkup("<!--><html>")).toBe(true);
    expect(leadingMarkup("<!---><svg>")).toBe(true);
    expect(leadingMarkup("<!-- x --!><script>")).toBe(true);
    expect(leadingMarkup("<!-- a --> plain notes")).toBe(false);
    expect(leadingMarkup('<?xml version="1.0"?><!-- c --><svg/>')).toBe(true);
    expect(leadingMarkup("<Script>")).toBe(true);
    expect(leadingMarkup("<htmlx>")).toBe(false);
    expect(leadingMarkup("# <html> later is fine")).toBe(false);
  });

  test("a 300-byte comment-bomb .txt is accepted quickly (no ReDoS)", async () => {
    const t = performance.now();
    await upload(a.id, "bomb.txt", text(`${"<!---->".repeat(40)}x`));
    expect(performance.now() - t).toBeLessThan(5000);
  });

  test("an OLE header pointing past EOF is refused and the final copy removed", async () => {
    const bytes = ole("WordDocument");
    Buffer.from(bytes.buffer).writeUInt32LE(0xfffffff0, 48);
    const c = callerFor(a.id);
    const up = await c.files.createUpload({
      kind: "attachment",
      ext: "doc",
      size: bytes.length,
    });
    await postUpload(up, bytes);
    await expect(
      c.files.confirm({ key: up.key, name: "x.doc" }),
    ).rejects.toThrow(/doesn't match its type/);
    expect(await stat(finalKeyFor(up.key))).toBeNull();
    expect(await adminDb.select().from(attachment)).toHaveLength(0);
  });

  test("files of a removed comment or a deleted post stop being served", async () => {
    const c = callerFor(a.id);
    const doc = await upload(a.id, "notes.pdf", PDF);
    const img = await upload(a.id, "p.png", new Uint8Array([137, 80, 78, 71]));
    const { id: postId } = await c.post.create({
      title: "With files",
      body: "x",
      attachmentIds: [doc.id, img.id],
    });
    const cf = await upload(a.id, "c.txt", text("comment file"));
    const { id: commentId } = await c.comment.create({
      postId,
      body: "c",
      attachmentIds: [cf.id],
    });
    const avatarUp = await c.files.createUpload({
      kind: "avatar",
      ext: "png",
      size: 4,
    });
    await postUpload(avatarUp, new Uint8Array([137, 80, 78, 71]));
    const avatar = await c.files.confirm({ key: avatarUp.key });

    for (const k of [doc.key, img.key, cf.key, avatar.key])
      expect((await serve(a.id, k)).status).toBeLessThan(400);

    await c.comment.remove({ id: commentId });
    expect((await serve(a.id, cf.key)).status).toBe(404);
    expect((await serve(a.id, doc.key)).status).toBe(200);

    await adminDb
      .update(postTable)
      .set({ deletedAt: new Date() })
      .where(eq(postTable.id, postId));
    expect((await serve(a.id, doc.key)).status).toBe(404);
    // Post images and avatars behave as before.
    expect((await serve(a.id, img.key)).status).toBe(302);
    expect((await serve(a.id, avatar.key)).status).toBe(302);
  });

  test("a comment's files also go once its post is deleted; hard delete cascades", async () => {
    const p = await makePost(uni, a.id);
    const cf = await upload(a.id, "c.md", text("# hi"));
    const { id: commentId } = await callerFor(a.id).comment.create({
      postId: p.id,
      body: "c",
      attachmentIds: [cf.id],
    });
    await adminDb
      .update(postTable)
      .set({ deletedAt: new Date() })
      .where(eq(postTable.id, p.id));
    expect((await serve(a.id, cf.key)).status).toBe(404);

    await adminDb.delete(comment).where(eq(comment.id, commentId));
    expect(await rowFor(cf.id)).toBeUndefined();
  });
});
