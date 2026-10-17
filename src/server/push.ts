import { eq, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { type NOTIFICATION_TYPES, pushSubscription } from "@/db/schema";
import { env } from "@/env";
import { subscribe } from "./events";

export const pushEnabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushEnabled)
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string,
  );

/**
 * The server POSTs to the endpoint, so only real browser push services are
 * accepted (no SSRF into the private network).
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];
export function isPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

type Claimed = {
  id: string;
  user_id: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  post_id: string | null;
  actor_name: string | null;
  post_title: string | null;
  b_title: string | null;
  b_body: string | null;
};

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

const HEAD: Record<Claimed["type"], (actor: string) => string> = {
  REPLY_POST: (a) => `${a} replied to your question`,
  REPLY_COMMENT: (a) => `${a} replied to your comment`,
  FOLLOWED_USER_POST: (a) => `${a} posted`,
  FOLLOWED_TAG_POST: () => "New post in a tag you follow",
  FOLLOWED_POST_COMMENT: (a) => `${a} commented on a post you follow`,
  ANNOUNCEMENT: (a) => `${a} posted an announcement`,
  ACCEPTED_ANSWER: (a) => `${a} accepted your answer`,
  PLATFORM_ANNOUNCEMENT: () => "Alumni Connect",
};

export function pushMessage(n: Claimed): PushMessage {
  const broadcast = n.type === "PLATFORM_ANNOUNCEMENT";
  return {
    title: broadcast
      ? (n.b_title ?? HEAD[n.type](""))
      : HEAD[n.type](n.actor_name ?? "Someone"),
    body: (broadcast ? n.b_body : n.post_title) ?? "",
    url: n.post_id ? `/p/${n.post_id}` : "/notifications",
    tag: n.id,
  };
}

type Send = (
  sub: webpush.PushSubscription,
  payload: string,
) => Promise<unknown>;
const defaultSend: Send = (sub, payload) =>
  webpush.sendNotification(sub, payload, { TTL: 3600 });

/**
 * Claims the fresh, unread, not-yet-pushed notifications of one user (or a
 * whole university, for a broadcast) and pushes each to every browser they
 * subscribed. The claim is one UPDATE, so several app instances never send
 * the same notification twice. Dead subscriptions (404/410) are deleted.
 */
export async function sendPushes(
  target: { universityId: string; userId?: string },
  send: Send = defaultSend,
) {
  const rows = await db.execute<Claimed>(sql`
    with claimed as (
      update notification n set pushed_at = now()
      from "user" u, university un
      where u.id = n.user_id and u.university_id = n.university_id
        and un.id = n.university_id
        -- Same gate as memberProcedure: only someone who could open the app now.
        and u.status = 'ACTIVE' and u.email_verified
        and un.status not in ('REJECTED', 'SUSPENDED')
        and n.university_id = ${target.universityId}
        and (${target.userId ?? null}::text is null or n.user_id = ${target.userId ?? null})
        and n.pushed_at is null and n.read_at is null
        and n.created_at > now() - interval '5 minutes'
        and exists (select 1 from push_subscription s where s.user_id = n.user_id)
      returning n.id, n.user_id, n.university_id, n.type, n.post_id, n.actor_id, n.broadcast_id
    )
    select c.id, c.user_id, c.type, c.post_id, a.name as actor_name,
      p.title as post_title, b.title as b_title, b.body as b_body
    from claimed c
    left join "user" a on a.id = c.actor_id and a.university_id = c.university_id
    left join post p on p.id = c.post_id and p.university_id = c.university_id
      and p.deleted_at is null
    left join broadcast b on b.id = c.broadcast_id
    -- A post deleted since: claimed, but never pushed (no title leaks).
    where c.post_id is null or p.id is not null`);
  if (rows.length === 0) return 0;

  const subs = await db
    .select()
    .from(pushSubscription)
    .where(
      inArray(pushSubscription.userId, [
        ...new Set(rows.map((r) => r.user_id)),
      ]),
    );
  let sent = 0;
  for (const n of rows) {
    const payload = JSON.stringify(pushMessage(n));
    for (const s of subs.filter((s) => s.userId === n.user_id)) {
      try {
        await send(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await db
            .delete(pushSubscription)
            .where(eq(pushSubscription.id, s.id));
        else console.error("[push]", code ?? e);
      }
    }
  }
  return sent;
}

const g = globalThis as unknown as { pushWorker?: boolean };
/** Started once per server (src/instrumentation.ts); rides the live-event channel. */
export function startPushWorker() {
  if (!pushEnabled || g.pushWorker) return;
  g.pushWorker = true;
  subscribe((e) => {
    if (e.kind !== "notification") return;
    sendPushes({ universityId: e.universityId, userId: e.userId }).catch(
      (err) => console.error("[push]", err),
    );
  });
}
