# Alumni Connect — Design Spec

Date: 2026-10-16
Source: `Alumni-Connect-Proposal.txt` (v1.0 baseline, 2026-09-16)
Scale: final year project demo. Not production. Single app instance.

## 1. Goal

One Next.js app hosting a private forum per university. Members are verified
against the university roster plus an institutional email code, locked to that
university, and labelled STUDENT or ALUMNUS. All four proposal modules ship:
M1 Auth and Identity, M2 Forum Content, M3 Social Interaction, M4 Moderation and Admin.

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router (React 19, React Compiler, cacheComponents on) |
| API | tRPC v11 mounted at `/api/trpc/[trpc]`, Zod v4 input validation, superjson |
| Client data | `@tanstack/react-query` + `@trpc/tanstack-react-query` |
| Auth | better-auth (email + password, `emailOTP` plugin), sessions + rate limit in Postgres |
| DB | Postgres 17 (Docker, host port 5433), Drizzle ORM + drizzle-kit migrations, `postgres` driver |
| Files | MinIO (Docker, S3 API port 9000, console 9001). Presigned PUT from server, browser uploads direct |
| Live updates | SSE route handler `/api/events`, fed by Postgres `LISTEN/NOTIFY` |
| Email | nodemailer. If `SMTP_URL` unset, the code is printed to the server log |
| UI | Tailwind v4, `@base-ui/react` primitives, Material 3 Expressive styling, Roboto Flex, Material Symbols Rounded |
| Markdown | `react-markdown` (raw HTML disabled → no XSS) |
| Tests | `bun test` |
| Lint | Biome (already configured) |

Not used: Redis, WebSockets, email digest.

## 3. Data model

All tenant tables carry `university_id` (FK, indexed). Soft delete via `deleted_at`.

- `university` — id, name, slug, email_domain, created_at
- `user` (better-auth) + extra columns: university_id, role (`STUDENT|ALUMNUS|MODERATOR|ADMIN`),
  batch_year, department, student_id_hash (unique), bio, avatar_key, status (`PENDING|ACTIVE|SUSPENDED|BANNED`), suspended_until
- `session`, `account`, `verification`, `rate_limit` — better-auth tables
- `roster_entry` — university_id, student_id_hash, batch_year, department, graduated (bool), unique(university_id, student_id_hash)
- `pending_signup` — holds signup form data between roster match and email code confirm (expires 15 min)
- `post` — id, university_id, author_id, title, body (markdown), score, comment_count, search tsvector (generated, GIN), timestamps, deleted_at
- `comment` — id, university_id, post_id, parent_id (nullable), author_id, body, score, timestamps, deleted_at
- `tag`, `post_tag`
- `vote` — user_id, target_type (`POST|COMMENT`), target_id, value (+1/-1), unique(user, target)
- `bookmark`, `follow_user`, `follow_tag`
- `notification` — university_id, user_id, type, actor_id, post_id, comment_id, read_at
- `attachment` — university_id, owner_id, post_id (nullable), object_key, mime, size
- `report` — university_id, reporter_id, target_type, target_id, reason, status (`OPEN|RESOLVED|DISMISSED`), resolved_by
- `audit_log` — university_id (nullable for platform), actor_id, action, target, meta jsonb, created_at. Append only.

## 4. Tenant isolation (RLS)

- Migrations run as the owner role. The app connects as role `app_user` (no BYPASSRLS, not owner).
- RLS enabled + forced on all tenant tables. Policy: `university_id = current_setting('app.university_id')::uuid`.
- Every authed tRPC procedure runs inside a transaction that first calls
  `select set_config('app.university_id', $1, true)`. Procedures get `ctx.db` = that transaction.
- better-auth tables (`user`, `session`, `account`, `verification`, `rate_limit`) are not under RLS because
  better-auth must read them before tenant is known. User reads from tRPC always filter by `university_id` explicitly.
- `audit_log`: `app_user` has INSERT + SELECT only. A trigger raises on UPDATE/DELETE.
- Test suite: create two universities, act as a user of A, attempt every read procedure against B's ids → must return nothing / NOT_FOUND.

## 5. M1 Auth and Identity

Signup:
1. Form: university, batch year, department, student ID, institutional email, name, password.
2. `auth.startSignup` (public tRPC): check email domain matches university, hash student ID
   (`sha256(pepper + university_id + id)`), look up roster, reject if no match or ID already used.
   Rate limited per IP and per ID. Writes audit entry. Saves `pending_signup`, sends OTP via better-auth `emailOTP`.
3. `auth.completeSignup`: verify OTP, create user via better-auth server API with university_id, role
   (`ALUMNUS` if roster graduated or batch year passed, else `STUDENT`), mark email verified, sign in.
- Login: email + password. Suspended/banned users are refused at session check.
- Password reset: emailOTP `forget-password` flow.
- Roster fallback (no roster for a university): domain match + account `PENDING` until admin approves.

Roles: STUDENT, ALUMNUS → members. MODERATOR → queue access. ADMIN → moderator rights + roster, roles, analytics.
tRPC middlewares: `publicProcedure`, `memberProcedure` (verified, active, tenant tx), `modProcedure`, `adminProcedure`.

## 6. M2 Forum Content

- Create/edit/soft-delete post (author or mod). Title, markdown body, up to 5 tags, image attachments.
- Comments: `parent_id` threading, unlimited depth stored, UI indents to 6 levels then flattens.
- Feed: `new` (created_at desc) or `top` (score desc), filter by tag, cursor pagination.
- Search: `websearch_to_tsquery` against `post.search`, ranked by `ts_rank`.
- External links in posts require account age ≥ 3 days.

## 7. M3 Social Interaction

- Vote up/down on posts and comments; score kept denormalised, updated in same tx.
- Bookmarks, follow user, follow tag.
- Notifications on: reply to my post, reply to my comment, new post by followed user, new post in followed tag.
- Profile page: name, avatar, batch, department, role badge, verified mark, posts list.
- Live: on post/notification insert, server runs `pg_notify('events', json{university_id, type, user_id?})`.
  `/api/events` (SSE) holds one shared `LISTEN` connection, fans out to connected clients of the same
  university (and same user for notifications). Client invalidates the matching react-query keys.

## 8. Files (MinIO)

- `files.createUpload` returns presigned PUT URL (5 min) for `avatars/` or `attachments/` key under `{university_id}/`.
- Allowed: png, jpeg, webp, gif. Max 5 MB. Server checks size/type after upload via HEAD before linking.
- Reads: bucket private; `/api/files/[...key]` checks tenant and redirects to a presigned GET.

## 9. M4 Moderation and Admin

- Report post/comment/user with reason. Mod queue lists OPEN reports.
- Actions: dismiss, remove content (soft delete), suspend user (N days), ban user. Each writes audit log.
- Admin: roster CSV import (`student_id,batch_year,department,graduated`), approve pending users,
  change roles, view audit log, analytics (members by role, posts/comments per week, % posts with an alumnus reply).

## 10. UI — Material 3 Expressive

- Tokens as CSS variables on `:root` (light) and `.dark`/`prefers-color-scheme` (dark), from one seed color.
  Tailwind v4 `@theme` maps them (`bg-surface`, `text-on-surface`, `bg-primary-container` ...).
- Shapes: large radii (16–28 px), pill buttons; pressed buttons morph radius smaller (expressive shape morph).
- Motion: spring-like CSS easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for enter/press.
- Type: Roboto Flex, emphasized display/headline styles.
- Layout: navigation rail (desktop) / bottom nav bar (phone), top app bar, FAB for "Ask a question".
- Base UI components styled: Button, IconButton, Dialog, Menu, Tabs, Select, Toast, Tooltip, Field/Input.
- Accessibility: Base UI handles focus/ARIA; visible focus rings; contrast ≥ AA.

## 11. Pages

`/` landing · `/sign-up` · `/sign-in` · `/forgot-password` · `/feed` · `/p/[id]` · `/new` ·
`/search` · `/t/[tag]` · `/u/[id]` · `/bookmarks` · `/notifications` · `/settings` ·
`/mod` (queue) · `/admin` (stats, roster, users, audit)

## 12. Dev setup

- `docker-compose.yml`: postgres:17-alpine (5433), minio (9000/9001) + bucket init.
- `.env.example` with all vars.
- `bun run db:migrate`, `bun run db:seed` (Northern University + second demo university, roster, demo users of every role, ~20 posts).
- README local setup section.

## 13. Testing

- `bun test` against the docker Postgres (separate `alumni_test` DB).
- Must cover: cross tenant reads (every read procedure), signup rules (bad ID, dup ID, wrong domain, role assignment),
  role guards (member vs mod vs admin), audit log immutability.

## 14. Out of scope

Redis, WebSockets, email digest, chat, job board, events, mentorship matching, load testing tooling, CI/CD, deployment.
