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

## Fix round 1

Commit: 3db7e2f fix(platform): serialize owner transfers, protect platform admins from tenant moderation, restore pre-ban status, lock admin checks

1. **Owner transfer race.** `transferOwner()` in `src/server/university.ts` now starts with `SELECT … FROM university WHERE id = $1 FOR UPDATE`. Both the platform and the workspace transfer go through this helper, so they serialize; the second one then re-reads the target and the current OWNER inside the lock.
   - Test: in each of 3 rounds, two platform transfers and one workspace transfer run concurrently, and exactly one OWNER remains.
   - RED: with the lock removed the test failed (Expected length 1, Received 2). GREEN with the lock.
2. **Tenant moderation can't touch platform admins.**
   - New `assertNotPlatformAdmin(tx, userId)` and `platformAdminWhere()` in `src/server/super-admin.ts`. platform.ts now uses this shared filter in place of its local `adminFilter`.
   - The check is called in `moderation.setUserStatus`, in the user branch of `moderation.resolve` (report → suspend/ban) and in `admin.setRole`. It refuses with FORBIDDEN "Platform admins can't be moderated here".
   - Test: a university OWNER can't ban, suspend or re-role the env admin or a platform_admin row user.
3. **Unban restores the previous status.**
   - New column `user.status_before_ban`, added to my unmerged `0011_platform_panel.sql` with no drizzle/meta change, per the instruction.
   - Ban stores the current status (and leaves `suspended_until` as it was). Unban restores `coalesce(status_before_ban, 'ACTIVE')` and clears the column.
   - Both directions are a guarded UPDATE (`status <> 'BANNED'` / `= 'BANNED'`), so a concurrent duplicate gets BAD_REQUEST.
   - Test: a banned PENDING applicant goes back to PENDING.
4. **setBanned UPDATE** is now keyed by `id` + `university_id`, like every other tenant user write. The target always has a university, since university-less accounts are refused earlier.
5. **Suspend's admin check** now runs inside the tenant tx, after `lockPlatformAdmin(tx)`.
   - `addAdmin` takes the same lock. It also refuses a member of a SUSPENDED or REJECTED university, which would otherwise lock that new admin out of /platform. That refusal is what gives the lock a purpose on this side.
   - Test: a suspended university's member can't be added as an admin.
6. **Mutual-removal race test:** two row admins (with no env admin present) remove each other concurrently, 3 rounds. Exactly one call succeeds and one admin remains.

Checks:
- Private `alumni_p2_test` DB (dropped afterwards): `bun test` gave **271 pass, 0 fail** (19 files). platform-panel.test.ts is 16/16.
- `bunx biome check src tests` is clean, `bunx tsc --noEmit` is clean, and `bun run build` compiled successfully.

Notes and concerns:
- Only a platform ban sets `status_before_ban`. If the platform bans someone, a tenant admin lifts it, and a tenant mod bans them again, a later platform unban would restore the stale stored status. This is narrow; the column is cleared on every platform unban.
- 0011's snapshot doesn't include `status_before_ban` because meta was left alone. The controller regenerates on merge.

## Fix round 2 (status_before_ban drift)

Commit: c1fb26b fix(platform): clear status_before_ban on every tenant status write; unban falls back by verification

- Every tenant path that writes `user.status` now sets `status_before_ban = NULL` in the same UPDATE. I found them with `grep update(user)` across src/server:
  - `moderation.setUserStatus`
  - the suspend and ban branches of `moderation.resolve`
  - approvals in `workspace.decide`
- Two other status writes are out of scope: reject in `workspace.decide` deletes the user, and the `auth.ts:264` write is on the university's status, not a user's.
- Platform unban now restores `coalesce(status_before_ban, case when email_verified then 'ACTIVE' else 'PENDING' end)`.
- Tests:
  - platform ban (snapshot SUSPENDED) → tenant unban → tenant ban → platform unban ends ACTIVE with a NULL snapshot. RED: without the setUserStatus clear it failed; GREEN with it.
  - With no snapshot, an unverified account is unbanned to PENDING.
- Checks on the private `alumni_p2_test` DB (dropped afterwards): **273 pass, 0 fail**. tsc and `biome check src tests` are clean, and the build compiled.
- This resolves the round-1 concern about a stale stored status.

## Fix round 3 (platform ban authority)

Commit: 8fc10cf fix(platform): platform_banned flag locks tenant status writes; unban restores snapshot or PENDING

- New column `user.platform_banned boolean NOT NULL DEFAULT false`, appended to my unmerged 0011 SQL with no meta change. Only `platform.setBanned` writes it.
- **Platform ban:** guarded on `platform_banned = false`. It sets status BANNED, `status_before_ban` = the current status (BANNED if a tenant already banned them), and `platform_banned = true`.
- **Platform unban:** guarded on `platform_banned = true`. It restores `coalesce(status_before_ban, 'PENDING')` (never ACTIVE) and clears both fields. Both directions are keyed by id + university_id.
- **Tenant paths** refuse with FORBIDDEN "Banned by the platform". Each reads the target row with `FOR UPDATE`, so a concurrent platform ban can't interleave:
  - `moderation.setUserStatus`
  - `moderation.resolve` (user branch: suspend/ban)
  - `admin.setRole`
- **`workspace.decide`** excludes platform-banned accounts from its pending target, so the result is NOT_FOUND. A platform-banned applicant is BANNED, not PENDING, anyway.
- Round 2's "tenant writes clear status_before_ban" change is reverted; `status_before_ban` is now platform-only.
- **UI:**
  - `admin.users` returns `platformBanned`. The workspace members list shows a "Banned by platform" pill in place of the status, and disables both the role select and the account-actions menu for that row.
  - The platform Users page bases Ban/Unban on `platformBanned`.
- **Tests** (these replace the round-2 tests):
  - A tenant OWNER and a moderator can't set ACTIVE, SUSPENDED or BANNED on a platform-banned user. The OWNER can't re-role them, can't approve a platform-banned applicant, and can't resolve a report on them with suspend. `admin.users` flags the account. RED: with the setUserStatus guard removed, this test failed.
  - Platform unban restores PENDING. With no snapshot it falls back to PENDING, not ACTIVE.
  - Tenant ban → platform ban → platform unban stays BANNED, and the tenant can then lift its own ban.
- **Checks** on the private `alumni_p2_test` DB (dropped afterwards): **274 pass, 0 fail**. `biome check src tests` and tsc are clean, and the build compiled.
- **Note:** the profile page's moderator status actions (account-status-actions.tsx) aren't disabled in the UI for a platform-banned user; the server refuses with a toast. The ruling's UI item named only the members list.
