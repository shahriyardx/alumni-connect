import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { runDigest } from "@/app/api/digest/run/route";
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
  test("defaults are all-on, digest off; update round-trips", async () => {
    const c = callerFor(alice.id);
    expect(await c.notification.prefs()).toEqual({
      notifyReplyPost: true,
      notifyReplyComment: true,
      notifyAnnouncements: true,
      notifyFollowedTag: true,
      notifyAcceptedAnswer: true,
      emailDigest: "off",
    });
    await c.notification.updatePrefs({
      notifyReplyPost: false,
      notifyReplyComment: true,
      notifyAnnouncements: true,
      notifyFollowedTag: true,
      notifyAcceptedAnswer: true,
      emailDigest: "daily",
    });
    expect(await c.notification.prefs()).toMatchObject({
      notifyReplyPost: false,
      emailDigest: "daily",
    });
  });
});

describe("POST /api/digest/run", () => {
  test("refuses a bad secret", async () => {
    expect(await runDigest("not-the-secret")).toEqual({
      ok: false,
      status: 401,
    });
    expect(await runDigest(null)).toEqual({ ok: false, status: 401 });
  });

  test("sends only to opted-in users, and only new items since last digest", async () => {
    await adminDb
      .update(user)
      .set({ emailDigest: "daily" })
      .where(eq(user.id, alice.id));
    // bob stays "off" — must not receive anything.
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Question for bob",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({ postId, body: "first reply" });

    const r1 = await runDigest("test-digest-secret");
    expect(r1).toMatchObject({ ok: true, sent: 1 });
    const [aliceAfter1] = await adminDb
      .select({ lastDigestAt: user.lastDigestAt })
      .from(user)
      .where(eq(user.id, alice.id));
    expect(aliceAfter1.lastDigestAt).not.toBeNull();

    // Calling again immediately: daily period hasn't elapsed, so no re-send
    // even though nothing was marked read.
    const r2 = await runDigest("test-digest-secret");
    expect(r2).toMatchObject({ ok: true, sent: 0 });

    // Force the period to look elapsed again: a fresh notification since
    // the (forced) last digest triggers exactly one more send to alice.
    await adminDb
      .update(user)
      .set({ lastDigestAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(user.id, alice.id));
    await callerFor(bob.id).comment.create({ postId, body: "second reply" });
    const r3 = await runDigest("test-digest-secret");
    expect(r3).toMatchObject({ ok: true, sent: 1 });
  });

  test("two concurrent runs send exactly one digest per user (no double-send race)", async () => {
    await adminDb
      .update(user)
      .set({ emailDigest: "daily" })
      .where(eq(user.id, alice.id));
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Question for bob, racily digested",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({ postId, body: "a reply" });

    const [r1, r2] = await Promise.all([
      runDigest("test-digest-secret"),
      runDigest("test-digest-secret"),
    ]);
    const totalSent = (r1.ok ? r1.sent : 0) + (r2.ok ? r2.sent : 0);
    expect(totalSent).toBe(1);
  });

  test("tenant isolation: opted-in users in different universities both get digested in one call", async () => {
    const uniB = (await makeUniversity()).id;
    const carol = await makeUser(uniId, {
      createdAt: old,
      emailDigest: "daily",
    });
    const dave = await makeUser(uniB, { createdAt: old, emailDigest: "daily" });
    const daveFriend = await makeUser(uniB, { createdAt: old });

    const { id: postId } = await callerFor(carol.id).post.create({
      title: "Question from carol",
      body: "b",
      tags: [],
    });
    await callerFor(alice.id).comment.create({ postId, body: "reply" });

    const { id: postIdB } = await callerFor(dave.id).post.create({
      title: "Question from dave",
      body: "b",
      tags: [],
    });
    await callerFor(daveFriend.id).comment.create({
      postId: postIdB,
      body: "reply",
    });

    const r = await runDigest("test-digest-secret");
    expect(r).toMatchObject({ ok: true, sent: 2 });
  });
});
