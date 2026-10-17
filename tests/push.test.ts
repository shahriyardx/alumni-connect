import { beforeEach, describe, expect, test } from "bun:test";
import { pushSubscription } from "@/db/schema";
import { isPushEndpoint, sendPushes } from "@/server/push";
import {
  adminDb,
  callerFor,
  makeUniversity,
  makeUser,
  resetDb,
} from "./helpers";

const old = new Date(Date.now() - 10 * 86_400_000);
const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const keys = { p256dh: "BPkey", auth: "authkey" };

let uniId: string;
let alice: { id: string };
let bob: { id: string };

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId, { createdAt: old, name: "Alice" });
  bob = await makeUser(uniId, { createdAt: old, name: "Bob" });
});

const fakeSend = () => {
  const calls: { endpoint: string; payload: Record<string, string> }[] = [];
  const send = async (sub: { endpoint: string }, payload: string) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  };
  return { calls, send };
};

describe("web push", () => {
  test("only real push services are accepted as endpoints", async () => {
    expect(isPushEndpoint(endpoint("x"))).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpoint("https://evilfcm.googleapis.com.attacker.io/")).toBe(
      false,
    );
    await expect(
      callerFor(alice.id).push.subscribe({
        endpoint: "https://localhost/x",
        keys,
      }),
    ).rejects.toThrow("Unknown push service");
  });

  test("a reply is pushed once to the author's browser, with a link to the post", async () => {
    await callerFor(alice.id).push.subscribe({ endpoint: endpoint("a"), keys });
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Which elective is easiest?",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({ postId, body: "answer" });

    const { calls, send } = fakeSend();
    expect(
      await sendPushes({ universityId: uniId, userId: alice.id }, send),
    ).toBe(1);
    expect(calls[0]).toMatchObject({
      endpoint: endpoint("a"),
      payload: {
        title: "Bob replied to your question",
        body: "Which elective is easiest?",
        url: `/p/${postId}`,
      },
    });
    // Claimed: a second run (or a second server) sends nothing.
    expect(
      await sendPushes({ universityId: uniId, userId: alice.id }, send),
    ).toBe(0);
  });

  test("a gone subscription (410) is deleted; unsubscribe removes only your own", async () => {
    await callerFor(alice.id).push.subscribe({ endpoint: endpoint("a"), keys });
    const { id: postId } = await callerFor(alice.id).post.create({
      title: "Question for push test",
      body: "b",
      tags: [],
    });
    await callerFor(bob.id).comment.create({ postId, body: "answer" });
    await sendPushes({ universityId: uniId, userId: alice.id }, async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await adminDb.select().from(pushSubscription)).toEqual([]);

    await callerFor(alice.id).push.subscribe({ endpoint: endpoint("a"), keys });
    await callerFor(bob.id).push.unsubscribe({ endpoint: endpoint("a") });
    expect(await adminDb.select().from(pushSubscription)).toHaveLength(1);
    await callerFor(alice.id).push.unsubscribe({ endpoint: endpoint("a") });
    expect(await adminDb.select().from(pushSubscription)).toEqual([]);
  });

  test("the same browser moves to whoever signs in next", async () => {
    await callerFor(alice.id).push.subscribe({ endpoint: endpoint("a"), keys });
    await callerFor(bob.id).push.subscribe({ endpoint: endpoint("a"), keys });
    const rows = await adminDb.select().from(pushSubscription);
    expect(rows.map((r) => r.userId)).toEqual([bob.id]);
  });
});
