import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  auditLog,
  followTag,
  followUser,
  notification,
  tag,
} from "@/db/schema";
import { assertCanPostLinks } from "@/server/links";
import { normalizeTags } from "@/server/tags";
import type { Me } from "@/server/trpc";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

const old = new Date(Date.now() - 10 * 86_400_000);
let uniId: string;
let alice: { id: string };
let bob: { id: string };
let alum: { id: string };

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId, { createdAt: old });
  bob = await makeUser(uniId, { createdAt: old });
  alum = await makeUser(uniId, { role: "ALUMNUS", createdAt: old });
});

test("normalizeTags", () => {
  expect(normalizeTags(["React", " react ", "Next JS", "c++"])).toEqual([
    "react",
    "next-js",
    "c",
  ]);
  expect(() => normalizeTags(["a", "b", "c", "d", "e", "f"])).toThrow(/5/);
  expect(normalizeTags(["a", "A", "a ", "b", "c", "d", "e"])).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
});

describe("posts", () => {
  test("create, read, edit, search, feed by tag", async () => {
    const c = callerFor(alice.id);
    const { id } = await c.post.create({
      title: "Which supervisor for ML thesis?",
      body: "Looking for advice on **machine learning** supervisors",
      tags: ["ML", "Thesis"],
    });
    const p = await c.post.byId({ id });
    expect(p.tags.sort()).toEqual(["ml", "thesis"]);
    expect(p.canEdit).toBe(true);
    await c.post.update({
      id,
      title: "Which supervisor for an ML thesis?",
      body: "Updated body about neural networks",
      tags: ["ml"],
    });
    expect((await c.post.byId({ id })).tags).toEqual(["ml"]);
    expect(
      (await c.post.search({ q: "neural" })).items.map((i) => i.id),
    ).toEqual([id]);
    expect((await c.post.feed({ tag: "ml" })).items).toHaveLength(1);
    expect((await c.post.feed({ tag: "thesis" })).items).toHaveLength(0);
  });

  test("only author or mod can edit/remove", async () => {
    const { id } = await callerFor(alice.id).post.create({
      title: "Alice's question",
      body: "body",
      tags: [],
    });
    await expect(
      callerFor(bob.id).post.update({
        id,
        title: "hacked title",
        body: "x",
        tags: [],
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(callerFor(bob.id).post.remove({ id })).rejects.toThrow(
      /FORBIDDEN/,
    );
    const mod = await makeUser(uniId, { role: "MODERATOR" });
    await callerFor(mod.id).post.remove({ id });
    await expect(callerFor(alice.id).post.byId({ id })).rejects.toThrow(
      /NOT_FOUND/,
    );
  });

  test("new accounts cannot post links", async () => {
    const fresh = await makeUser(uniId);
    await expect(
      callerFor(fresh.id).post.create({
        title: "Great internship",
        body: "apply at https://scam.example",
        tags: [],
      }),
    ).rejects.toThrow(/links/);
  });

  test("new accounts cannot add a link via post.update", async () => {
    const fresh = await makeUser(uniId);
    const { id } = await callerFor(fresh.id).post.create({
      title: "Looking for advice",
      body: "no links here yet",
      tags: [],
    });
    await expect(
      callerFor(fresh.id).post.update({
        id,
        title: "Looking for advice",
        body: "check out https://scam.example",
        tags: [],
      }),
    ).rejects.toThrow(/links/);
  });

  test("feed pagination", async () => {
    for (let i = 0; i < 25; i++)
      await callerFor(alice.id).post.create({
        title: `Question number ${i}`,
        body: "b",
        tags: [],
      });
    const p1 = await callerFor(bob.id).post.feed({});
    expect(p1.items).toHaveLength(20);
    expect(p1.nextCursor).toBe(20);
    const p2 = await callerFor(bob.id).post.feed({ cursor: 20 });
    expect(p2.items).toHaveLength(5);
    expect(p2.nextCursor).toBeNull();
  });

  test("followers get notified of new posts", async () => {
    await adminDb.insert(followUser).values({
      universityId: uniId,
      followerId: bob.id,
      followeeId: alice.id,
    });
    const [t] = await adminDb
      .insert(tag)
      .values({ universityId: uniId, name: "career" })
      .returning();
    await adminDb
      .insert(followTag)
      .values({ universityId: uniId, userId: alum.id, tagId: t.id });
    await adminDb
      .insert(followTag)
      .values({ universityId: uniId, userId: bob.id, tagId: t.id });
    await callerFor(alice.id).post.create({
      title: "Career question here",
      body: "b",
      tags: ["career"],
    });
    const rows = await adminDb.select().from(notification);
    expect(
      rows
        .map((r) => `${r.userId === bob.id ? "bob" : "alum"}:${r.type}`)
        .sort(),
    ).toEqual(["alum:FOLLOWED_TAG_POST", "bob:FOLLOWED_USER_POST"]);
  });
});

describe("comments", () => {
  test("threads 3+ levels, notifies, keeps replies of removed parent", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Thread test post",
      body: "b",
      tags: [],
    });
    const c1 = await callerFor(alum.id).comment.create({
      postId,
      body: "level 1",
    });
    const c2 = await callerFor(alice.id).comment.create({
      postId,
      parentId: c1.id,
      body: "level 2",
    });
    const c3 = await callerFor(alum.id).comment.create({
      postId,
      parentId: c2.id,
      body: "level 3",
    });
    await callerFor(alum.id).comment.remove({ id: c1.id });
    const list = await callerFor(bob.id).comment.list({ postId });
    expect(list.map((c) => [c.id, c.parentId])).toEqual([
      [c1.id, null],
      [c2.id, c1.id],
      [c3.id, c2.id],
    ]);
    expect(list[0]).toMatchObject({
      deleted: true,
      body: "[removed]",
      author: null,
    });
    const types = (await adminDb.select().from(notification))
      .map((n) => n.type)
      .sort();
    expect(types).toEqual(["REPLY_COMMENT", "REPLY_COMMENT", "REPLY_POST"]);
    const p = await callerFor(bob.id).post.byId({ id: postId });
    expect(p.commentCount).toBe(2);
    expect(p.hasAlumnusReply).toBe(true);
  });

  test("parent must belong to same post", async () => {
    const a = await callerFor(alice.id).post.create({
      title: "First post here",
      body: "b",
      tags: [],
    });
    const b = await callerFor(alice.id).post.create({
      title: "Second post here",
      body: "b",
      tags: [],
    });
    const c = await callerFor(bob.id).comment.create({
      postId: a.id,
      body: "hi",
    });
    await expect(
      callerFor(bob.id).comment.create({
        postId: b.id,
        parentId: c.id,
        body: "x",
      }),
    ).rejects.toThrow(/BAD_REQUEST/);
  });

  test("new accounts cannot add a link via comment.create", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Thread for links test",
      body: "b",
      tags: [],
    });
    const fresh = await makeUser(uniId);
    await expect(
      callerFor(fresh.id).comment.create({
        postId,
        body: "visit https://scam.example",
      }),
    ).rejects.toThrow(/links/);
  });

  test("cannot reply to a removed comment", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Thread for removed-parent test",
      body: "b",
      tags: [],
    });
    const c1 = await callerFor(bob.id).comment.create({ postId, body: "hi" });
    await callerFor(bob.id).comment.remove({ id: c1.id });
    await expect(
      callerFor(alice.id).comment.create({
        postId,
        parentId: c1.id,
        body: "too late",
      }),
    ).rejects.toThrow(/removed/);
  });

  test("mod removing a student's comment writes an audit row", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Thread for mod audit test",
      body: "b",
      tags: [],
    });
    const c1 = await callerFor(bob.id).comment.create({ postId, body: "hi" });
    const mod = await makeUser(uniId, { role: "MODERATOR" });
    await callerFor(mod.id).comment.remove({ id: c1.id });
    const rows = await adminDb
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "comment.remove"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: mod.id, target: c1.id });
  });
});

test("link gate catches protocol-relative markdown links and mailto:", () => {
  const fresh = { createdAt: new Date() } as Me;
  for (const t of [
    "see [here](//evil.example)",
    "mail mailto:x@y.z",
    "MAILTO:x@y.z",
  ]) {
    expect(() => assertCanPostLinks(fresh, t)).toThrow(/links/);
  }
  expect(() =>
    assertCanPostLinks(fresh, "a/b // comment, no link"),
  ).not.toThrow();
});
