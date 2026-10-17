# Task P2 report: super admin panel

Status: DONE_WITH_CONCERNS
Branch: worktree-agent-afacad26904fd847a
Commits:
- e08e9b6 feat(platform): super admin panel with overview, universities, users, audit, admins and broadcast
- 2753b98 fix(platform): singular role labels, admin row layout at 390px

## What was built

### Data (migration `drizzle/0011_platform_panel.sql`, the controller renumbers it)
- `broadcast` table: global, no RLS. Holds title, body, actor, recipients and created_at.
- `platform_audit` table: global, no RLS. `audit_log.university_id` is NOT NULL and has RLS, so it can't hold platform rows. The new table reuses the `forbid_audit_change` trigger, so it is append-only too.
- `notification.actor_id` is now nullable, plus a new `notification.broadcast_id` column (FK to broadcast, on delete cascade). The new type is `PLATFORM_ANNOUNCEMENT`.
- `UNIVERSITY_STATUSES` gains `SUSPENDED`. It is a text column with no check constraint, so this needs no DDL.
- Two SECURITY DEFINER functions, owned by the migration role and EXECUTE granted to app_user only:
  - `platform_content_counts()`: post and comment counts across tenants.
  - `platform_broadcast(uuid)`: the single INSERT..SELECT fan-out.

  The app keeps running as app_user under RLS, and only these two fixed queries cross tenants. Every other cross-university read follows the existing platform.ts pattern: plain `db` on the non-RLS `user` and `university` tables, plus `withTenant(uni)` for per-university tenant reads and writes (detail post count and last activity, tenant audit rows).
- `src/db/reset.ts` now truncates `platform_audit` as well.

### Router (`src/server/routers/platform.ts`, everything is platformProcedure)
- New procedures: overview, university, suspend, reactivate, transferOwnership, users, setBanned, audit, admins, addAdmin, removeAdmin, broadcast, broadcasts. The existing universities, approve, reject and createUniversity stay.
- approve, reject and create now also write a `platform_audit` row, as well as the tenant audit row they already wrote.
- Suspend only works on an ACTIVE university, and reactivate only on a SUSPENDED one. Both use a guarded UPDATE so concurrent calls fail cleanly. Suspend is refused when any platform admin (env-listed or with a platform_admin row) belongs to that university. Without this, suspending NUB would lock the env admin out of /platform, because platformProcedure runs activeStatusError.
- Transfer reuses the workspace logic. I extracted it into `transferOwner()` in `src/server/university.ts`, and `workspace.transferOwnership` now calls the same helper.
- Ban/unban sets BANNED (and deletes sessions on ban) or ACTIVE. It writes a tenant audit row (`user.status`, `by: platform`) and a platform audit row (`user.ban` / `user.unban`). Env admins, platform_admin rows and university-less accounts are refused.
- Admins:
  - `admins` lists env admins first, marked `fromEnv`, then the platform_admin rows.
  - `addAdmin` needs an existing verified account and rejects anyone who is already an admin.
  - `removeAdmin` refuses yourself, env-listed emails and the last verified admin. The check runs under `lockPlatformAdmin`.
- Broadcast runs in one transaction:
  1. Insert the broadcast row.
  2. Call `platform_broadcast()`, which inserts one notification per ACTIVE, verified member of every ACTIVE university.
  3. Store the recipient count.
  4. Publish one `pg_notify` per ACTIVE university.
  5. Write the audit row.

### SUSPENDED touchpoints
- `activeStatusError`: returns "University is suspended". It covers memberProcedure, platformProcedure, /api/events and /api/files.
- The sign-up hook in `auth.ts` refuses invites into SUSPENDED as well as REJECTED universities.
- The sign-up list (`auth.universities`) and `startSignup` already filter on ACTIVE, so no change was needed.
- `StatusGate` shows a "University suspended" screen.
- The workspace settings panel status map has a SUSPENDED line. The workspace banner only covers PENDING, and StatusGate blocks suspended members before it shows.

### Live event
`/api/events` now treats a notification event with no userId as "everyone in this university". `LiveEvent.userId` is documented accordingly.

### Notifications page
`notification.list` left-joins the actor and the broadcast. PLATFORM_ANNOUNCEMENT renders with an "Alumni Connect" badge, the title and body, and a campaign icon in place of an avatar.

### UI (`src/app/(platform)/platform/*`, `src/components/platform/platform-shell.tsx`)
- The sidebar and phone sheet shell copies workspace-shell's look, with the Universities row showing a pending count badge. I didn't edit workspace-shell itself, to stay out of F2/F4's way. Only `PageHeader` is imported from it.
- Pages:
  - Overview: bento tiles and 30 CSS bars with a table fallback.
  - Universities: search, four status tabs (`?status=` presets the tab), rows link to the detail page.
  - Detail: details, member counts, and actions (transfer dialog with member search and radio picker, suspend/reactivate with confirm).
  - Users: search, rows that wrap at 390px, ban/unban with confirm.
  - Audit: action select, from/to native date inputs, readable labels.
  - Admins: add by email, remove with confirm, "from .env" chip.
  - Broadcast: compose with a confirm step, list of past broadcasts.

## Tests
- New file `tests/platform-panel.test.ts` with 11 tests:
  - role gate: all 14 procedures refused for a member, a university OWNER, an unverified user and an unverified platform_admin row; logged out gets UNAUTHORIZED
  - overview counts and detail
  - suspend blocks members, hides the university from sign-up, reactivate restores it, both audited
  - suspend refused for a university with a platform admin
  - platform transfer, plus the workspace transfer through the shared helper
  - search, ban/unban, sessions deleted, admins unbannable
  - admins add/list/remove with the self/env/last rules
  - broadcast fan-out (ACTIVE universities and ACTIVE verified users only; suspended university, PENDING, BANNED and unverified users all excluded) and how notification.list renders it
  - audit filters
- Shared alumni_test: platform-panel.test.ts passed 11/11 early on. Full runs on alumni_test failed massively (deadlocks and 5s lock timeouts) while F-agents ran their suites at the same time, so they aren't usable as a signal.
- Full suite on a private throwaway DB (alumni_p2_test, dropped afterwards): **266 pass, 0 fail** (19 files).
- `bun run lint` is clean. `bunx tsc --noEmit` is clean. `bun run build` is clean, and lists all 7 /platform routes.

## Screenshots
43 files named `p2-*.png` in the scratchpad (`/tmp/claude-1000/-home-shahriyar-dev-apps-alumni-connect/5992cac0-2830-4cf1-b086-64ddc74bb88d/scratchpad/`):
- overview, universities, detail, detail-suspended, users, admins, broadcast, audit, notification and suspended-member, each at 1280 and 390 in dark and light
- transfer dialog at 1280 only
- phone menu at 390 light

They were taken on a throwaway `alumni_p2` with `next start -p 4000`. The DB has been dropped and the server stopped.

## Deviations
- The notification type is `PLATFORM_ANNOUNCEMENT`, uppercase like every other NOTIFICATION_TYPES value. The brief wrote "platform_announcement".
- Audit action names: `broadcast.send`, `admin.add`, `admin.remove`, `user.ban`, `user.unban`, `university.suspend` and `university.reactivate`. Transfer reuses `owner.transfer`.
- Universities search is client-side over the list, which already returns every university.
- `escapeLike` in admin.ts is now exported, a one-word change.

## Concerns
1. **Migration order on the shared alumni_test:** another agent had already applied a migration with a later journal `when` than mine, so drizzle silently skipped mine. I bumped my `when` to 1792234872316 so it applies. The same thing can happen whenever migrations generated in parallel are merged; the controller's renumbering should keep the `when` values ascending.
2. **Last-admin rule can't be reached from outside:** the remover is always a verified admin who isn't the target, so the "last admin" check (kept as defense in depth) can never fire from the API. The test therefore covers it through the self-removal refusal.
3. **Logo shows only "Uploaded" or "None":** `/api/files` only serves the caller's own tenant, so a super admin can't fetch another university's logo. F4 owns logos and may change this.
4. **Other-agent areas touched with trivial glue:**
   - `settings-panel.tsx`: one SUSPENDED line.
   - `workspace.ts`: transferOwnership now calls the helper.
   - `admin.ts`: export of escapeLike.
   - `notifications-view.tsx` and `notification.ts`: F1 may also touch these.
5. **Cost of the Universities badge:** the sidebar badge reuses the overview query, so every platform page runs the overview aggregate once (cached by react-query).
