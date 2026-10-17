import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { tag } from "@/db/schema";
import { type LiveEvent, subscribe } from "@/server/events";
import {
  adminDb,
  callerFor,
  makePost,
  makeUniversity,
  makeUser,
  postUpload,
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
  ).rejects.toThrow(/your own post/);
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
    { name: "career-advice", notify: true },
  ]);
});

test("follow tag: the bell's mute state keeps the follow but turns off notify", async () => {
  await callerFor(bob.id).social.followTag({
    tag: "career",
    on: true,
    notify: false,
  });
  expect(await callerFor(bob.id).social.followedTags()).toEqual([
    { name: "career", notify: false },
  ]);
  // Re-following flips notify back on without creating a duplicate row.
  await callerFor(bob.id).social.followTag({ tag: "career", on: true });
  expect(await callerFor(bob.id).social.followedTags()).toEqual([
    { name: "career", notify: true },
  ]);
});

test("unfollowing a tag nobody follows does not create it", async () => {
  const res = await callerFor(bob.id).social.followTag({
    tag: "never-created",
    on: false,
  });
  expect(res).toEqual({ following: false });
  const rows = await adminDb
    .select()
    .from(tag)
    .where(eq(tag.name, "never-created"));
  expect(rows).toEqual([]);
});

test("votes on a comment", async () => {
  const p = await makePost(uniId, alice.id);
  const c = await callerFor(alice.id).comment.create({
    postId: p.id,
    body: "hi",
  });
  expect(
    await callerFor(bob.id).social.vote({
      targetType: "COMMENT",
      targetId: c.id,
      value: 1,
    }),
  ).toEqual({ score: 1, myVote: 1 });
  await expect(
    callerFor(alice.id).social.vote({
      targetType: "COMMENT",
      targetId: c.id,
      value: 1,
    }),
  ).rejects.toThrow(/your own comment/);
});

test("voting on an announcement is refused", async () => {
  const staff = await makeUser(uniId, { role: "STAFF" });
  const { id } = await callerFor(staff.id).post.create({
    title: "No voting on this",
    body: "b",
    kind: "ANNOUNCEMENT",
    tags: [],
  });
  await expect(
    callerFor(alice.id).social.vote({
      targetType: "POST",
      targetId: id,
      value: 1,
    }),
  ).rejects.toThrow(/announcement/);
});

test("vote on a deleted post is NOT_FOUND", async () => {
  const p = await makePost(uniId, alice.id);
  await callerFor(alice.id).post.remove({ id: p.id });
  await expect(
    callerFor(bob.id).social.vote({
      targetType: "POST",
      targetId: p.id,
      value: 1,
    }),
  ).rejects.toThrow(/NOT_FOUND/);
});

test("vote on a comment under a deleted post is NOT_FOUND", async () => {
  const p = await makePost(uniId, alice.id);
  const c = await callerFor(alice.id).comment.create({
    postId: p.id,
    body: "hi",
  });
  await callerFor(alice.id).post.remove({ id: p.id });
  await expect(
    callerFor(bob.id).social.vote({
      targetType: "COMMENT",
      targetId: c.id,
      value: 1,
    }),
  ).rejects.toThrow(/NOT_FOUND/);
});

test("concurrent votes don't lose updates", async () => {
  const p = await makePost(uniId, alice.id);
  const voters = await Promise.all(
    Array.from({ length: 10 }, () => makeUser(uniId)),
  );
  await Promise.all(
    voters.map((v) =>
      callerFor(v.id).social.vote({
        targetType: "POST",
        targetId: p.id,
        value: 1,
      }),
    ),
  );
  const after = await callerFor(alice.id).post.byId({ id: p.id });
  expect(after.score).toBe(10);
});

test("notification.list hides the title of a deleted post", async () => {
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  const p = await callerFor(alice.id).post.create({
    title: "Will be removed",
    body: "b",
    tags: [],
  });
  await callerFor(alice.id).post.remove({ id: p.id });
  const list = await callerFor(bob.id).notification.list({});
  expect(list.items[0].post).toBeNull();
});

test("markRead only touches my own notifications", async () => {
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  await callerFor(carol.id).social.followUser({ userId: alice.id, on: true });
  await callerFor(alice.id).post.create({
    title: "Notify everyone please",
    body: "b",
    tags: [],
  });
  const carolNotif = (await callerFor(carol.id).notification.list({})).items[0];
  await callerFor(bob.id).notification.markRead({ ids: [carolNotif.id] });
  expect(await callerFor(carol.id).notification.unreadCount()).toBe(1);
});

test("profile.setAvatar requires an owned, avatar-kind attachment", async () => {
  const me = callerFor(bob.id);
  const png = new Uint8Array([137, 80, 78, 71]);

  const avatar = await me.files.createUpload({
    kind: "avatar",
    ext: "png",
    size: png.length,
  });
  await postUpload(avatar, png);
  const avatarAtt = await me.files.confirm({ key: avatar.key });

  const file = await me.files.createUpload({
    kind: "attachment",
    ext: "png",
    size: png.length,
  });
  await postUpload(file, png);
  const fileAtt = await me.files.confirm({ key: file.key });

  // Wrong kind: a non-avatar attachment, even though bob owns it.
  await expect(me.profile.setAvatar({ key: fileAtt.key })).rejects.toThrow(
    /NOT_FOUND/,
  );
  // Right kind, wrong owner.
  await expect(
    callerFor(alice.id).profile.setAvatar({ key: avatarAtt.key }),
  ).rejects.toThrow(/NOT_FOUND/);
  // Owner + correct kind succeeds.
  expect(await me.profile.setAvatar({ key: avatarAtt.key })).toEqual({
    ok: true,
  });
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
  expect(
    got.some(
      (e) =>
        e.kind === "post" &&
        e.universityId === uniId &&
        e.authorId === alice.id,
    ),
  ).toBe(true);
  expect(
    got.some((e) => e.kind === "notification" && e.userId === bob.id),
  ).toBe(true);
});
