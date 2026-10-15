import { beforeAll, describe, expect, test } from "bun:test";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let asA: ReturnType<typeof callerFor>;
const bIds = {} as { userId: string; postId: string; commentId: string };

beforeAll(async () => {
  await resetDb();
  const a = await makeUniversity("A");
  const b = await makeUniversity("B");
  const old = new Date(Date.now() - 10 * 86_400_000);
  const ua = await makeUser(a.id, { createdAt: old });
  const ub = await makeUser(b.id, { createdAt: old });
  asA = callerFor(ua.id);
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
});
