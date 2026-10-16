import { beforeAll, describe, expect, test } from "bun:test";
import { batch, rosterEntry } from "@/db/schema";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let asA: ReturnType<typeof callerFor>;
let adminA: ReturnType<typeof callerFor>;
const bIds = {} as { userId: string; postId: string; commentId: string };

beforeAll(async () => {
  await resetDb();
  const a = await makeUniversity("A");
  const b = await makeUniversity("B");
  const old = new Date(Date.now() - 10 * 86_400_000);
  const ua = await makeUser(a.id, { createdAt: old });
  const ub = await makeUser(b.id, { createdAt: old });
  asA = callerFor(ua.id);
  adminA = callerFor((await makeUser(a.id, { role: "ADMIN" })).id);
  const asB = callerFor(ub.id);
  const p = await asB.post.create({
    title: "Secret B question",
    body: "only for B uniqueword",
    tags: ["secret"],
  });
  const c = await asB.comment.create({ postId: p.id, body: "B comment" });
  Object.assign(bIds, { userId: ub.id, postId: p.id, commentId: c.id });
  // More B-only data for the list/count endpoints below.
  await asB.social.bookmark({ postId: p.id, on: true });
  await asB.social.followTag({ tag: "secret", on: true });
  const asB2 = callerFor((await makeUser(b.id, { createdAt: old })).id);
  await asB2.comment.create({ postId: p.id, body: "notify B author" });
  await asB2.moderation.report({
    targetType: "POST",
    targetId: p.id,
    reason: "B-only report",
  });
  await makeUser(b.id, { status: "PENDING" });
  const [bBatch] = await adminDb
    .insert(batch)
    .values({ universityId: b.id, number: 20, graduationYear: 2020 })
    .returning();
  await adminDb.insert(rosterEntry).values({
    universityId: b.id,
    batchId: bBatch.id,
    studentIdHash: "b-roster-hash",
    department: "CSE",
  });
  // Positive control: the B data really exists for B.
  expect(await asB.notification.unreadCount()).toBeGreaterThan(0);
  expect((await asB.social.bookmarks({})).items).toHaveLength(1);
});

describe("cross-tenant reads are impossible", () => {
  test("post.byId", () =>
    expect(asA.post.byId({ id: bIds.postId })).rejects.toThrow(/NOT_FOUND/));
  test("post.feed", async () =>
    expect((await asA.post.feed({})).items).toEqual([]));
  test("post.feed by tag", async () =>
    expect((await asA.post.feed({ tag: "secret" })).items).toEqual([]));
  test("post.feed by author", async () =>
    expect((await asA.post.feed({ authorId: bIds.userId })).items).toEqual([]));
  test("post.search", async () =>
    expect((await asA.post.search({ q: "uniqueword" })).items).toEqual([]));
  test("post.tags", async () => expect(await asA.post.tags()).toEqual([]));
  test("comment.list", () =>
    expect(asA.comment.list({ postId: bIds.postId })).rejects.toThrow(
      /NOT_FOUND/,
    ));
  test("comment.create on B post", () =>
    expect(
      asA.comment.create({ postId: bIds.postId, body: "x" }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("comment.remove B comment", () =>
    expect(asA.comment.remove({ id: bIds.commentId })).rejects.toThrow(
      /NOT_FOUND/,
    ));
  test("post.update B post", () =>
    expect(
      asA.post.update({
        id: bIds.postId,
        title: "hijacked!",
        body: "x",
        tags: [],
      }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("social.vote B post", () =>
    expect(
      asA.social.vote({ targetType: "POST", targetId: bIds.postId, value: 1 }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("social.bookmark B post", () =>
    expect(
      asA.social.bookmark({ postId: bIds.postId, on: true }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("social.followUser B user", () =>
    expect(
      asA.social.followUser({ userId: bIds.userId, on: true }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("profile.get B user", () =>
    expect(asA.profile.get({ id: bIds.userId })).rejects.toThrow(/NOT_FOUND/));
  test("notification.list has nothing from B", async () =>
    expect((await asA.notification.list({})).items).toEqual([]));
  test("moderation.report B post", () =>
    expect(
      asA.moderation.report({
        targetType: "POST",
        targetId: bIds.postId,
        reason: "cross tenant",
      }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("admin.setRole B user", () =>
    expect(
      adminA.admin.setRole({ userId: bIds.userId, role: "ADMIN" }),
    ).rejects.toThrow(/NOT_FOUND/));
  test("admin.approveUser B user", () =>
    expect(adminA.admin.approveUser({ userId: bIds.userId })).rejects.toThrow(
      /No pending account/,
    ));
  test("moderation.setUserStatus B user", async () => {
    const modA = adminA; // admin is also a mod
    await expect(
      modA.moderation.setUserStatus({ userId: bIds.userId, status: "BANNED" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
  test("admin.users excludes B", async () =>
    expect((await adminA.admin.users({})).items.map((u) => u.id)).not.toContain(
      bIds.userId,
    ));
  test("social.bookmarks excludes B", async () =>
    expect((await asA.social.bookmarks({})).items).toEqual([]));
  test("social.followedTags excludes B", async () =>
    expect(await asA.social.followedTags()).toEqual([]));
  test("notification.unreadCount excludes B", async () =>
    expect(await asA.notification.unreadCount()).toBe(0));
  test("moderation.queue excludes B", async () =>
    expect((await adminA.moderation.queue({})).items).toEqual([]));
  test("admin.pendingUsers excludes B", async () =>
    expect(await adminA.admin.pendingUsers()).toEqual([]));
  test("admin.stats excludes B", async () => {
    const s = await adminA.admin.stats();
    expect(s.members).toMatchObject({ STUDENT: 1, ADMIN: 1 });
    expect(s.pending).toBe(0);
    expect(s.totalPosts).toBe(0);
    expect(s.openReports).toBe(0);
    expect(s.postsPerWeek.every((w) => w.posts === 0 && w.comments === 0)).toBe(
      true,
    );
  });
  test("admin.rosterStats excludes B", async () =>
    expect(await adminA.admin.rosterStats()).toEqual({
      total: 0,
      graduated: 0,
    }));
  test("admin.audit excludes B", async () =>
    expect((await adminA.admin.audit({})).items).toEqual([]));
});
