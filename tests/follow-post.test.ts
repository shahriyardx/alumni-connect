import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { notification, user } from "@/db/schema";
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
let carol: { id: string };
let postId: string;

const notes = () => adminDb.select().from(notification);

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId, { createdAt: old });
  bob = await makeUser(uniId, { createdAt: old });
  carol = await makeUser(uniId, { createdAt: old });
  ({ id: postId } = await callerFor(alice.id).post.create({
    title: "How do I pick a thesis topic?",
    body: "b",
    tags: [],
  }));
});

describe("follow post", () => {
  test("author follows their own post; others don't until they click", async () => {
    expect(
      (await callerFor(alice.id).post.byId({ id: postId })).following,
    ).toBe(true);
    expect((await callerFor(bob.id).post.byId({ id: postId })).following).toBe(
      false,
    );
    await callerFor(bob.id).social.followPost({ postId, on: true });
    expect((await callerFor(bob.id).post.byId({ id: postId })).following).toBe(
      true,
    );
    await callerFor(bob.id).social.followPost({ postId, on: false });
    expect((await callerFor(bob.id).post.byId({ id: postId })).following).toBe(
      false,
    );
  });

  test("followers get FOLLOWED_POST_COMMENT; commenter and direct target don't get it twice", async () => {
    await callerFor(bob.id).social.followPost({ postId, on: true });
    await callerFor(carol.id).comment.create({ postId, body: "an answer" });
    const rows = await notes();
    // alice: REPLY_POST only (not also FOLLOWED_POST_COMMENT); bob: follower.
    expect(rows.map((r) => [r.userId, r.type]).sort()).toEqual(
      [
        [alice.id, "REPLY_POST"],
        [bob.id, "FOLLOWED_POST_COMMENT"],
      ].sort(),
    );
  });

  test("author gets nested replies between others via the follow", async () => {
    const { id: c1 } = await callerFor(bob.id).comment.create({
      postId,
      body: "top level",
    });
    await adminDb.delete(notification);
    await callerFor(carol.id).comment.create({
      postId,
      parentId: c1,
      body: "reply to bob",
    });
    const rows = await notes();
    expect(rows.map((r) => [r.userId, r.type]).sort()).toEqual(
      [
        [alice.id, "FOLLOWED_POST_COMMENT"],
        [bob.id, "REPLY_COMMENT"],
      ].sort(),
    );
  });

  test("notifyFollowedPost off and unfollow both stop it", async () => {
    await callerFor(bob.id).social.followPost({ postId, on: true });
    await adminDb
      .update(user)
      .set({ notifyFollowedPost: false })
      .where(eq(user.id, bob.id));
    await callerFor(alice.id).social.followPost({ postId, on: false });
    const { id: c1 } = await callerFor(carol.id).comment.create({
      postId,
      body: "top",
    });
    await callerFor(carol.id).comment.create({
      postId,
      parentId: c1,
      body: "self reply",
    });
    // alice still gets the direct REPLY_POST; no follower notifications.
    expect((await notes()).map((r) => r.type)).toEqual(["REPLY_POST"]);
  });

  test("can't follow another university's post", async () => {
    const other = await makeUser((await makeUniversity()).id);
    await expect(
      callerFor(other.id).social.followPost({ postId, on: true }),
    ).rejects.toThrow();
  });
});
