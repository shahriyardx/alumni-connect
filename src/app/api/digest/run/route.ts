import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { notification, user } from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "@/server/mail";

// Cross-tenant by nature (every opted-in user, every university), so this
// connects as the Postgres superuser and bypasses RLS — same pattern as
// src/db/seed.ts / src/db/reset.ts. Cached across hot reloads like the main
// pool in src/db/index.ts.
const g = globalThis as unknown as { pgDigest?: postgres.Sql };
const adminClient =
  g.pgDigest ??
  postgres(env.DATABASE_ADMIN_URL, { max: 2, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") g.pgDigest = adminClient;
const adminDb = drizzle(adminClient, { schema });

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS: Record<"daily" | "weekly", number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

const TYPE_LABEL: Record<string, string> = {
  REPLY_POST: "replied to your post",
  REPLY_COMMENT: "replied to your comment",
  FOLLOWED_USER_POST: "posted something new",
  FOLLOWED_TAG_POST: "new post in a tag you follow",
  ANNOUNCEMENT: "posted an announcement",
  ACCEPTED_ANSWER: "accepted your answer",
};

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function secretOk(given: string | null): boolean {
  if (!env.DIGEST_SECRET || !given) return false;
  return timingSafeEqual(sha256(given), sha256(env.DIGEST_SECRET));
}

export type DigestResult =
  | { ok: true; checked: number; sent: number }
  | { ok: false; status: 401 | 404 };

/**
 * Sends each opted-in user (`emailDigest: "daily" | "weekly"`) a digest of
 * their unread notifications since `lastDigestAt`, when their chosen period
 * has elapsed — so an external scheduler can call this as often as it likes
 * (e.g. hourly) and each user still only gets mail on their own cadence.
 * Only updates `lastDigestAt` when mail actually goes out, so an empty
 * check this run doesn't block a real digest once new notifications land.
 */
export async function runDigest(secret: string | null): Promise<DigestResult> {
  if (!env.DIGEST_SECRET) return { ok: false, status: 404 };
  if (!secretOk(secret)) return { ok: false, status: 401 };

  const now = new Date();
  const subscribers = await adminDb
    .select({
      id: user.id,
      email: user.email,
      emailDigest: user.emailDigest,
      lastDigestAt: user.lastDigestAt,
    })
    .from(user)
    .where(inArray(user.emailDigest, ["daily", "weekly"]));

  let sent = 0;
  for (const sub of subscribers) {
    const period = PERIOD_MS[sub.emailDigest as "daily" | "weekly"];
    const due =
      !sub.lastDigestAt || now.getTime() - sub.lastDigestAt.getTime() >= period;
    if (!due) continue;

    const since = sub.lastDigestAt ?? new Date(0);
    const items = await adminDb
      .select({ type: notification.type, createdAt: notification.createdAt })
      .from(notification)
      .where(
        and(
          eq(notification.userId, sub.id),
          isNull(notification.readAt),
          gt(notification.createdAt, since),
        ),
      )
      .orderBy(asc(notification.createdAt));
    if (items.length === 0) continue;

    const lines = items.map(
      (i) => `- ${TYPE_LABEL[i.type] ?? i.type} (${i.createdAt.toISOString()})`,
    );
    await sendMail(
      sub.email,
      `Your Alumni Connect digest (${items.length} update${items.length === 1 ? "" : "s"})`,
      lines.join("\n"),
    );
    await adminDb
      .update(user)
      .set({ lastDigestAt: now })
      .where(eq(user.id, sub.id));
    sent++;
  }

  return { ok: true, checked: subscribers.length, sent };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const given = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const result = await runDigest(given);
  if (!result.ok) {
    return new Response(result.status === 404 ? "Not found" : "Unauthorized", {
      status: result.status,
    });
  }
  return Response.json({ checked: result.checked, sent: result.sent });
}
