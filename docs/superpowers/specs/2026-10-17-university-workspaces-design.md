# University Workspaces — Design Spec

Date: 2026-10-17 · Extends `2026-10-16-alumni-connect-design.md` (still authoritative for anything not changed here).
Design direction: `docs/superpowers/plans/refs/design-minimal.md` (minimal bento, like the user's slash dashboard).

## User decisions (2026-10-17)
1. Platform admin can add universities. University representatives can also apply ("open an organization").
2. A rep's application is **approved by the platform admin** before it goes live.
3. Batches have a **batch number** (int, e.g. 42) **and a graduation year**. Students turn **Alumnus automatically** once the batch's graduation year has passed (`currentYear > graduationYear`).
4. Roster is uploaded **per batch** (admin picks/creates the batch, then uploads Excel `.xlsx` or CSV).
5. If a university/batch has no roster, students can still register (no roster check).
6. **Every student sign-up waits for Owner/Admin approval**, and the student **must upload a photo of their ID card** during sign-up. A roster match is shown to the approver as a hint, not an auto-approve.
7. Roles: **OWNER, ADMIN, MODERATOR, STAFF (faculty/staff), STUDENT, ALUMNUS**. Staff join by **email invite** (invite sets role + department).
8. Universities get a **workspace** (management dashboard) separate from the feed; staff can still use the feed.

## Controller rulings (user asleep; recorded in the SDD ledger)
- Platform admins = verified accounts whose email is listed in env `PLATFORM_ADMIN_EMAILS` (comma-separated). No new DB role. Default in `.env.example`: `admin@nub.ac.bd`.
- Any email domain is accepted for sign-up (already shipped). `university.email_domain` becomes optional/unused.
- ID card photos: private; viewable only by OWNER/ADMIN of that university (and platform admins for rep applications); deleted 30 days after the approve/reject decision (lazy purge when the approvals list is loaded — no cron).
- Raw student IDs stay unstored. For the approver, store a `studentIdHint` = last 4 characters of the normalized ID, to compare with the card.
- Reject = delete the pending account (and its card) so the person can re-apply; audited.
- `/admin` and `/mod` merge into `/workspace` (tabs gated by role); old URLs redirect.
- Alumnus promotion: lazily in `memberProcedure` (STUDENT with `graduationYear < currentYear` → ALUMNUS, one UPDATE) and in bulk when a batch's graduation year is saved.
- Excel parsing happens in the browser (`read-excel-file`), converted to the CSV text the server already validates. Server never parses xlsx.

## Data model changes
- `university`: + `status` (`PENDING|ACTIVE|REJECTED`, default ACTIVE for seeded/platform-created), + `logoKey`, + `website` (nullable); `email_domain` nullable.
- `user.role` enum: `OWNER | ADMIN | MODERATOR | STAFF | STUDENT | ALUMNUS`.
- `user`: rename `batch_year` → `graduation_year` (nullable for staff); + `batch_number` int nullable; + `title` text nullable (staff position); + `id_card_key` text nullable; + `roster_match` boolean nullable; + `student_id_hint` text nullable; + `decided_at` timestamp nullable. `department` nullable for OWNER/platform-created owners until set.
- New `batch` (RLS): id, university_id, number int, graduation_year int, created_at; unique(university_id, number); composite unique(id, university_id).
- `roster_entry`: + `batch_id` (composite FK to batch, cascade), drop `batch_year` and `graduated` (derived from batch). unique(university_id, student_id_hash) stays.
- `pending_signup`: + `batch_number`, `graduation_year` (replace batch_year), + `signup_token_hash`, + `id_card_key`, + `roster_match`, + `student_id_hint`, + `title`; role may be OWNER/ADMIN/MODERATOR/STAFF (invites, rep applications) or STUDENT/ALUMNUS.
- New `invite` (RLS): id, university_id, email, role (`OWNER|ADMIN|MODERATOR|STAFF`; OWNER invites only from /platform), department, title, token_hash (unique), invited_by, expires_at (7 days), accepted_at; composite FKs.
- Migrations are new files; existing data migrated (`batch_year` → `graduation_year`, roster rows get a batch per distinct year).

## Flows
- **Rep application** (`/register-university`, public): university name, website (optional), rep name, title, email, password → `university` PENDING + pending_signup(role OWNER, status PENDING) → better-auth sign-up → email OTP → account PENDING. Platform admin approves on `/platform` → university ACTIVE + owner ACTIVE (rejected → university REJECTED, owner deleted). Both audited.
- **Platform admin** (`/platform`): list universities by status with counts; approve/reject applications; create a university directly (ACTIVE) and invite its OWNER by email (invite with role OWNER — allowed only from platform).
- **Invite accept** (`/invite/[token]`, public): shows university + role; name + password (email fixed) → pending_signup from invite (status ACTIVE) → sign-up → OTP → in. Invite single-use, expiring.
- **Student sign-up** (wizard): University (ACTIVE only) → Batch (select from the university's batches; if none, type batch number + graduation year) + student ID + department + name + email + password → **ID card photo** (presigned PUT to staging, validated + copied to final like attachments; tied to a `signupToken`) → email OTP → "Waiting for approval" (`/pending`). Role from graduation year. Roster match (hash found in that batch's roster) stored as a hint.
- **Approvals** (workspace, OWNER/ADMIN): list pending students with ID card image, studentIdHint, roster ✓/✗, batch, department; Approve → ACTIVE (`decided_at`); Reject → account deleted. Purge card images whose decision is > 30 days old.
- **Batches & rosters** (OWNER/ADMIN): create/edit batch (number, graduation year); upload roster for a batch (xlsx/CSV columns `student_id, department[, name]`); counts per batch; editing graduation year re-runs promotion for that batch.
- **Members & invites** (OWNER/ADMIN): list members (role, status), change role (rules below), suspend/ban/restore (existing), send/revoke invites.
- **Moderation** (OWNER/ADMIN/MODERATOR): existing queue.
- **Audit, Overview stats** (OWNER/ADMIN): existing.
- **Settings** (OWNER): university name, website, logo.
- **Role rules:** OWNER is unique per university, cannot be demoted or suspended/banned by anyone in the university; OWNER can transfer ownership (target becomes OWNER, old owner becomes ADMIN). ADMIN can manage everyone except OWNER and other ADMINs' roles (only OWNER changes ADMIN roles). MODERATOR rules unchanged. STAFF has member powers plus a "Faculty" badge. Existing "isMod" = MODERATOR|ADMIN|OWNER; "isAdmin" = ADMIN|OWNER.

## Non-goals
Custom roles/permission editor, departments as entities, billing, cron jobs, OCR of ID cards.

## Testing
Extend tenant suite to every new procedure; tests for: application → approval, invite lifecycle (expiry, single use, wrong email), batch roster import + roster-match hint, ID card upload validation (same magic-byte/copy rules), approval/reject (card purge), alumnus auto-promotion, owner protections and transfer, platform-admin gate (env email only).
