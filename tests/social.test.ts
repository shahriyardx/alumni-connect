import { beforeEach, expect, test } from "bun:test";
import { type LiveEvent, subscribe } from "@/server/events";
import {
  callerFor,
  makePost,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

let uniId: string;
let alice: { id: string };
let bob: { id: string };
let carol: { id: string };
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId);
  bob = await makeUser(uniId);
  carol = await makeUser(uniId);
});

test("votes: up, change, clear, no self-vote", async () => {
  const p = await makePost(uniId, alice.id);
  expect(
    await callerFor(bob.id).social.vote({
      targetType: "POST",
      targetId: p.id,
      value: 1,
    }),
  ).toEqual({ score: 1, myVote: 1 });
  expect(
    (
      await callerFor(carol.id).social.vote({
        targetType: "POST",
        targetId: p.id,
        value: 1,
      })
    ).score,
  ).toBe(2);
  expect(
    (
      await callerFor(bob.id).social.vote({
        targetType: "POST",
        targetId: p.id,
        value: -1,
      })
    ).score,
  ).toBe(0);
  expect(
    (
      await callerFor(bob.id).social.vote({
        targetType: "POST",
        targetId: p.id,
        value: 0,
      })
    ).score,
  ).toBe(1);
  await expect(
    callerFor(alice.id).social.vote({
      targetType: "POST",
      targetId: p.id,
      value: 1,
    }),
  ).rejects.toThrow(/own/);
  expect((await callerFor(bob.id).post.byId({ id: p.id })).myVote).toBe(0);
});

test("bookmarks", async () => {
  const p = await makePost(uniId, alice.id);
  await callerFor(bob.id).social.bookmark({ postId: p.id, on: true });
  expect(
    (await callerFor(bob.id).social.bookmarks({})).items.map((i) => i.id),
  ).toEqual([p.id]);
  await callerFor(bob.id).social.bookmark({ postId: p.id, on: false });
  expect((await callerFor(bob.id).social.bookmarks({})).items).toEqual([]);
});

test("follow user + notifications read flow", async () => {
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  await expect(
    callerFor(bob.id).social.followUser({ userId: bob.id, on: true }),
  ).rejects.toThrow(/BAD_REQUEST/);
  await callerFor(alice.id).post.create({
    title: "Alice asks a question",
    body: "b",
    tags: [],
  });
  expect(await callerFor(bob.id).notification.unreadCount()).toBe(1);
  const list = await callerFor(bob.id).notification.list({});
  expect(list.items[0]).toMatchObject({
    type: "FOLLOWED_USER_POST",
    actor: { id: alice.id },
  });
  await callerFor(bob.id).notification.markRead({});
  expect(await callerFor(bob.id).notification.unreadCount()).toBe(0);
  const prof = await callerFor(bob.id).profile.get({ id: alice.id });
  expect(prof).toMatchObject({
    followers: 1,
    isFollowing: true,
    postCount: 1,
    isMe: false,
  });
});

test("follow tag", async () => {
  await callerFor(bob.id).social.followTag({ tag: "Career Advice", on: true });
  expect(await callerFor(bob.id).social.followedTags()).toEqual([
    "career-advice",
  ]);
});

test("live events are published on commit", async () => {
  const got: LiveEvent[] = [];
  const off = subscribe((e) => got.push(e));
  await new Promise((r) => setTimeout(r, 300)); // LISTEN connection warm-up
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  await callerFor(alice.id).post.create({
    title: "Live event post",
    body: "b",
    tags: [],
  });
  await new Promise((r) => setTimeout(r, 300));
  off();
  expect(got.some((e) => e.kind === "post" && e.universityId === uniId)).toBe(
    true,
  );
  expect(
    got.some((e) => e.kind === "notification" && e.userId === bob.id),
  ).toBe(true);
});
