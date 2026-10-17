import { sql } from "drizzle-orm";

/**
 * AND this into the WHERE clause of any raw
 * `insert into notification (...) select ... from "user" where ...` fan-out
 * to skip users who turned off ANNOUNCEMENT notifications
 * (`user.notify_announcements`, boolean, default true).
 *
 * Used by the per-tenant ANNOUNCEMENT fan-out in `post.ts`. The platform-wide
 * "platform_announcement" broadcast (P2, not yet merged) selects from the
 * same `user` table across tenants — AND this same fragment into that
 * fan-out's WHERE clause once it lands.
 */
export const ANNOUNCEMENTS_PREF_SQL = sql`notify_announcements = true`;
