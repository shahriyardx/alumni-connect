# University Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Universities become self-managed workspaces: platform admin + rep applications, batches with rosters, ID-card-checked student approvals, staff invites with roles, and a `/workspace` dashboard.

**Architecture:** Same stack and tenancy model as the base app (Next 16 App Router, tRPC v11 memberProcedure tenant transactions with Postgres RLS + composite FKs, better-auth with `pending_signup` gate in `user.create.before`, MinIO staging→final uploads, minimal bento UI). New tables get RLS + composite FKs; new server logic lives in focused routers.

**Spec:** `docs/superpowers/specs/2026-10-17-university-workspaces-design.md` (read it fully — user decisions + controller rulings). Base spec: `docs/superpowers/specs/2026-10-16-alumni-connect-design.md`.

**References:** `docs/superpowers/plans/refs/next16.md`, `refs/design-minimal.md`, existing code (read before changing): `src/db/schema.ts`, `src/server/trpc.ts`, `src/server/auth.ts`, `src/server/routers/{auth,admin,moderation,files,profile}.ts`, `src/server/storage.ts`, `src/server/roster-csv.ts`, `src/components/auth/sign-up-wizard.tsx`, `src/app/(app)/{admin,mod}/*`, `src/components/admin/*`, `src/db/seed.ts`, `tests/helpers.ts`.

## Global Constraints
- All base-plan global constraints still apply (bun only; ports 5433/9000/9001; dev checks on **port 3200 only**, port 3000 is the user's preview — never touch it; RLS on every tenant table with the `nullif(current_setting('app.university_id', true), '')::uuid` policy; composite `(x_id, university_id)` FKs; any `user` read/write filters `university_id` explicitly; raw student IDs never stored; uploads png/jpeg/webp/gif ≤ 5 MB with magic-byte check on the server-only final copy; markdown never renders raw HTML).
- Roles: `OWNER | ADMIN | MODERATOR | STAFF | STUDENT | ALUMNUS`. `isMod(role)` = MODERATOR|ADMIN|OWNER. `isAdmin(role)` = ADMIN|OWNER.
- Platform admin = verified account whose email (lowercased) is in env `PLATFORM_ADMIN_EMAILS` (comma-separated). Add to `src/env.ts` (optional string, default `""`), `.env.example` = `admin@nub.ac.bd`, `.env.test` = `platform@test.edu`.
- Alumnus rule: `graduationYear < new Date().getFullYear()` → ALUMNUS (else STUDENT). Staff/owner/admin/moderator roles are never auto-changed.
- New migrations only (never edit old ones); check drizzle-kit statement order (UNIQUE before dependent FK).
- Minimal design (design-minimal.md); reuse kit components; short copy.
- Commit per task (Conventional Commits). `bun test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build` clean before each commit.

## Review Focus
1. Cross-tenant access through every new procedure, the ID card route and invite tokens (tenant suite must cover them).
2. Privilege escalation: ADMIN acting on OWNER; anyone inviting/creating OWNER outside `/platform`; invite reuse/expiry; platform gate spoofed via non-verified email.
3. Unauthenticated ID card upload abuse: token binding, size/type checks on the final copy, staging→final like attachments.
4. Data migration correctness for existing rows (batch_year → graduation_year, roster rows → batches).
5. Alumnus promotion timing and that it never touches non-student roles.

---

### Task W1: Data model, migration, seed, existing code/tests updated

**Files:** `src/db/schema.ts`, new `drizzle/000N_workspaces.sql` (generated + hand-checked data migration), `src/db/seed.ts`, `src/db/reset.ts` (truncate list), `tests/helpers.ts`, every file using `batchYear`/`graduated`/old roles (grep), `src/server/student-id.ts` (`roleFor`), `src/server/roster-csv.ts`, `src/env.ts`, `.env.example`, `.env.test`, README demo table.

**Produces:**
- Schema exactly per spec "Data model changes". Export `ROLES` (new order above), `STAFF_ROLES = ["OWNER","ADMIN","MODERATOR","STAFF"] as const`, `UNIVERSITY_STATUSES`.
- `roleFor({ graduationYear, now? })` → `"STUDENT" | "ALUMNUS"` per Global rule (replaces the old graduated/batch logic).
- `isMod`, new `isAdmin` exported from `src/server/trpc.ts`; `adminProcedure` = isAdmin; `modProcedure` = isMod; new `ownerProcedure` (role OWNER); new `platformProcedure` (session user verified + email in `PLATFORM_ADMIN_EMAILS`; ctx gains `db` = plain `db` (no tenant), `me`). memberProcedure: lazy alumnus promotion (STUDENT + graduationYear < currentYear → set ALUMNUS before `next`).
- `parseRosterCsv(text)` new columns: header `student_id,department[,name]` (case-insensitive; name optional); returns `{ rows: {studentId, department, name?}[], errors }`, same dedupe/limits as before.
- Data migration SQL: rename `batch_year`→`graduation_year` on `user` and `pending_signup`; for each university create `batch` rows (number = graduation_year, graduation_year = graduation_year) for distinct roster `batch_year`s, set `roster_entry.batch_id`, then drop `roster_entry.batch_year`/`graduated`; set `user.batch_number = graduation_year` for existing students/alumni; `university.status = 'ACTIVE'` for existing rows.
- Seed: NUB batches 38–49 (number) with graduation years 2018–2029 (e.g. batch 38 → 2018); roster rows per batch; users get batch_number/graduation_year; add `STAFF` user `faculty.cse@nub.ac.bd` (title "Lecturer", dept CSE), make `admin@nub.ac.bd` the **OWNER**, keep a separate `admin2@nub.ac.bd` ADMIN; add a PENDING rep application university "Eastern Tech Institute" with owner `rep@eti.edu` (status PENDING) for the platform demo; DTU unchanged (owner `admin@demo.edu`). Seeded pending students: 2 with fake ID-card images? → no images (null `id_card_key`) — approvals UI must handle missing card.
- Update all existing code + tests to the new names/roles (Admin role checks that meant "admin" now use isAdmin; existing `ADMIN`-only rules stay valid for OWNER too). Existing behaviour must keep passing.

- [ ] Write failing tests: migration applies on a DB with old-shape data (helper inserts old-shape rows before running the new migration is too complex → instead test the new `roleFor`, roster parser columns, lazy promotion in memberProcedure, `platformProcedure` gate (email listed + verified vs not), isAdmin/owner guards).
- [ ] Implement schema + migration + code updates; `bun run db:migrate` on dev DB (it has real seeded data — verify the data migration on it, then reseed).
- [ ] Full suite green; lint/tsc/build; reseed; commit `feat(db): batches, staff roles, university status, invites schema`.

### Task W2: Platform admin + university applications

**Files:** `src/server/routers/platform.ts`, `src/server/routers/auth.ts` (new `registerUniversity`), `src/server/auth.ts` (before-hook accepts OWNER pending rows), `src/server/root.ts`, `src/app/(app)/platform/page.tsx` (+ view), `src/app/(public)/register-university/page.tsx` (+ form), landing/sign-up links ("Register your university"), nav item for platform admins, tests `tests/platform.test.ts`.

**Produces:**
- `auth.registerUniversity({ universityName(2..120), website?(url), name, title, email, })` public, rate-limited like startSignup (audit-based, per IP + per email): creates `university` (status PENDING, slug from name, unique-suffixed) + `pending_signup` (role OWNER, status PENDING, department null-safe: use "Administration"). Returns `{ universityId }`. Client then calls better-auth `signUp.email` + OTP verify, lands on `/pending`.
- `auth.universities` lists ACTIVE only.
- `auth.me` adds `isPlatformAdmin: boolean`.
- `platform.universities({ status? })` → `{ id, name, slug, status, website, createdAt, members, owner: {name,email}|null }[]`.
- `platform.approve({ universityId })` → university ACTIVE + its OWNER user ACTIVE; `platform.reject({ universityId })` → status REJECTED + delete the pending owner user. Audited in that university's tenant (`withTenant`).
- `platform.createUniversity({ name, website?, ownerEmail })` → university ACTIVE + `invite` (role OWNER) → returns `{ inviteUrl }` (also emailed via `sendMail`). Invite acceptance is built in W5; until then the URL just exists.
- UI: `/platform` (platform admins only; others → 403 EmptyState): tabs Pending / Active / Rejected; cards with approve/reject (confirm dialog); "New university" dialog. `/register-university`: same AuthFrame bento as sign-up, 2 steps (details → email code) then pending screen.
- Tests: non-platform user FORBIDDEN on every platform procedure (even ADMIN/OWNER); unverified email in list FORBIDDEN; apply → approve flow makes owner ACTIVE; reject deletes owner; PENDING universities hidden from `auth.universities`; students can't startSignup into a PENDING/REJECTED university (NOT_FOUND).

### Task W3: Student sign-up v2 (batches, ID card, always pending)

**Files:** `src/server/routers/auth.ts` (`startSignup` v2, `auth.batches`, `auth.idCardUpload`, `auth.confirmIdCard`), `src/server/auth.ts` (before-hook copies new fields; requires `id_card_key` for STUDENT/ALUMNUS pending rows), `src/server/storage.ts` (reuse staging/final helpers; add kind `idcard` with keys `${uni}/idcard/...`), `src/app/api/id-cards/[userId]/route.ts`, `src/components/auth/sign-up-wizard.tsx` (+ new step), `tests/signup.test.ts` (rewrite for v2), `tests/files.test.ts` (id card cases).

**Produces:**
- `auth.batches({ universityId })` public → `{ number, graduationYear }[]` for ACTIVE universities.
- `startSignup({ universityId, email, studentId, batchNumber(int 1..999), graduationYear?(int, required when the batch doesn't exist), department, })` → validates as before (dup rules, squat rules, rate limits, unified roster message no longer needed since no auto-approve — rosterMatch is a hint), computes `rosterMatch` (hash in that batch's roster), `studentIdHint` (last 4 of normalized ID), graduationYear (batch's if exists, else input), role via `roleFor`, status **always PENDING**, `signupToken` (random 32 bytes base64url; store sha256 in pending row). Returns `{ role, signupToken, upload: { key, url } }` (presigned PUT to staging `${uni}/idcard/${uuid}.${ext}` — mime chosen by client: input adds `idCardMime`).
- `auth.confirmIdCard({ email, signupToken, key })` public: token must match the pending row for that email (constant-time compare of hashes), key shape must match the staging key issued; copy→final `${uni}/idcard/f/${uuid}.${ext}`, validate final (size ≤ 5 MB, magic bytes, stored content-type) — reuse the attachment confirm helpers; set `pending_signup.id_card_key`. Returns `{ ok: true }`.
- better-auth before hook: for STUDENT/ALUMNUS rows refuse when `id_card_key` is null; copy batch_number, graduation_year, roster_match, student_id_hint, id_card_key to user.
- `GET /api/id-cards/[userId]`: session user must be OWNER/ADMIN of the same university (or platform admin) and active; target user in that university with `id_card_key` → 302 presigned GET with forced content-type; else 404/403. `Cache-Control: private, no-store`.
- Wizard: steps University → Identity (batch select from `auth.batches`; if none, inputs batch number + graduation year) → ID card (ImageUploader-like single photo with preview; uses `signupToken` flow) → Verify email → `/pending` explaining approval. Minimal design.
- Tests: full v2 happy path (startSignup → PUT bytes → confirmIdCard → signUpEmail → user PENDING with card + hint + rosterMatch true); sign-up without card refused; wrong/missing token rejected; key from another signup rejected; HTML-in-png card rejected; batch not existing requires graduationYear; ID card route: other-tenant admin 404, student 403, owner 302.

### Task W4: Workspace (merge /admin + /mod) — batches, approvals, members, settings

**Files:** `src/server/routers/workspace.ts` (batches, approvals, settings), `src/server/routers/admin.ts` / `moderation.ts` (role rules: OWNER protections, ADMIN-on-ADMIN rule, transfer ownership), `src/app/(app)/workspace/*`, `src/components/workspace/*` (move/adapt `src/components/admin/*`), redirects from `/admin` and `/mod` (page-level `redirect("/workspace")`), app-shell nav ("Workspace" for STAFF_ROLES except STAFF; replaces Moderation/Admin items), `read-excel-file` dependency (browser), tests `tests/workspace.test.ts`, updated `tests/moderation.test.ts`, `tests/tenant.test.ts`.

**Produces:**
- `workspace.batches()` (admin) → `{ id, number, graduationYear, rosterCount, members }[]`; `workspace.saveBatch({ id?, number, graduationYear })` (admin; unique number per uni → CONFLICT); saving re-runs promotion for users with that batch_number (STUDENT ↔ ALUMNUS recompute for STUDENT/ALUMNUS only); `workspace.deleteBatch({ id })` (only if no members; cascade roster).
- `admin.importRoster({ batchId, csv })` (replaces old signature): rows into that batch; upsert by (university, hash) moves an ID to the new batch.
- `workspace.approvals()` (admin) → pending STUDENT/ALUMNUS users (verified email) `{ id, name, email, batchNumber, graduationYear, department, studentIdHint, rosterMatch, hasIdCard, createdAt }[]`; also lazily purges card objects + `id_card_key` for users with `decided_at` older than 30 days.
- `workspace.decide({ userId, action: "approve" | "reject" })` (admin): approve → ACTIVE + decided_at; reject → delete user (+ card object). Audited `user.approve` / `user.reject`.
- Role rules in `admin.setRole` + `moderation.setUserStatus` + `moderation.resolve` (suspend/ban): target OWNER → FORBIDDEN for everyone; setting role OWNER → BAD_REQUEST (use transfer); changing an ADMIN's role or making someone ADMIN requires OWNER. `workspace.transferOwnership({ userId })` (owner): target must be ACTIVE member; target → OWNER, me → ADMIN; audited.
- `workspace.settings()` / `workspace.updateSettings({ name, website?, logoKey? })` (owner); logo via files upload kind `logo` (`${uni}/logo/...`, owner-only, served via `/api/files` with attachment row as today).
- UI `/workspace` tabs (role-gated; MODERATOR sees Moderation only; STAFF/STUDENT/ALUMNUS get 403 EmptyState): Overview (stats), Approvals (cards with ID-card image via `/api/id-cards/[userId]`, hint "ID ends in ••••1234", roster ✓/✗ chip, Approve/Reject), Batches & rosters (list, add/edit batch dialog, upload `.xlsx` or `.csv` per batch → `read-excel-file` in browser → CSV text → importRoster; result summary), Members (existing panel + transfer ownership for owner), Moderation (existing queue), Audit, Settings (owner). University logo shows in the app shell (sidebar) when set.
- Badges: STAFF → "Faculty" (+ title tooltip), OWNER → "Owner".
- Tests: approvals list/approve/reject (+ card purge older than 30 days); batches CRUD + promotion recompute; importRoster per batch (+ move between batches); OWNER protections (admin can't suspend/demote owner; admin can't change another admin; owner can); transfer ownership; moderator can't reach admin procedures; tenant suite for every new procedure.

### Task W5: Staff invites

**Files:** `src/server/routers/invites.ts`, `src/server/auth.ts` (before-hook accepts invite-born pending rows), `src/app/(public)/invite/[token]/page.tsx` (+ form), workspace Members tab "Invite" dialog + pending invites list, tests `tests/invites.test.ts`.

**Produces:**
- `invites.create({ email, role: ADMIN|MODERATOR|STAFF, department, title? })` (admin; ADMIN role invites require OWNER) → token (32 bytes base64url; store sha256), expires 7 days, emails link `${BETTER_AUTH_URL}/invite/${token}` via `sendMail`; returns `{ inviteUrl }` (shown once, copyable). Dup open invite for same email → replace.
- `invites.list()` / `invites.revoke({ id })` (admin).
- `invites.lookup({ token })` public → `{ universityName, role, email, department }` or NOT_FOUND (expired/used/revoked).
- `invites.accept({ token, name })` public → validates, writes `pending_signup` (role from invite, status ACTIVE, department/title, graduation fields null) for the invite email; marks nothing yet; client then `signUp.email` with the invite email + OTP verify; before-hook consumes and the `after` hook (or accept-on-create) sets `invite.accepted_at`. Email already registered → CONFLICT.
- Platform OWNER invites (from W2) use the same accept flow.
- Tests: create/lookup/accept happy path → user ACTIVE with role+department; expired, revoked, reused token → NOT_FOUND; MODERATOR can't create invites; ADMIN can't invite ADMIN; cross-tenant revoke NOT_FOUND; OWNER invite only creatable via platform.

### Task W6: Final verification
- [ ] Fresh `docker compose down -v && bun run db:up && bun run db:migrate && bun run db:seed`; full test/lint/tsc/build.
- [ ] Headless walkthrough on port 3200: rep applies → platform admin approves → owner signs in → creates batch → uploads xlsx roster → invites a faculty member → faculty accepts → student signs up with ID card → owner approves (sees card + roster ✓) → student posts; batch graduation year edited → student becomes Alumnus; DTU owner sees nothing of NUB; phone width + dark mode on new pages.
- [ ] Fix found bugs (test first for logic); README updated (roles, platform admin env, workspace, roster format, ID card privacy).
