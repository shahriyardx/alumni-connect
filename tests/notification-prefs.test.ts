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

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId, { createdAt: old });
  bob = await makeUser(uniId, { createdAt: old });
});

describe("notification prefs gate notification creation", () => {
  test("notifyReplyPost off suppresses REPLY_POST", async () => {
    await adminDb
      .update(user)
      .set({ notifyReplyPost: false })
      .where(eq(user.id, alice.id));
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "A question nobody will be told about",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({ postId, body: "an answer" });
    expect(await adminDb.select().from(notification)).toEqual([]);
  });

  test("notifyReplyComment off suppresses REPLY_COMMENT", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "A question with a thread",
      body: "b",
      tags: [],
    });
    const { id: c1 } = await callerFor(bob.id).comment.create({
      postId,
      body: "top level",
    });
    await adminDb
      .update(user)
      .set({ notifyReplyComment: false })
      .where(eq(user.id, bob.id));
    await callerFor(alice.id).comment.create({
      postId,
      parentId: c1,
      body: "a reply to bob",
    });
    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "REPLY_COMMENT"));
    expect(rows).toEqual([]);
  });

  test("notifyAcceptedAnswer off suppresses ACCEPTED_ANSWER", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Who can help with this",
      body: "b",
      tags: [],
    });
    const { id: commentId } = await callerFor(bob.id).comment.create({
      postId,
      body: "I can help",
    });
    await adminDb
      .update(user)
      .set({ notifyAcceptedAnswer: false })
      .where(eq(user.id, bob.id));
    await callerFor(alice.id).post.accept({ postId, commentId });
    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "ACCEPTED_ANSWER"));
    expect(rows).toEqual([]);
  });

  test("announcement fan-out respects notifyAnnouncements", async () => {
    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    await adminDb
      .update(user)
      .set({ notifyAnnouncements: false })
      .where(eq(user.id, bob.id));
    await callerFor(staff.id).post.create({
      title: "Everyone should read this",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const rows = await adminDb
      .select({ userId: notification.userId })
      .from(notification)
      .where(eq(notification.type, "ANNOUNCEMENT"));
    expect(rows.map((r) => r.userId)).toEqual([alice.id]);
  });

  test("notifyFollowedTag off suppresses FOLLOWED_TAG_POST even if still following", async () => {
    await callerFor(bob.id).social.followTag({ tag: "career", on: true });
    await adminDb
      .update(user)
      .set({ notifyFollowedTag: false })
      .where(eq(user.id, bob.id));
    await callerFor(alice.id).post.create({
      title: "Career advice thread",
      body: "b",
      tags: ["career"],
    });
    expect(await adminDb.select().from(notification)).toEqual([]);
  });

  test("FOLLOWED_TAG_POST fan-out excludes a non-ACTIVE follower, like the announcement fan-out does", async () => {
    await callerFor(bob.id).social.followTag({ tag: "career", on: true });
    await adminDb
      .update(user)
      .set({ status: "SUSPENDED" })
      .where(eq(user.id, bob.id));
    await callerFor(alice.id).post.create({
      title: "Career advice for active users only",
      body: "b",
      tags: ["career"],
    });
    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "FOLLOWED_TAG_POST"));
    expect(rows).toEqual([]);
  });

  test("per-tag bell: following muted (notify: false) suppresses FOLLOWED_TAG_POST; re-enabling fires it", async () => {
    await callerFor(bob.id).social.followTag({
      tag: "career",
      on: true,
      notify: false,
    });
    await callerFor(alice.id).post.create({
      title: "Career advice thread one",
      body: "b",
      tags: ["career"],
    });
    expect(await adminDb.select().from(notification)).toEqual([]);

    await callerFor(bob.id).social.followTag({
      tag: "career",
      on: true,
      notify: true,
    });
    await callerFor(alice.id).post.create({
      title: "Career advice thread two",
      body: "b",
      tags: ["career"],
    });
    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "FOLLOWED_TAG_POST"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: bob.id });
  });
});

describe("notification.prefs / updatePrefs", () => {
  test("defaults are all-on; update round-trips", async () => {
    const c = callerFor(alice.id);
    expect(await c.notification.prefs()).toEqual({
      notifyReplyPost: true,
      notifyReplyComment: true,
      notifyAnnouncements: true,
      notifyFollowedTag: true,
      notifyAcceptedAnswer: true,
      notifyFollowedPost: true,
    });
    await c.notification.updatePrefs({
      notifyReplyPost: false,
      notifyReplyComment: true,
      notifyAnnouncements: true,
      notifyFollowedTag: true,
      notifyAcceptedAnswer: true,
      notifyFollowedPost: true,
    });
    expect(await c.notification.prefs()).toMatchObject({
      notifyReplyPost: false,
    });
  });
});
