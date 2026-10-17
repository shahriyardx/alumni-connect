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

describe("announcements", () => {
  test("staff can create an announcement, members cannot; members create questions, staff cannot", async () => {
    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    const { id } = await callerFor(staff.id).post.create({
      title: "Campus closed Friday",
      body: "Due to maintenance",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    expect((await callerFor(alice.id).post.byId({ id })).kind).toBe(
      "ANNOUNCEMENT",
    );

    await expect(
      callerFor(alice.id).post.create({
        title: "Can a student announce?",
        body: "b",
        kind: "ANNOUNCEMENT",
        tags: [],
      }),
    ).rejects.toThrow(/Only staff can post announcements/);

    await expect(
      callerFor(staff.id).post.create({
        title: "Can staff ask a question?",
        body: "b",
        kind: "QUESTION",
        tags: [],
      }),
    ).rejects.toThrow(/Staff can only post announcements/);

    // Default kind (no input) is QUESTION; a member can still ask normally.
    const q = await callerFor(alice.id).post.create({
      title: "A normal question",
      body: "b",
    });
    expect((await callerFor(bob.id).post.byId({ id: q.id })).kind).toBe(
      "QUESTION",
    );
  });

  test("post.announcements: newest first, tenant-isolated", async () => {
    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    const otherUniId = (await makeUniversity()).id;
    const staffB = await makeUser(otherUniId, {
      role: "STAFF",
      createdAt: old,
    });
    await callerFor(staffB.id).post.create({
      title: "B announcement",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const a1 = await callerFor(staff.id).post.create({
      title: "First announcement",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const a2 = await callerFor(staff.id).post.create({
      title: "Second announcement",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const res = await callerFor(alice.id).post.announcements({});
    expect(res.items.map((i) => i.id)).toEqual([a2.id, a1.id]);
  });

  test("feed kind filter", async () => {
    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    await callerFor(staff.id).post.create({
      title: "An announcement here",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    await callerFor(alice.id).post.create({
      title: "A regular question",
      body: "b",
      tags: [],
    });
    const announcements = await callerFor(bob.id).post.feed({
      kind: "ANNOUNCEMENT",
    });
    expect(announcements.items).toHaveLength(1);
    expect(announcements.items[0].kind).toBe("ANNOUNCEMENT");
    const questions = await callerFor(bob.id).post.feed({ kind: "QUESTION" });
    expect(questions.items).toHaveLength(1);
    expect(questions.items[0].kind).toBe("QUESTION");
  });

  test("feed unanswered filter: QUESTIONs with no comments, not deleted, tenant-scoped", async () => {
    await callerFor(
      (await makeUser(uniId, { role: "STAFF", createdAt: old })).id,
    ).post.create({
      title: "An announcement, not a question",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const answered = await callerFor(alice.id).post.create({
      title: "Answered question",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({
      postId: answered.id,
      body: "an answer",
    });
    const unanswered = await callerFor(alice.id).post.create({
      title: "Unanswered question",
      body: "b",
      tags: [],
    });
    const removed = await callerFor(alice.id).post.create({
      title: "Removed unanswered question",
      body: "b",
      tags: [],
    });
    await callerFor(alice.id).post.remove({ id: removed.id });
    const otherUser = await makeUser((await makeUniversity()).id, {
      createdAt: old,
    });
    await callerFor(otherUser.id).post.create({
      title: "Other tenant unanswered question",
      body: "b",
      tags: [],
    });

    const res = await callerFor(bob.id).post.feed({ unanswered: true });
    expect(res.items.map((i) => i.id)).toEqual([unanswered.id]);
  });

  test("creating an announcement notifies active students/alumni of the tenant only", async () => {
    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    const pending = await makeUser(uniId, {
      status: "PENDING",
      createdAt: old,
    });
    const otherStudent = await makeUser((await makeUniversity()).id, {
      createdAt: old,
    });

    const { id: postId } = await callerFor(staff.id).post.create({
      title: "Read this everyone",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });

    const rows = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.postId, postId));
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [alice.id, bob.id, alum.id].sort(),
    );
    expect(rows.every((r) => r.type === "ANNOUNCEMENT")).toBe(true);
    const recipientIds = rows.map((r) => r.userId);
    expect(recipientIds).not.toContain(staff.id);
    expect(recipientIds).not.toContain(pending.id);
    expect(recipientIds).not.toContain(otherStudent.id);
  });
});

describe("post.accept", () => {
  test("only the author can accept, and only on a QUESTION", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Which supervisor for ML thesis?",
      body: "b",
      tags: [],
    });
    const { id: commentId } = await callerFor(bob.id).comment.create({
      postId,
      body: "Try Dr. X",
    });

    await expect(
      callerFor(bob.id).post.accept({ postId, commentId }),
    ).rejects.toThrow(/FORBIDDEN/);

    const staff = await makeUser(uniId, { role: "STAFF", createdAt: old });
    const { id: annId } = await callerFor(staff.id).post.create({
      title: "Campus closed Friday",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const { id: annCommentId } = await callerFor(alice.id).comment.create({
      postId: annId,
      body: "noted",
    });
    await expect(
      callerFor(staff.id).post.accept({
        postId: annId,
        commentId: annCommentId,
      }),
    ).rejects.toThrow(/Only questions/);
  });

  test("the comment must belong to the post and not be deleted", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Post with a comment",
      body: "b",
      tags: [],
    });
    const other = await callerFor(alice.id).post.create({
      title: "A different post entirely",
      body: "b",
      tags: [],
    });
    const { id: otherComment } = await callerFor(bob.id).comment.create({
      postId: other.id,
      body: "wrong post",
    });
    await expect(
      callerFor(alice.id).post.accept({ postId, commentId: otherComment }),
    ).rejects.toThrow(/BAD_REQUEST/);

    const { id: deletedComment } = await callerFor(bob.id).comment.create({
      postId,
      body: "will be removed",
    });
    await callerFor(bob.id).comment.remove({ id: deletedComment });
    await expect(
      callerFor(alice.id).post.accept({ postId, commentId: deletedComment }),
    ).rejects.toThrow(/BAD_REQUEST/);
  });

  test("accept, un-accept, notifies the comment author, tenant-isolated", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Who can review my CV?",
      body: "b",
      tags: [],
    });
    const { id: commentId } = await callerFor(alum.id).comment.create({
      postId,
      body: "I can take a look",
    });

    // A comment id from another tenant: the tenant filter hides it, so this looks like
    // "no such comment" rather than leaking a FORBIDDEN/NOT_FOUND distinction.
    const otherUniId = (await makeUniversity()).id;
    const otherUser = await makeUser(otherUniId, { createdAt: old });
    const otherPost = await callerFor(otherUser.id).post.create({
      title: "Other tenant post",
      body: "b",
      tags: [],
    });
    const otherComment = await callerFor(otherUser.id).comment.create({
      postId: otherPost.id,
      body: "other tenant comment",
    });
    await expect(
      callerFor(alice.id).post.accept({
        postId,
        commentId: otherComment.id,
      }),
    ).rejects.toThrow(/BAD_REQUEST/);

    await callerFor(alice.id).post.accept({ postId, commentId });
    expect(
      (await callerFor(bob.id).post.byId({ id: postId })).acceptedCommentId,
    ).toBe(commentId);
    const notif = await adminDb
      .select()
      .from(notification)
      .where(eq(notification.type, "ACCEPTED_ANSWER"));
    expect(notif).toHaveLength(1);
    expect(notif[0]).toMatchObject({
      userId: alum.id,
      actorId: alice.id,
      postId,
      commentId,
    });

    await callerFor(alice.id).post.accept({ postId, commentId: null });
    expect(
      (await callerFor(bob.id).post.byId({ id: postId })).acceptedCommentId,
    ).toBeNull();
  });
});

describe("post.search filters", () => {
  test("tag, department, hasAlumniAnswer, solved, kind, date range, combined", async () => {
    const staff = await makeUser(uniId, {
      role: "STAFF",
      department: "Admin",
      createdAt: old,
    });
    const { id: annId } = await callerFor(staff.id).post.create({
      title: "Announce internship search deadline",
      body: "b",
      kind: "ANNOUNCEMENT",
      tags: [],
    });
    const cs = await makeUser(uniId, { department: "CSE", createdAt: old });
    const ee = await makeUser(uniId, { department: "EEE", createdAt: old });
    const solvedQ = await callerFor(cs.id).post.create({
      title: "Internship search tips for CSE",
      body: "b",
      tags: ["career"],
    });
    const { id: answerId } = await callerFor(alum.id).comment.create({
      postId: solvedQ.id,
      body: "Here is my advice",
    });
    await callerFor(cs.id).post.accept({
      postId: solvedQ.id,
      commentId: answerId,
    });

    const unsolvedQ = await callerFor(ee.id).post.create({
      title: "Internship search tips for EEE",
      body: "b",
      tags: ["career"],
    });
    await callerFor(bob.id).comment.create({
      postId: unsolvedQ.id,
      body: "no alumni reply here",
    });

    const otherUser = await makeUser((await makeUniversity()).id, {
      createdAt: old,
    });
    await callerFor(otherUser.id).post.create({
      title: "Internship search in another tenant",
      body: "b",
      tags: [],
    });

    const byTag = await callerFor(bob.id).post.search({
      q: "internship",
      tag: "career",
    });
    expect(byTag.items.map((i) => i.id).sort()).toEqual(
      [solvedQ.id, unsolvedQ.id].sort(),
    );

    const byDept = await callerFor(bob.id).post.search({
      q: "internship",
      department: "CSE",
    });
    expect(byDept.items.map((i) => i.id)).toEqual([solvedQ.id]);

    const byAlumni = await callerFor(bob.id).post.search({
      q: "internship",
      hasAlumniAnswer: true,
    });
    expect(byAlumni.items.map((i) => i.id)).toEqual([solvedQ.id]);

    const bySolved = await callerFor(bob.id).post.search({
      q: "internship",
      solved: true,
    });
    expect(bySolved.items.map((i) => i.id)).toEqual([solvedQ.id]);

    const byKind = await callerFor(bob.id).post.search({
      q: "internship",
      kind: "ANNOUNCEMENT",
    });
    expect(byKind.items.map((i) => i.title)).toEqual([
      "Announce internship search deadline",
    ]);

    const byRange = await callerFor(bob.id).post.search({
      q: "internship",
      range: "week",
    });
    expect(byRange.items.map((i) => i.id).sort()).toEqual(
      [solvedQ.id, unsolvedQ.id, annId].sort(),
    );

    const combined = await callerFor(bob.id).post.search({
      q: "internship",
      tag: "career",
      solved: true,
      hasAlumniAnswer: true,
      department: "CSE",
      kind: "QUESTION",
      range: "week",
    });
    expect(combined.items.map((i) => i.id)).toEqual([solvedQ.id]);

    // Solved posts rank slightly above an equally-matching unsolved one.
    expect(byTag.items[0]?.id).toBe(solvedQ.id);
  });
});

test("link gate matches what the markdown renderer turns into links", () => {
  const fresh = { createdAt: new Date() } as Me;
  for (const t of [
    "see [here](//evil.example)",
    "mail mailto:x@y.z",
    "ref style [click][1]\n\n[1]: //evil.example",
    "autolink <https://x.y>",
    "bare www.x.y works too",
    "![img](//evil.example/a.png)",
    "entity [x](&#104;ttps://evil.example)",
  ]) {
    expect(() => assertCanPostLinks(fresh, t)).toThrow(/links/);
  }
  for (const t of [
    "a/b // comment, no link",
    "plain question about CSE 101?",
  ]) {
    expect(() => assertCanPostLinks(fresh, t)).not.toThrow();
  }
});

describe("feed: most relevant", () => {
  test("ranks the viewer's department, followed authors and tags first", async () => {
    const me = await makeUser(uniId, { department: "EEE", createdAt: old });
    const sameDept = await makeUser(uniId, {
      department: "eee",
      createdAt: old,
    });
    const other = await makeUser(uniId, { department: "BBA", createdAt: old });
    const followed = await makeUser(uniId, {
      department: "LLB",
      createdAt: old,
    });
    await adminDb.insert(followUser).values({
      universityId: uniId,
      followerId: me.id,
      followeeId: followed.id,
    });
    // Created oldest-first, so "new" order is the reverse of relevance.
    const a = await callerFor(sameDept.id).post.create({
      title: "Same department question",
      body: "From my department",
      tags: [],
    });
    const b = await callerFor(followed.id).post.create({
      title: "From someone I follow",
      body: "Followed author",
      tags: [],
    });
    const c = await callerFor(other.id).post.create({
      title: "Unrelated and newest",
      body: "Another department",
      tags: [],
    });
    const feed = await callerFor(me.id).post.feed({ sort: "relevant" });
    const order = feed.items.map((p) => p.id);
    expect(order.indexOf(c.id)).toBeGreaterThan(order.indexOf(a.id));
    expect(order.indexOf(c.id)).toBeGreaterThan(order.indexOf(b.id));
  });
});
