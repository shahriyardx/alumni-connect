# Alumni Connect

A verified university forum built as a BSc final-year project by **Md Shahriyar Alam**, **Md Marjul Islam**, and **Aklima Akter Pushpo** (Northern University Bangladesh).

Students and alumni from a university sign up by proving they're on that university's roster (student ID, batch, department), then post, comment, vote, bookmark, and follow within their own university's forum — other universities' content is invisible to them at the database level, not just hidden in the UI.

## Stack

- **Next.js 16** (App Router) + React 19
- **tRPC 11** for typed API calls, **TanStack Query** on the client
- **better-auth** for sessions, email/password + email OTP verification
- **Drizzle ORM** + **PostgreSQL 17**, with **Postgres Row-Level Security** enforcing tenant (university) isolation at the database layer
- **MinIO** (S3-compatible) for avatar/post-image uploads via presigned URLs
- **SSE over `LISTEN`/`NOTIFY`** for live feed and notification updates — no polling, no extra message broker
- **Base UI** components, a small hand-rolled minimal design system (see `docs/superpowers/plans/refs/design-minimal.md`)
- **Biome** for lint/format, **bun test** for the test suite

## Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com/) (for Postgres + MinIO)

## Setup

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET (openssl rand -hex 32)
bun install
bun run db:up            # starts Postgres + MinIO via docker compose
bun run db:migrate
bun run db:seed
bun run dev               # http://localhost:3000
```

`db:seed` truncates and repopulates the dev database — safe to re-run any time (it's idempotent). It prints a summary plus three *unused* roster IDs you can use to try the live sign-up flow yourself.

### Demo accounts

All seeded accounts use the password **`password123`**. Every account except `new.student@nub.ac.bd` is backdated a year, so they can post links right away.

| Email | Role | University | Notes |
|---|---|---|---|
| `admin@nub.ac.bd` | OWNER | Northern University Bangladesh | full admin console; platform admin (`PLATFORM_ADMIN_EMAILS`) |
| `admin2@nub.ac.bd` | ADMIN | NUB | admin console |
| `faculty.cse@nub.ac.bd` | STAFF | NUB | Lecturer, CSE |
| `mod@nub.ac.bd` | MODERATOR | NUB | moderation queue, reports |
| `rahim.alumni@nub.ac.bd` | ALUMNUS | NUB | batch 38 (graduated 2018), CSE |
| `karim.alumni@nub.ac.bd` | ALUMNUS | NUB | batch 39 (2019), EEE |
| `salma.alumni@nub.ac.bd` | ALUMNUS | NUB | batch 40 (2020), BBA |
| `nusrat.alumni@nub.ac.bd` | ALUMNUS | NUB | batch 42 (2022), LLB |
| `tanvir.alumni@nub.ac.bd` | ALUMNUS | NUB | batch 44 (2024), CSE |
| `mim.student@nub.ac.bd` … `lamia.student@nub.ac.bd` | STUDENT | NUB | 6 current students, batches 46–49 (graduating 2026–2029) |
| `new.student@nub.ac.bd` | STUDENT | NUB | account created at seed time — shows the "new accounts can post links after 3 days" rule |
| `pending1@nub.ac.bd`, `pending2@nub.ac.bd` | STUDENT / ALUMNUS | NUB | awaiting approval (no ID card image) |
| `admin@demo.edu` | OWNER | Demo Tech University | second tenant, no roster loaded — shows the PENDING sign-up path |
| `student@demo.edu` | STUDENT | Demo Tech University | |
| `rep@eti.edu` | OWNER (PENDING) | Eastern Tech Institute | pending university application |

NUB has a 200-row roster (batches 38–49 graduating 2018–2029, CSE/EEE/BBA/LLB) so you can also sign up as a brand-new user — `bun run db:seed` prints three unused roster IDs each run for exactly this.

### Where OTP codes show up

There's no SMTP server in dev: leave `SMTP_URL` empty in `.env` and every email (verification OTP, password reset OTP) is printed to the **server terminal** running `bun run dev` instead of actually being sent.

### MinIO console

Uploaded avatars and post images live in MinIO. Browse the bucket at **http://localhost:9001** (user: `minioadmin`, password: `minioadmin`).

Optional: unconfirmed ID card uploads stay under `*/staging/`; expire them with a lifecycle rule, e.g. `mc ilm rule add --prefix "<university-id>/staging/" --expire-days 1 local/<bucket>` (per university, since S3 prefixes can't wildcard).

> The `minio` service in `docker-compose.yml` runs the `pgsty/silo` image, a maintained drop-in fork of `minio/minio` — the official image was pulled from Docker Hub and `quay.io/minio/minio` now requires auth. Same binary, same env vars, same `mc` client; swap back to `minio/minio` if it ever returns to Docker Hub.

### Tests

```bash
bun test
```

`bun test` loads `.env.test`, not `.env`, so it runs against a separate `alumni_test` database (created alongside `alumni` by `docker/initdb/01-init.sql`) as a Postgres superuser (`DATABASE_ADMIN_URL`) — it never touches your dev database. Tests truncate and rebuild tables in `alumni_test` as they go, so it's safe to run anytime, including right after seeding `alumni` for a demo.

### Resetting everything

```bash
docker compose down -v   # drops the Postgres + MinIO volumes
bun run db:up
bun run db:migrate
bun run db:seed
```

## Architecture

**Tenancy.** Every tenant-scoped table (`post`, `comment`, `vote`, `roster_entry`, …) carries a `university_id` column and a Postgres RLS policy that compares it against `current_setting('app.university_id')`. The app sets that setting per-request/transaction (`withTenant`, see `src/db/index.ts`) using the signed-in user's university — a query simply cannot see another university's rows, even if application code has a bug. Composite foreign keys (e.g. `post(author_id, university_id) → user(id, university_id)`) stop a row from ever referencing a parent in a different tenant. Seeds and tests connect as the Postgres superuser (`DATABASE_ADMIN_URL`), which bypasses RLS, to arrange cross-tenant fixtures.

**Auth & verification.** better-auth handles sessions and password hashing. Sign-up requires proving membership of the university roster (student ID → salted hash, batch, department); a `pending_signup` row holds that proof until email OTP verification completes, at which point a database hook promotes it into the real `user` row. Universities with no roster loaded fall back to an admin-reviewed PENDING flow (see `demo.edu` in the seed data).

**Roles.** `OWNER`, `ADMIN`, `MODERATOR`, `STAFF`, `STUDENT`, `ALUMNUS`, one university each. `OWNER` is unique per university (settings, ownership transfer, admin role changes); `ADMIN` runs the workspace day to day; `MODERATOR` only gets the moderation queue; `STAFF` is faculty/staff joined by email invite (a "Faculty" badge on the feed, no admin powers unless also promoted). Students belong to a batch (number + graduation year) and become `ALUMNUS` automatically once that year has passed — either lazily on their next request or immediately for everyone in a batch when an admin edits its graduation year. `isMod(role)` = `MODERATOR|ADMIN|OWNER`, `isAdmin(role)` = `ADMIN|OWNER`.

**Platform admin.** A separate, DB-free layer above universities: any verified account whose email is listed (comma-separated, case-insensitive) in the `PLATFORM_ADMIN_EMAILS` env var can open `/platform` to approve or reject university applications and create universities directly. It's not a role — the same account is still whatever role it holds inside its own university, if any.

**Workspace.** `/workspace` is the management dashboard for a university's staff (`OWNER`/`ADMIN`/`MODERATOR`/`STAFF`); the public forum stays at `/feed`. Tabs are gated by role: Overview, Approvals and Batches & rosters need `ADMIN`+, Moderation needs `MODERATOR`+, Settings is `OWNER`-only. A university stays usable by its own staff while its application is still `PENDING` platform review — the one thing gated on approval is that new students can't sign up yet (the public sign-up picker only lists `ACTIVE` universities). A `REJECTED` university is blocked application-wide for everyone in it.

**Live updates.** Mutations that matter for the feed (new post, new comment, new notification) call `pg_notify('events', …)` inside the same transaction, so the notification only fires on commit. A single server-side `LISTEN` fans events out over Server-Sent Events to connected clients — no separate message broker, no polling.

**Storage.** Images are uploaded directly to MinIO via short-lived presigned URLs; the browser never streams the file through the app server. On confirm, the server copies the object from staging to its final key and reads its first bytes to check the magic number against the declared type before recording it.

**Roster format.** Rosters are uploaded per batch as `.xlsx` or `.csv` with columns `student_id, department` or `student_id, department, name` (name optional; a sample is downloadable from Batches & rosters). Student IDs are never stored raw — only a salted hash (for matching at sign-up) and the last 4 characters (`studentIdHint`, shown to approvers). Re-uploading a roster for a batch moves an ID to that batch. If a batch has no roster loaded, students can still sign up — there's just no roster-match hint for the approver.

**ID card privacy.** Every student sign-up requires a photo of their ID card. It's private: only `OWNER`/`ADMIN` of that university (and platform admins, for rep applications) can view it, via a signed-in-only route — never a public URL. It's deleted automatically 30 days after the approve/reject decision (checked lazily when the approvals list loads, no cron job). Rejecting a sign-up deletes the pending account and its card immediately.

## Project structure

```
src/
  app/
    (public)/        sign-in, sign-up, register-university, invite accept, forgot-password, landing page
    (app)/            feed, post view, search, bookmarks, notifications, settings, platform
    (workspace)/      /workspace — the OWNER/ADMIN/MODERATOR/STAFF dashboard (see Workspace below)
    api/              auth, tRPC, file upload, ID card, SSE endpoints
  components/         shared UI, plus workspace/ and auth/ specific pieces
  server/
    routers/          tRPC routers (post, comment, social, moderation, workspace, platform, invites, …)
    queries/          shared read queries (feed/post listing)
    auth.ts           better-auth config
    student-id.ts     roster hashing + role derivation
    storage.ts        MinIO presigned upload/download
    events.ts         LISTEN/NOTIFY live-event bus
  db/
    schema.ts         Drizzle schema incl. RLS policies
    seed.ts           demo data
    migrate.ts
  lib/                client-safe helpers shared across app + server
tests/                bun test suite (runs against the separate alumni_test DB as superuser)
docs/                 specs, design notes, sample roster CSV
```

## Design

The UI follows a deliberately minimal, utilitarian direction rather than a heavy Material-style design system — see `docs/superpowers/plans/refs/design-minimal.md` for the rationale and tokens. The goal is a forum that reads fast and gets out of the way, not a showcase of UI components.
