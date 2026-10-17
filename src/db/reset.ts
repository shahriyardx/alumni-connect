// Shared truncate list for anything that needs a clean slate
// (tests/helpers.ts resetDb, src/db/seed.ts).
import { type SQL, sql } from "drizzle-orm";

export async function truncateAll(db: {
  execute: (query: SQL) => Promise<unknown>;
}) {
  await db.execute(sql`
    truncate university, "user", session, account, verification, rate_limit, pending_signup,
      roster_entry, post, comment, tag, post_tag, vote, bookmark, follow_user, follow_tag,
      notification, attachment, report, batch, invite, department restart identity cascade`);
  // audit_log/platform_audit: trigger blocks DELETE but TRUNCATE skips row triggers.
  await db.execute(sql`truncate audit_log, platform_audit`);
}
