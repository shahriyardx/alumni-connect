import { beforeAll, describe, expect, test } from "bun:test";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

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
      /NOT_FOUND/,
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
  test("admin.audit excludes B", async () =>
    expect((await adminA.admin.audit({})).items).toEqual([]));
});
