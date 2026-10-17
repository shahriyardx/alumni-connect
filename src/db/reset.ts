// Shared truncate list for anything that needs a clean slate as superuser
// (tests/helpers.ts resetDb, src/db/seed.ts) — bypasses RLS, so the caller
// must be connected via DATABASE_ADMIN_URL.
import { type SQL, sql } from "drizzle-orm";

export async function truncateAll(db: {
  execute: (query: SQL) => Promise<unknown>;
}) {
  await db.execute(sql`
    truncate university, "user", session, account, verification, rate_limit, pending_signup,
      roster_entry, post, comment, tag, post_tag, vote, bookmark, follow_user, follow_tag,
      notification, attachment, report, batch, invite, department restart identity cascade`);
  // audit_log/platform_audit: trigger blocks DELETE but TRUNCATE skips row triggers; superuser may truncate.
  await db.execute(sql`truncate audit_log, platform_audit`);
}
