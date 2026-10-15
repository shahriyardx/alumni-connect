# Alumni Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Alumni Connect app (verified per-university forum: auth + roster verification, forum, social, moderation/admin) as one Next.js 16 app.

**Architecture:** Next.js 16 App Router serves UI and the API. tRPC v11 at `/api/trpc` is the only business API; better-auth at `/api/auth/*` owns sessions. Postgres 17 enforces tenant isolation with row level security keyed on a per-transaction setting `app.university_id`; the app connects as the restricted role `app_user`. MinIO stores files (browser uploads via presigned PUT). Live updates use SSE at `/api/events`, fed by Postgres `LISTEN/NOTIFY`.

**Tech Stack:** Next.js 16.4.1, React 19.3, Tailwind v4, @base-ui/react 1.9, better-auth 1.7.10, drizzle-orm 0.45.4 + drizzle-kit 0.31.11, postgres 3.4.9, tRPC 11.19, @tanstack/react-query 5, zod 4, superjson, minio 8, nodemailer, react-markdown 10 + remark-gfm, material-symbols, bun (package manager + test runner), Biome.

**Spec:** `docs/superpowers/specs/2026-10-16-alumni-connect-design.md` — read it before starting any task.

**References (read the ones your task names):**
- `docs/superpowers/plans/refs/next16.md` — Next 16 rules for this repo (Suspense rule, async params, proxy.ts, SSE template). **Every UI/route task must follow it.**
- `docs/superpowers/plans/refs/verified/*.ts(x)` — library snippets that were type-checked against the exact versions (better-auth, drizzle, tRPC client/server, Base UI, minio, nodemailer, react-markdown).
- `docs/superpowers/plans/refs/m3-tokens.css` — generated Material 3 color tokens (light then dark).
- Next docs: `node_modules/next/dist/docs/01-app/`.

## Global Constraints

- Package manager and runner: **bun** (`bun add`, `bun run`, `bun test`). Never npm/yarn/pnpm in the repo.
- Postgres on host port **5433**, DB `alumni` (dev) and `alumni_test` (tests). App role `app_user` / password `app_password`. Superuser `postgres` / `postgres` used only for migrations, seed, test setup.
- MinIO S3 API on **9000**, console **9001**, bucket `alumni`, creds `minioadmin` / `minioadmin`.
- No Redis. No WebSockets. Not production — single app instance.
- Roles: `STUDENT | ALUMNUS | MODERATOR | ADMIN`. User status: `PENDING | ACTIVE | SUSPENDED | BANNED`.
- Every tenant table has `university_id uuid not null` and an RLS policy `university_id = nullif(current_setting('app.university_id', true), '')::uuid` for role `app_user`.
- Tables NOT under RLS: `university`, `user`, `session`, `account`, `verification`, `rate_limit`, `pending_signup`. Any tRPC read of `user` MUST filter `user.universityId = ctx.me.universityId` explicitly.
- Student IDs are only stored as `sha256(PEPPER:universityId:normalizedId)` hex. Normalize = trim + uppercase + remove inner whitespace. Never log or return raw IDs.
- `batchYear` means **expected graduation year**. Role at signup: `ALUMNUS` if roster row `graduated = true`; with no roster for that university, `ALUMNUS` if `batchYear < currentYear`, else `STUDENT`.
- Uploads: png, jpeg, webp, gif only; max 5 MB (5 * 1024 * 1024 bytes).
- Markdown rendering: `react-markdown` + `remark-gfm` only. Never add `rehype-raw`, never use `dangerouslySetInnerHTML`.
- Do not export `dynamic`, `revalidate`, `fetchCache`, `dynamicParams` from any route (they error under cacheComponents).
- Code style: Biome (`bun run lint` must pass), 2-space indent, `@/` import alias → `src/`.
- Commit after each task with a Conventional Commit message.

## Review Focus

1. **Suspended user whose suspension has expired** — `suspendedUntil` in the past must be treated as ACTIVE again; still-suspended or BANNED users get `FORBIDDEN` on every member procedure even with a valid session. (Test in Task 3.)
2. **Student ID typed with spaces / lowercase** (`" nu-2020 0711 "`) must match the roster row imported as `NU-20200711`. (Test in Task 3.)
3. **Pooled connection reused after a tenant transaction** — `current_setting` returns `''` afterwards; queries outside a tenant tx must return zero tenant rows, not throw `invalid input syntax for type uuid`. (Test in Task 2.)
4. **Deleted parent comment with live replies** — thread must keep the replies, parent shows `[removed]` with no author. (Test in Task 6.)
5. **Tags typed with caps/spaces/duplicates** (`["React", " react ", "Next JS"]`) normalise to `["react", "next-js"]`; limit of 5 applies after dedupe. (Test in Task 6.)

---

## File Map

```
docker-compose.yml                 postgres + minio + bucket init
docker/initdb/01-init.sql          app_user role, alumni_test db, default grants
drizzle.config.ts
bunfig.toml                        test preload
.env.example / .env / .env.test
src/env.ts                         zod-validated server env
src/db/schema.ts                   all tables + RLS policies
src/db/index.ts                    db client, withTenant(), Tx type
src/db/migrate.ts                  programmatic migrate (superuser URL)
src/db/seed.ts                     demo data
drizzle/                           generated + custom SQL migrations
src/server/auth.ts                 better-auth instance
src/server/mail.ts                 sendMail (console fallback)
src/server/student-id.ts           normalize/hash ID, roleFor()
src/server/events.ts               LISTEN/NOTIFY bus + publish()
src/server/storage.ts              minio client + helpers
src/server/trpc.ts                 context, procedures (public/member/mod/admin)
src/server/queries/posts.ts        shared post list query
src/server/routers/*.ts            auth, post, comment, social, notification, profile, files, moderation, admin
src/server/root.ts                 appRouter + createCaller
src/app/api/trpc/[trpc]/route.ts
src/app/api/auth/[...all]/route.ts
src/app/api/events/route.ts        SSE
src/app/api/files/[...key]/route.ts
src/proxy.ts                       redirect signed-out users away from app pages
src/lib/auth-client.ts             better-auth react client
src/lib/trpc.tsx                   tRPC + react-query provider, useTRPC
src/lib/live.ts                    useLiveEvents() SSE hook
src/lib/comment-tree.ts            flat → tree
src/components/ui/*.tsx            M3 Expressive kit on Base UI
src/components/*.tsx               app components (post card, composer, vote, ...)
src/app/(public)/...               landing, sign-in, sign-up, forgot-password
src/app/(app)/...                  feed, post, new, search, tag, user, bookmarks, notifications, settings, mod, admin, pending
tests/setup.ts, tests/helpers.ts, tests/*.test.ts
```

---

### Task 1: Infrastructure (deps, Docker, env, scripts)

**Files:**
- Create: `docker-compose.yml`, `docker/initdb/01-init.sql`, `drizzle.config.ts`, `bunfig.toml`, `.env.example`, `.env`, `.env.test`, `src/env.ts`
- Modify: `package.json` (deps + scripts), `.gitignore`

**Interfaces:**
- Produces: `env` object from `@/env` with keys `DATABASE_URL, DATABASE_ADMIN_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, STUDENT_ID_PEPPER, S3_ENDPOINT, S3_PORT (number), S3_USE_SSL (boolean), S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, SMTP_URL (optional), MAIL_FROM`.
- Produces scripts: `db:up`, `db:generate`, `db:migrate`, `db:seed`, `test`.

- [ ] **Step 1: Install dependencies**

```bash
bun add better-auth@1.7.10 drizzle-orm@0.45.4 postgres@3.4.9 @trpc/server@11.19.0 @trpc/client@11.19.0 @trpc/tanstack-react-query@11.19.0 @tanstack/react-query@5 zod@4 superjson @base-ui/react@1.9.0 minio@8 nodemailer react-markdown@10 remark-gfm@4 material-symbols
bun add -d drizzle-kit@0.31.11 @types/nodemailer @types/bun
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: alumni
    ports: ["5433:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 3s
      retries: 20
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes: [miniodata:/data]
  minio-init:
    image: minio/mc
    depends_on: [minio]
    restart: "no"
    entrypoint: >
      /bin/sh -c "until mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 1; done;
      mc mb -p local/alumni; exit 0"
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 3: Write `docker/initdb/01-init.sql`** (runs once, on first DB container start, as superuser)

```sql
CREATE ROLE app_user LOGIN PASSWORD 'app_password';
CREATE DATABASE alumni_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
\c alumni_test
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

- [ ] **Step 4: Env files.** `.env.example` and `.env` (same content; `.env` gets a real random secret from `openssl rand -hex 32`):

```
DATABASE_URL=postgres://app_user:app_password@localhost:5433/alumni
DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5433/alumni
BETTER_AUTH_SECRET=change-me-32-chars-minimum-xxxxxxxxxx
BETTER_AUTH_URL=http://localhost:3000
STUDENT_ID_PEPPER=change-me
S3_ENDPOINT=localhost
S3_PORT=9000
S3_USE_SSL=false
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=alumni
# Leave empty to print emails (OTP codes) in the server log
SMTP_URL=
MAIL_FROM=Alumni Connect <no-reply@alumni.local>
```

`.env.test` (bun test loads it automatically and it overrides `.env`):

```
DATABASE_URL=postgres://app_user:app_password@localhost:5433/alumni_test
DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5433/alumni_test
BETTER_AUTH_SECRET=test-secret-test-secret-test-secret-xx
STUDENT_ID_PEPPER=test-pepper
```

Append to `.gitignore`:

```
!.env.example
!.env.test
```

- [ ] **Step 5: `src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  STUDENT_ID_PEPPER: z.string().min(1),
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().default(9000),
  S3_USE_SSL: z.stringbool().default(false),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("alumni"),
  SMTP_URL: z.string().optional().transform((v) => v || undefined),
  MAIL_FROM: z.string().default("Alumni Connect <no-reply@alumni.local>"),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 6: `drizzle.config.ts` and `bunfig.toml`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "" },
  entities: { roles: true },
});
```

```toml
[test]
preload = ["./tests/setup.ts"]
```

- [ ] **Step 7: package.json scripts** (keep existing ones)

```json
"db:up": "docker compose up -d --wait db minio && docker compose up minio-init",
"db:generate": "drizzle-kit generate",
"db:migrate": "bun src/db/migrate.ts",
"db:seed": "bun src/db/seed.ts",
"test": "bun test"
```

- [ ] **Step 8: Verify containers**

Run: `bun run db:up && psql postgres://app_user:app_password@localhost:5433/alumni_test -c 'select 1'`
Expected: containers healthy; psql prints `1`. If port 5433/9000 is taken, stop and report.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: add infra (docker postgres+minio, env, deps, scripts)"
```

---

### Task 2: Database schema, RLS, migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `src/db/migrate.ts`, `drizzle/*` (generated), custom migration `drizzle/XXXX_rules.sql`, `tests/setup.ts`, `tests/helpers.ts`, `tests/rls.test.ts`

**Interfaces:**
- Produces from `@/db`: `db` (drizzle, app_user), `client` (postgres.js Sql), `type Tx`, `withTenant<T>(universityId: string, fn: (tx: Tx) => Promise<T>): Promise<T>`.
- Produces from `@/db/schema`: tables `university, user, session, account, verification, rateLimit, pendingSignup, rosterEntry, post, comment, tag, postTag, vote, bookmark, followUser, followTag, notification, attachment, report, auditLog`; const arrays `ROLES, STATUSES`; types `Role`, `Status`.
- Produces from `tests/helpers.ts`: `adminDb`, `resetDb()`, `makeUniversity(name?: string, emailDomain?: string)`, `makeUser(universityId: string, over?: Partial<typeof user.$inferInsert>)`, `makePost(universityId: string, authorId: string, over?)`.

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ROLES = ["STUDENT", "ALUMNUS", "MODERATOR", "ADMIN"] as const;
export const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "BANNED"] as const;
export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export const appUser = pgRole("app_user").existing();

const tenantCheck = (col: AnyPgColumn) =>
  sql`${col} = nullif(current_setting('app.university_id', true), '')::uuid`;
const tenantPolicy = (name: string, col: AnyPgColumn) =>
  pgPolicy(`${name}_tenant`, {
    as: "permissive",
    for: "all",
    to: appUser,
    using: tenantCheck(col),
    withCheck: tenantCheck(col),
  });

const created = () => timestamp("created_at").defaultNow().notNull();
const universityRef = () =>
  uuid("university_id")
    .notNull()
    .references(() => university.id, { onDelete: "cascade" });

export const university = pgTable("university", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  emailDomain: text("email_domain").notNull(),
  createdAt: created(),
});

// ---- better-auth tables (no RLS) ----
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: created(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    universityId: universityRef(),
    role: text("role", { enum: ROLES }).default("STUDENT").notNull(),
    batchYear: integer("batch_year").notNull(),
    department: text("department").notNull(),
    studentIdHash: text("student_id_hash").unique(),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    status: text("status", { enum: STATUSES }).default("ACTIVE").notNull(),
    suspendedUntil: timestamp("suspended_until"),
  },
  (t) => [index("user_university_idx").on(t.universityId)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Holds verified roster data between auth.startSignup and better-auth sign-up (no RLS: read by auth hook).
export const pendingSignup = pgTable("pending_signup", {
  email: text("email").primaryKey(),
  universityId: universityRef(),
  batchYear: integer("batch_year").notNull(),
  department: text("department").notNull(),
  studentIdHash: text("student_id_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  status: text("status", { enum: STATUSES }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ---- tenant tables (RLS) ----
export const rosterEntry = pgTable(
  "roster_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    studentIdHash: text("student_id_hash").notNull(),
    batchYear: integer("batch_year").notNull(),
    department: text("department").notNull(),
    graduated: boolean("graduated").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("roster_uni_hash_uq").on(t.universityId, t.studentIdHash),
    tenantPolicy("roster_entry", t.universityId),
  ],
).enableRLS();

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    authorId: text("author_id").notNull().references(() => user.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at"),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${post.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${post.body}, '')), 'B')`,
    ),
  },
  (t) => [
    index("post_uni_created_idx").on(t.universityId, t.createdAt),
    index("post_uni_score_idx").on(t.universityId, t.score),
    index("post_author_idx").on(t.authorId),
    index("post_search_idx").using("gin", t.search),
    tenantPolicy("post", t.universityId),
  ],
).enableRLS();

export const comment = pgTable(
  "comment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comment.id),
    authorId: text("author_id").notNull().references(() => user.id),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("comment_post_idx").on(t.postId),
    index("comment_author_idx").on(t.authorId),
    tenantPolicy("comment", t.universityId),
  ],
).enableRLS();

export const tag = pgTable(
  "tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tag_uni_name_uq").on(t.universityId, t.name), tenantPolicy("tag", t.universityId)],
).enableRLS();

export const postTag = pgTable(
  "post_tag",
  {
    universityId: universityRef(),
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tag_tag_idx").on(t.tagId),
    tenantPolicy("post_tag", t.universityId),
  ],
).enableRLS();

export const vote = pgTable(
  "vote",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["POST", "COMMENT"] }).notNull(),
    targetId: uuid("target_id").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("vote_target_idx").on(t.targetType, t.targetId),
    tenantPolicy("vote", t.universityId),
  ],
).enableRLS();

export const bookmark = pgTable(
  "bookmark",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), tenantPolicy("bookmark", t.universityId)],
).enableRLS();

export const followUser = pgTable(
  "follow_user",
  {
    universityId: universityRef(),
    followerId: text("follower_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follow_user_followee_idx").on(t.followeeId),
    tenantPolicy("follow_user", t.universityId),
  ],
).enableRLS();

export const followTag = pgTable(
  "follow_tag",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tagId] }),
    index("follow_tag_tag_idx").on(t.tagId),
    tenantPolicy("follow_tag", t.universityId),
  ],
).enableRLS();

export const NOTIFICATION_TYPES = ["REPLY_POST", "REPLY_COMMENT", "FOLLOWED_USER_POST", "FOLLOWED_TAG_POST"] as const;
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => post.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comment.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at"),
    createdAt: created(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt), tenantPolicy("notification", t.universityId)],
).enableRLS();

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => post.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: created(),
  },
  (t) => [index("attachment_post_idx").on(t.postId), tenantPolicy("attachment", t.universityId)],
).enableRLS();

export const report = pgTable(
  "report",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["POST", "COMMENT", "USER"] }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["OPEN", "RESOLVED", "DISMISSED"] }).default("OPEN").notNull(),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: created(),
  },
  (t) => [index("report_uni_status_idx").on(t.universityId, t.status), tenantPolicy("report", t.universityId)],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    ip: text("ip"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("audit_uni_created_idx").on(t.universityId, t.createdAt), tenantPolicy("audit_log", t.universityId)],
).enableRLS();
```

- [ ] **Step 2: Generate migration, then a custom rules migration**

Run: `bun run db:generate --name init` then `bunx drizzle-kit generate --custom --name rules`
Write into the new empty `drizzle/0001_rules.sql`:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM app_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
```

Check the generated `0000_init.sql` contains `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY ... TO "app_user"`, and `GENERATED ALWAYS AS (...) STORED` for `search`.

- [ ] **Step 3: `src/db/index.ts` and `src/db/migrate.ts`**

```ts
// src/db/index.ts
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const g = globalThis as unknown as { pg?: postgres.Sql };
export const client = g.pg ?? postgres(env.DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Run fn in a transaction where RLS sees only rows of this university. */
export function withTenant<T>(universityId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.university_id', ${universityId}, true)`);
    return fn(tx);
  });
}
```

```ts
// src/db/migrate.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL missing");
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrated");
```

- [ ] **Step 4: Test setup + helpers**

```ts
// tests/setup.ts — migrate the test DB once per run
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_ADMIN_URL ?? "", { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
```

```ts
// tests/helpers.ts — superuser access (bypasses RLS) for arranging data
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

export const adminClient = postgres(process.env.DATABASE_ADMIN_URL ?? "", { max: 2, onnotice: () => {} });
export const adminDb = drizzle(adminClient, { schema });

export async function resetDb() {
  await adminDb.execute(sql`
    truncate university, "user", session, account, verification, rate_limit, pending_signup,
      roster_entry, post, comment, tag, post_tag, vote, bookmark, follow_user, follow_tag,
      notification, attachment, report restart identity cascade`);
  // audit_log: trigger blocks DELETE but TRUNCATE skips row triggers; superuser may truncate.
  await adminDb.execute(sql`truncate audit_log`);
}

export async function makeUniversity(name = `Uni ${randomUUID().slice(0, 6)}`, emailDomain = `${randomUUID().slice(0, 6)}.edu`) {
  const [u] = await adminDb
    .insert(schema.university)
    .values({ name, slug: name.toLowerCase().replace(/\W+/g, "-"), emailDomain })
    .returning();
  return u;
}

export async function makeUser(universityId: string, over: Partial<typeof schema.user.$inferInsert> = {}) {
  const id = randomUUID();
  const [u] = await adminDb
    .insert(schema.user)
    .values({
      id,
      name: `User ${id.slice(0, 4)}`,
      email: `${id}@test.edu`,
      emailVerified: true,
      universityId,
      role: "STUDENT",
      batchYear: 2027,
      department: "CSE",
      studentIdHash: id,
      status: "ACTIVE",
      ...over,
    })
    .returning();
  return u;
}

export async function makePost(universityId: string, authorId: string, over: Partial<typeof schema.post.$inferInsert> = {}) {
  const [p] = await adminDb
    .insert(schema.post)
    .values({ universityId, authorId, title: "Hello world post", body: "Body text", ...over })
    .returning();
  return p;
}
```

- [ ] **Step 5: Write failing RLS test `tests/rls.test.ts`**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { auditLog, post } from "@/db/schema";
import { makePost, makeUniversity, makeUser, resetDb } from "./helpers";

describe("row level security", () => {
  let a: { id: string };
  let b: { id: string };
  beforeEach(async () => {
    await resetDb();
    a = await makeUniversity("A Uni");
    b = await makeUniversity("B Uni");
    const ua = await makeUser(a.id);
    const ub = await makeUser(b.id);
    await makePost(a.id, ua.id, { title: "post in A" });
    await makePost(b.id, ub.id, { title: "post in B" });
  });

  test("tenant sees only own rows", async () => {
    const rows = await withTenant(a.id, (tx) => tx.select().from(post));
    expect(rows.map((r) => r.title)).toEqual(["post in A"]);
  });

  test("cannot insert into another tenant", async () => {
    const ub = await makeUser(b.id);
    await expect(
      withTenant(a.id, (tx) => tx.insert(post).values({ universityId: b.id, authorId: ub.id, title: "x", body: "y" })),
    ).rejects.toThrow();
  });

  test("no tenant set → zero rows, also after a pooled connection was used by a tenant tx", async () => {
    await withTenant(a.id, (tx) => tx.select().from(post));
    for (let i = 0; i < 12; i++) {
      expect(await db.select().from(post)).toEqual([]);
    }
  });

  test("audit log is append only for app_user", async () => {
    await withTenant(a.id, (tx) => tx.insert(auditLog).values({ universityId: a.id, action: "test" }));
    await expect(withTenant(a.id, (tx) => tx.update(auditLog).set({ action: "changed" }))).rejects.toThrow();
    await expect(withTenant(a.id, (tx) => tx.delete(auditLog))).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run** `bun test tests/rls.test.ts` — before migrations are generated it fails; after Steps 1–4 it must PASS (4 tests).

- [ ] **Step 7: Migrate dev DB**: `bun run db:migrate` → prints `migrated`.

- [ ] **Step 8: Commit** `git add -A && git commit -m "feat(db): schema with RLS tenant isolation and append-only audit log"`

---
### Task 3: Auth (better-auth + roster signup) and tRPC core

**Files:**
- Create: `src/server/mail.ts`, `src/server/student-id.ts`, `src/server/auth.ts`, `src/server/events.ts`, `src/server/trpc.ts`, `src/server/routers/auth.ts`, `src/server/root.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `tests/student-id.test.ts`, `tests/signup.test.ts`, `tests/guards.test.ts`
- Read first: `docs/superpowers/plans/refs/verified/auth.ts`, `verified/trpc.ts`, `verified/auth-client.ts`

**Interfaces:**
- Consumes: `db`, `withTenant`, `Tx`, schema tables (Task 2); `env` (Task 1).
- Produces:
  - `sendMail(to: string, subject: string, text: string): Promise<void>` (`@/server/mail`)
  - `normalizeStudentId(raw: string): string`, `hashStudentId(universityId: string, raw: string): string`, `roleFor(opts: { graduated: boolean | null; batchYear: number; now?: Date }): "STUDENT" | "ALUMNUS"` (`@/server/student-id`). `graduated: null` means "no roster for this university".
  - `auth` (better-auth instance) (`@/server/auth`)
  - `type LiveEvent = { universityId: string; kind: "post" | "comment" | "notification"; userId?: string; postId?: string }`, `publish(tx: Tx, e: LiveEvent): Promise<void>`, `subscribe(fn: (e: LiveEvent) => void): () => void` (`@/server/events`)
  - `type Context = { userId: string | null; ip: string }`, `createContext(headers: Headers): Promise<Context>`, `router`, `publicProcedure`, `memberProcedure` (ctx gains `db: Tx`, `me: typeof user.$inferSelect`), `modProcedure`, `adminProcedure`, `audit(tx: Tx, universityId: string, actorId: string | null, action: string, target?: string, meta?: Record<string, unknown>, ip?: string): Promise<void>` (`@/server/trpc`)
  - `appRouter`, `type AppRouter`, `createCaller(ctx: Context)` (`@/server/root`)
  - tRPC procedures: `auth.universities` (query, public) → `{ id, name, emailDomain }[]`; `auth.startSignup` (mutation, public) → `{ role: "STUDENT" | "ALUMNUS"; status: "ACTIVE" | "PENDING" }`; `auth.me` (query, public) → `null | { id, name, email, role, status, universityId, universityName, avatarKey }` (works for PENDING/SUSPENDED users too, used by UI to route them).
  - `authClient` (`@/lib/auth-client`)
  - `tests/helpers.ts` gains `callerFor(userId: string | null)`.

- [ ] **Step 1: Failing test `tests/student-id.test.ts`**

```ts
import { expect, test } from "bun:test";
import { hashStudentId, normalizeStudentId, roleFor } from "@/server/student-id";

test("normalize trims, uppercases, strips inner spaces", () => {
  expect(normalizeStudentId(" nu-2020 0711 ")).toBe("NU-20200711");
});

test("hash is stable across formatting and differs per university", () => {
  expect(hashStudentId("u1", " nu-2020 0711 ")).toBe(hashStudentId("u1", "NU-20200711"));
  expect(hashStudentId("u1", "X1")).not.toBe(hashStudentId("u2", "X1"));
  expect(hashStudentId("u1", "X1")).toMatch(/^[0-9a-f]{64}$/);
});

test("roleFor", () => {
  const now = new Date("2026-10-16");
  expect(roleFor({ graduated: true, batchYear: 2030, now })).toBe("ALUMNUS");
  expect(roleFor({ graduated: false, batchYear: 2020, now })).toBe("STUDENT");
  expect(roleFor({ graduated: null, batchYear: 2025, now })).toBe("ALUMNUS");
  expect(roleFor({ graduated: null, batchYear: 2026, now })).toBe("STUDENT");
});
```

- [ ] **Step 2: Implement `src/server/student-id.ts` and `src/server/mail.ts`**

```ts
// src/server/student-id.ts
import { createHash } from "node:crypto";
import { env } from "@/env";

export const normalizeStudentId = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");

export const hashStudentId = (universityId: string, raw: string) =>
  createHash("sha256").update(`${env.STUDENT_ID_PEPPER}:${universityId}:${normalizeStudentId(raw)}`).digest("hex");

export function roleFor({ graduated, batchYear, now = new Date() }: { graduated: boolean | null; batchYear: number; now?: Date }) {
  if (graduated === null) return batchYear < now.getFullYear() ? "ALUMNUS" : "STUDENT";
  return graduated ? "ALUMNUS" : "STUDENT";
}
```

```ts
// src/server/mail.ts
import nodemailer from "nodemailer";
import { env } from "@/env";

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`\n[mail] to=${to} | ${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
```

Run `bun test tests/student-id.test.ts` → PASS.

- [ ] **Step 3: `src/server/auth.ts`**

The `user.create.before` hook is the gate: sign-up only works for an email that passed `auth.startSignup` (row in `pending_signup`, not expired). It injects the tenant + role fields. All additional fields are `input: false` so the client cannot set them.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "./mail";

const field = <T extends "string" | "number" | "date">(type: T) => ({ type, required: false, input: false }) as const;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 },
  emailVerification: { autoSignInAfterVerification: true },
  user: {
    additionalFields: {
      universityId: field("string"),
      role: { type: [...schema.ROLES], required: false, input: false },
      batchYear: field("number"),
      department: field("string"),
      studentIdHash: field("string"),
      bio: field("string"),
      avatarKey: field("string"),
      status: { type: [...schema.STATUSES], required: false, input: false },
      suspendedUntil: field("date"),
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          const email = u.email.toLowerCase();
          const [p] = await db
            .select()
            .from(schema.pendingSignup)
            .where(and(eq(schema.pendingSignup.email, email), gt(schema.pendingSignup.expiresAt, new Date())));
          if (!p) return false;
          return {
            data: {
              ...u,
              email,
              universityId: p.universityId,
              role: p.role,
              batchYear: p.batchYear,
              department: p.department,
              studentIdHash: p.studentIdHash,
              status: p.status,
            },
          };
        },
        after: async (u) => {
          await db.delete(schema.pendingSignup).where(eq(schema.pendingSignup.email, u.email));
        },
      },
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const what = type === "forget-password" ? "reset your password" : "verify your email";
        await sendMail(email, `Your Alumni Connect code: ${otp}`, `Use this code to ${what}: ${otp}\nIt expires in 5 minutes.`);
      },
    }),
    nextCookies(),
  ],
});
```

If `tsc` complains about the `field()` helper's literal types, inline the objects instead (`{ type: "string", required: false, input: false }`). If better-auth rejects text enum `type: [...]`, use `type: "string"`.

- [ ] **Step 4: `src/server/events.ts`** (live bus; single app instance)

```ts
import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { client, type Tx } from "@/db";

export type LiveEvent = { universityId: string; kind: "post" | "comment" | "notification"; userId?: string; postId?: string };

const g = globalThis as unknown as { liveBus?: EventEmitter; liveListen?: Promise<unknown> };
const bus = (g.liveBus ??= new EventEmitter().setMaxListeners(0));

/** NOTIFY is delivered only when the transaction commits. */
export async function publish(tx: Tx, e: LiveEvent) {
  await tx.execute(sql`select pg_notify('events', ${JSON.stringify(e)})`);
}

export function subscribe(fn: (e: LiveEvent) => void) {
  g.liveListen ??= client.listen("events", (payload) => bus.emit("event", JSON.parse(payload)));
  bus.on("event", fn);
  return () => {
    bus.off("event", fn);
  };
}
```

- [ ] **Step 5: `src/server/trpc.ts`**

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";
import { db, type Tx, withTenant } from "@/db";
import { auditLog, user } from "@/db/schema";
import { auth } from "./auth";

export type Context = { userId: string | null; ip: string };

export async function createContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return {
    userId: session?.user.id ?? null,
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local",
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: { ...shape.data, zod: error.cause instanceof ZodError ? error.cause.flatten() : null },
  }),
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export type Me = typeof user.$inferSelect;

export const memberProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [me] = await db.select().from(user).where(eq(user.id, ctx.userId));
  if (!me || !me.emailVerified) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (me.status === "BANNED") throw new TRPCError({ code: "FORBIDDEN", message: "Account banned" });
  if (me.status === "PENDING") throw new TRPCError({ code: "FORBIDDEN", message: "Account awaiting approval" });
  if (me.status === "SUSPENDED" && (!me.suspendedUntil || me.suspendedUntil > new Date())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
  }
  return withTenant(me.universityId, async (tx) => {
    const res = await next({ ctx: { db: tx, me } });
    if (!res.ok) throw res.error; // roll the transaction back on any procedure error
    return res;
  });
});

const isMod = (r: Me["role"]) => r === "MODERATOR" || r === "ADMIN";
export const modProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isMod(ctx.me.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
export const adminProcedure = memberProcedure.use(({ ctx, next }) => {
  if (ctx.me.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export async function audit(
  tx: Tx,
  universityId: string,
  actorId: string | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
  ip?: string,
) {
  await tx.insert(auditLog).values({ universityId, actorId, action, target, meta, ip });
}
```

- [ ] **Step 6: Failing test `tests/signup.test.ts`** (also extend helpers)

Add to `tests/helpers.ts`:

```ts
import { createCaller } from "@/server/root";
export const callerFor = (userId: string | null) => createCaller({ userId, ip: "127.0.0.1" });
```

```ts
// tests/signup.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { pendingSignup, rosterEntry, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { hashStudentId } from "@/server/student-id";
import { adminDb, callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let uni: { id: string; emailDomain: string };
const base = () => ({
  universityId: uni.id,
  email: `alice@${uni.emailDomain}`,
  studentId: "NU-1001",
  batchYear: 2022,
  department: "CSE",
});

beforeEach(async () => {
  await resetDb();
  uni = await makeUniversity("North", "north.edu");
  await adminDb.insert(rosterEntry).values([
    { universityId: uni.id, studentIdHash: hashStudentId(uni.id, "NU-1001"), batchYear: 2022, department: "CSE", graduated: true },
    { universityId: uni.id, studentIdHash: hashStudentId(uni.id, "NU-2002"), batchYear: 2028, department: "EEE", graduated: false },
  ]);
});

describe("auth.startSignup", () => {
  test("rejects email outside the university domain", async () => {
    await expect(callerFor(null).auth.startSignup({ ...base(), email: "alice@gmail.com" })).rejects.toThrow(/domain/i);
  });
  test("rejects ID not in roster", async () => {
    await expect(callerFor(null).auth.startSignup({ ...base(), studentId: "NU-9999" })).rejects.toThrow(/roster/i);
  });
  test("rejects batch year mismatch", async () => {
    await expect(callerFor(null).auth.startSignup({ ...base(), batchYear: 2023 })).rejects.toThrow(/batch/i);
  });
  test("matches ID typed with spaces/lowercase; graduated → ALUMNUS", async () => {
    const r = await callerFor(null).auth.startSignup({ ...base(), studentId: " nu-10 01 " });
    expect(r).toEqual({ role: "ALUMNUS", status: "ACTIVE" });
  });
  test("not graduated → STUDENT", async () => {
    const r = await callerFor(null).auth.startSignup({ ...base(), email: "bob@north.edu", studentId: "NU-2002", batchYear: 2028, department: "EEE" });
    expect(r.role).toBe("STUDENT");
  });
  test("rejects an ID already used by an account", async () => {
    await makeUser(uni.id, { studentIdHash: hashStudentId(uni.id, "NU-1001") });
    await expect(callerFor(null).auth.startSignup(base())).rejects.toThrow(/already/i);
  });
  test("university with no roster → PENDING (admin approval)", async () => {
    const open = await makeUniversity("Open", "open.edu");
    const r = await callerFor(null).auth.startSignup({ ...base(), universityId: open.id, email: "x@open.edu" });
    expect(r.status).toBe("PENDING");
  });
  test("rate limits repeated attempts from one IP", async () => {
    const c = callerFor(null);
    for (let i = 0; i < 10; i++) await c.auth.startSignup({ ...base(), studentId: `BAD-${i}` }).catch(() => {});
    await expect(c.auth.startSignup(base())).rejects.toThrow(/too many/i);
  });
});

describe("better-auth sign-up gate", () => {
  test("sign-up without startSignup is refused", async () => {
    await expect(auth.api.signUpEmail({ body: { name: "Eve", email: "eve@north.edu", password: "password123" } })).rejects.toThrow();
  });
  test("sign-up after startSignup creates a tenant-bound unverified user", async () => {
    await callerFor(null).auth.startSignup(base());
    await auth.api.signUpEmail({ body: { name: "Alice", email: `alice@${uni.emailDomain}`, password: "password123" } });
    const [u] = await adminDb.select().from(user).where(eq(user.email, "alice@north.edu"));
    expect(u.universityId).toBe(uni.id);
    expect(u.role).toBe("ALUMNUS");
    expect(u.emailVerified).toBe(false);
    expect(await adminDb.select().from(pendingSignup)).toEqual([]);
  });
});
```

Run: `bun test tests/signup.test.ts` → FAIL (`auth.startSignup` missing).

- [ ] **Step 7: `src/server/routers/auth.ts`**

Rules, in this order. Every attempt (pass or fail) writes one audit row `signup.attempt` with `meta: { ok, reason, idHashPrefix: hash.slice(0, 12) }` and `ip`, so the audit insert must be committed **before** throwing: compute the outcome inside `withTenant`, insert the audit row, return the outcome, then throw outside.

1. University exists, else `NOT_FOUND`.
2. Rate limit (count `audit_log` rows with action `signup.attempt` in last 10 min in this tenant): ≥ 10 for this `ip` or ≥ 5 for this ID hash → `TOO_MANY_REQUESTS` "Too many attempts, try again later". (No audit row for rate-limited calls.)
3. Email domain (`email.split("@")[1].toLowerCase()`) must equal `university.emailDomain`, else `BAD_REQUEST` "Use your institutional email (@domain)".
4. Email or ID hash already on a `user` row → `CONFLICT` "This student ID or email is already registered".
5. Roster: if the university has ≥ 1 roster row: matching hash required (`BAD_REQUEST` "Student ID not found in the university roster"), and `batchYear` must equal roster batchYear (`BAD_REQUEST` "Batch year does not match university records"); role = `roleFor({ graduated: row.graduated, batchYear })`, status `ACTIVE`. If no roster rows: role = `roleFor({ graduated: null, batchYear })`, status `PENDING`.
6. Upsert `pending_signup` keyed by lowercased email, `expiresAt = now + 30 min`. Return `{ role, status }`.

```ts
import { TRPCError } from "@trpc/server";
import { and, count, eq, gt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import { auditLog, pendingSignup, rosterEntry, university, user } from "@/db/schema";
import { hashStudentId, roleFor } from "../student-id";
import { audit, publicProcedure, router } from "../trpc";

const year = new Date().getFullYear();

export const authRouter = router({
  universities: publicProcedure.query(() =>
    db.select({ id: university.id, name: university.name, emailDomain: university.emailDomain }).from(university).orderBy(university.name),
  ),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const [row] = await db
      .select({
        id: user.id, name: user.name, email: user.email, role: user.role, status: user.status,
        suspendedUntil: user.suspendedUntil, universityId: user.universityId, universityName: university.name, avatarKey: user.avatarKey,
      })
      .from(user)
      .innerJoin(university, eq(university.id, user.universityId))
      .where(eq(user.id, ctx.userId));
    return row ?? null;
  }),

  startSignup: publicProcedure
    .input(
      z.object({
        universityId: z.string().uuid(),
        email: z.string().email().max(200).transform((e) => e.toLowerCase()),
        studentId: z.string().min(3).max(40),
        batchYear: z.number().int().min(1990).max(year + 8),
        department: z.string().min(2).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [uni] = await db.select().from(university).where(eq(university.id, input.universityId));
      if (!uni) throw new TRPCError({ code: "NOT_FOUND", message: "University not found" });
      const idHash = hashStudentId(uni.id, input.studentId);

      const outcome = await withTenant(uni.id, async (tx) => {
        const since = new Date(Date.now() - 10 * 60_000);
        const recent = (where: SQL) =>
          tx.select({ n: count() }).from(auditLog)
            .where(and(eq(auditLog.action, "signup.attempt"), gt(auditLog.createdAt, since), where))
            .then((r) => r[0].n);
        if ((await recent(eq(auditLog.ip, ctx.ip))) >= 10 || (await recent(sql`${auditLog.meta}->>'idHashPrefix' = ${idHash.slice(0, 12)}`)) >= 5) {
          return { error: new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" }) };
        }

        const fail = async (code: TRPCError["code"], message: string, reason: string) => {
          await audit(tx, uni.id, null, "signup.attempt", input.email, { ok: false, reason, idHashPrefix: idHash.slice(0, 12) }, ctx.ip);
          return { error: new TRPCError({ code, message }) };
        };

        if (input.email.split("@")[1] !== uni.emailDomain.toLowerCase()) {
          return fail("BAD_REQUEST", `Use your institutional email (@${uni.emailDomain})`, "domain");
        }
        const [dup] = await tx.select({ id: user.id }).from(user).where(or(eq(user.email, input.email), eq(user.studentIdHash, idHash)));
        if (dup) return fail("CONFLICT", "This student ID or email is already registered", "duplicate");

        const [{ n: rosterSize }] = await tx.select({ n: count() }).from(rosterEntry);
        let role: "STUDENT" | "ALUMNUS";
        let status: "ACTIVE" | "PENDING";
        if (rosterSize > 0) {
          const [row] = await tx.select().from(rosterEntry).where(eq(rosterEntry.studentIdHash, idHash));
          if (!row) return fail("BAD_REQUEST", "Student ID not found in the university roster", "roster");
          if (row.batchYear !== input.batchYear) return fail("BAD_REQUEST", "Batch year does not match university records", "batch");
          role = roleFor({ graduated: row.graduated, batchYear: input.batchYear });
          status = "ACTIVE";
        } else {
          role = roleFor({ graduated: null, batchYear: input.batchYear });
          status = "PENDING";
        }

        const values = {
          email: input.email, universityId: uni.id, batchYear: input.batchYear, department: input.department,
          studentIdHash: idHash, role, status, expiresAt: new Date(Date.now() + 30 * 60_000),
        };
        await tx.insert(pendingSignup).values(values).onConflictDoUpdate({ target: pendingSignup.email, set: values });
        await audit(tx, uni.id, null, "signup.attempt", input.email, { ok: true, idHashPrefix: idHash.slice(0, 12) }, ctx.ip);
        return { role, status };
      });

      if ("error" in outcome) throw outcome.error;
      return outcome;
    }),
});
```

(`pending_signup` and `user` have no RLS, so reading/writing them inside the tenant tx is fine.)

- [ ] **Step 8: `src/server/root.ts`, route handlers, auth client**

```ts
// src/server/root.ts
import { authRouter } from "./routers/auth";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({ auth: authRouter });
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
```

```ts
// src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/root";
import { createContext } from "@/server/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext: () => createContext(req.headers) });

export { handler as GET, handler as POST };
```

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

```ts
// src/lib/auth-client.ts
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/server/auth";

export const authClient = createAuthClient({ plugins: [emailOTPClient(), inferAdditionalFields<typeof auth>()] });
```

Run: `bun test tests/signup.test.ts` → PASS (10 tests).

- [ ] **Step 9: Guard test `tests/guards.test.ts`** — uses a tiny probe router so guards are tested before feature routers exist.

```ts
import { beforeEach, expect, test } from "bun:test";
import { adminProcedure, createCallerFactory, memberProcedure, modProcedure, router } from "@/server/trpc";
import { makeUniversity, makeUser, resetDb } from "./helpers";

const probe = router({
  member: memberProcedure.query(({ ctx }) => ctx.me.id),
  mod: modProcedure.query(() => "ok"),
  admin: adminProcedure.query(() => "ok"),
});
const call = createCallerFactory(probe);
const as = (userId: string | null) => call({ userId, ip: "t" });

let uniId: string;
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
});

test("anonymous → UNAUTHORIZED", async () => {
  await expect(as(null).member()).rejects.toThrow(/UNAUTHORIZED/);
});
test("unverified email → UNAUTHORIZED", async () => {
  const u = await makeUser(uniId, { emailVerified: false });
  await expect(as(u.id).member()).rejects.toThrow(/UNAUTHORIZED/);
});
test("pending, banned, active suspension → FORBIDDEN", async () => {
  for (const over of [
    { status: "PENDING" as const },
    { status: "BANNED" as const },
    { status: "SUSPENDED" as const, suspendedUntil: new Date(Date.now() + 86_400_000) },
  ]) {
    const u = await makeUser(uniId, over);
    await expect(as(u.id).member()).rejects.toThrow(/FORBIDDEN|banned|approval|suspended/i);
  }
});
test("expired suspension → allowed", async () => {
  const u = await makeUser(uniId, { status: "SUSPENDED", suspendedUntil: new Date(Date.now() - 1000) });
  expect(await as(u.id).member()).toBe(u.id);
});
test("role guards", async () => {
  const s = await makeUser(uniId, { role: "STUDENT" });
  const m = await makeUser(uniId, { role: "MODERATOR" });
  const a = await makeUser(uniId, { role: "ADMIN" });
  await expect(as(s.id).mod()).rejects.toThrow(/FORBIDDEN/);
  expect(await as(m.id).mod()).toBe("ok");
  await expect(as(m.id).admin()).rejects.toThrow(/FORBIDDEN/);
  expect(await as(a.id).admin()).toBe("ok");
});
```

Run: `bun test` → all PASS.

- [ ] **Step 10: Commit** `git add -A && git commit -m "feat(auth): roster-verified signup, better-auth OTP, tRPC guards"`

---

### Task 4: Material 3 Expressive UI kit + app providers

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Delete: `src/app/page.tsx` (replaced in Task 5), `public/*.svg` boilerplate
- Create: `src/lib/trpc.tsx`, `src/components/providers.tsx`, `src/components/ui/{icon,button,icon-button,fab,card,text-field,select,dialog,menu,tabs,toast,avatar,chip,badge,spinner,empty-state}.tsx`, `src/app/kit/page.tsx` (visual check page, kept for the demo)
- Read first: `refs/next16.md`, `refs/verified/ui.tsx`, `refs/verified/trpc-client.tsx`, `refs/m3-tokens.css`. Invoke the `frontend-design` skill for visual polish.

**Interfaces:**
- Produces `useTRPC()` and `TRPCReactProvider` from `@/lib/trpc` (client), `Providers` from `@/components/providers` (wraps react-query, tRPC, Base UI `Toast.Provider`, `Tooltip.Provider`).
- Produces UI components (all client-safe, accept `className`, forward native props):
  - `Icon({ name: string; filled?: boolean; size?: number; className? })` — Material Symbols Rounded ligature span, `aria-hidden`.
  - `Button({ variant?: "filled" | "tonal" | "outlined" | "text" | "elevated"; size?: "sm" | "md" | "lg"; icon?: string; loading?: boolean; ...ButtonHTMLAttributes })` — uses `@base-ui/react/button`. Also `ButtonLink` with same look rendering `next/link`.
  - `IconButton({ icon: string; label: string; variant?: "standard" | "filled" | "tonal" | "outlined"; selected?: boolean })` — `label` → `aria-label` + Tooltip.
  - `Fab({ icon: string; label?: string; href?: string })` — extended FAB when `label` set.
  - `Card({ variant?: "filled" | "elevated" | "outlined"; interactive?: boolean })`.
  - `TextField({ label: string; error?: string; description?: string; multiline?: boolean; rows?: number; ...InputHTMLAttributes })` — Base UI `Field` + `Input` (or `textarea` via `Field.Control render`). Filled M3 style, floating label.
  - `Select<T extends string>({ label: string; value: T; onValueChange(v: T): void; items: { value: T; label: string }[] })`.
  - `Dialog` re-export of styled parts: `Dialog.Root, Dialog.Trigger, DialogContent({ title, description?, children })`.
  - `Menu` styled: `Menu.Root, Menu.Trigger, MenuContent, MenuItem({ icon?, onClick, destructive? })`.
  - `Tabs` styled: `TabsRoot, TabsList, Tab, TabsPanel` (M3 primary tabs with sliding `Tabs.Indicator`).
  - `useToast()` → `{ success(msg: string): void; error(msg: string): void }` + `<Toaster/>` rendered in Providers.
  - `Avatar({ name: string; src?: string | null; size?: number })` — initials fallback on a tonal color picked from a hash of the name.
  - `Chip({ label: string; icon?: string; selected?: boolean; href?: string; onClick?() })`.
  - `RoleBadge({ role: Role })` — ALUMNUS: tertiary-container with `school` icon + "Alumnus"; STUDENT: secondary-container "Student"; MODERATOR: "Mod" with `shield`; ADMIN: primary "Admin". `VerifiedMark()` — `verified` filled icon in primary with tooltip "Verified by university roster".
  - `Spinner()` (M3 expressive wavy/circular indeterminate indicator, CSS only), `EmptyState({ icon, title, body?, action? })`.

**Design rules (M3 Expressive):**
- Colors: paste `refs/m3-tokens.css` light block into `:root`, dark block into `@media (prefers-color-scheme: dark) { :root { … } }`. Map in Tailwind v4: `@theme inline { --color-primary: var(--md-primary); --color-on-primary: var(--md-on-primary); … }` for **every** token, so classes like `bg-primary text-on-primary bg-surface-container-high text-on-surface-variant border-outline-variant` exist.
- Shape scale tokens: `--radius-xs: 4px; --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 28px; --radius-2xl: 32px; --radius-full: 9999px`. Buttons are pills (`rounded-full`); on `:active` they morph to `rounded-[12px]` (expressive shape morph) with `transition-[border-radius,transform,background-color] duration-200 ease-[var(--ease-spring)]` and `active:scale-[0.97]`. Cards `rounded-[28px]`. Dialogs `rounded-[28px]`. FAB `rounded-[20px]` (large FAB `rounded-[28px]`), morph to `rounded-[16px]` on press.
- Motion tokens: `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` (bouncy, for enter/press), `--ease-emphasized: cubic-bezier(0.2, 0, 0, 1)`. Popups animate from `data-starting-style` (`opacity-0 scale-90`) to normal with spring easing. Respect `prefers-reduced-motion: reduce` (disable transforms).
- State layers: hover = 8% overlay of the "on" color, focus/press = 10–12%. Implement via `before:` pseudo-element `before:bg-current before:opacity-0 hover:before:opacity-[.08] active:before:opacity-[.12]`.
- Focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary` on every interactive element.
- Type: `Roboto_Flex` from `next/font/google` as `--font-sans` with `axes: ["wdth", "opsz"]` if accepted (else default). Emphasized headlines: `font-[650] tracking-tight` (display 45–57px, headline 28–32px, title 16–22px).
- Icons: `import "material-symbols/rounded.css"` once in `layout.tsx`; class `material-symbols-rounded`; filled via `style={{ fontVariationSettings: "'FILL' 1" }}`.
- `body`: `bg-surface text-on-surface font-sans antialiased`.

- [ ] **Step 1:** Write `globals.css` with tokens, theme mapping, shape/motion vars, reduced-motion rule, and a `.material-symbols-rounded` size helper.
- [ ] **Step 2:** `src/lib/trpc.tsx` — copy the pattern from `refs/verified/trpc-client.tsx` exactly (`createTRPCContext<AppRouter>()`, `httpBatchStreamLink({ url: "/api/trpc", transformer: superjson })`, `QueryClient` with `staleTime: 30_000`). Export `TRPCReactProvider` and `useTRPC`.
- [ ] **Step 3:** Build each UI component listed above.
- [ ] **Step 4:** `layout.tsx`: Roboto Flex font, material symbols css, `<Providers>`, metadata `{ title: { template: "%s · Alumni Connect", default: "Alumni Connect" }, description: "Verified forum for students and alumni" }`.
- [ ] **Step 5:** `src/app/kit/page.tsx` renders every component in every variant (light + dark readable). Run `bun run dev`, open `http://localhost:3000/kit`, check: no console errors, focus rings visible with Tab, press morph visible.
- [ ] **Step 6:** `bun run lint` and `bunx tsc --noEmit` pass.
- [ ] **Step 7: Commit** `git commit -am "feat(ui): Material 3 Expressive kit on Base UI"` (add new files first).

---
### Task 5: App shell, auth pages, route protection

**Files:**
- Create: `src/proxy.ts`, `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx` (landing), `src/app/(public)/sign-in/page.tsx`, `src/app/(public)/sign-up/page.tsx`, `src/app/(public)/forgot-password/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/pending/page.tsx`, `src/components/app-shell.tsx`, `src/components/auth/sign-up-wizard.tsx`, `src/components/auth/otp-field.tsx`, `src/components/user-menu.tsx`
- Read first: `refs/next16.md` (Suspense rule!), `refs/verified/auth-client.ts`

**Interfaces:**
- Consumes: `authClient` (Task 3), tRPC `auth.universities`, `auth.startSignup`, `auth.me` (Task 3), UI kit (Task 4).
- Produces: `AppShell({ children })` (client) with nav destinations; `useMe()` hook in `src/components/user-menu.tsx` → `{ me, isLoading }` from `trpc.auth.me`.

**Behaviour:**
- `src/proxy.ts`: if no better-auth session cookie (`request.cookies.get("better-auth.session_token")` — check the real cookie name with `getSessionCookie` from `better-auth/cookies` and prefer that helper) and path starts with one of `/feed /p /new /search /t /u /bookmarks /notifications /settings /mod /admin /pending` → redirect to `/sign-in?next=<path>`. Signed-in users hitting `/sign-in` or `/sign-up` → redirect `/feed`. Matcher excludes `api`, `_next`, static files. Proxy is a convenience only; tRPC guards are the real check.
- `(app)/layout.tsx`: static shell (rail/bottom nav/top bar) renders immediately; the session-dependent part (user menu, role-gated nav items, the status gate) is a client component using `useMe()`. If `me.status` is `PENDING` → `router.replace("/pending")`; `SUSPENDED` (future `suspendedUntil`) or `BANNED` → full-screen notice with sign-out button. If `me === null` → `/sign-in`.
- Navigation destinations: Feed (`home`), Search (`search`), Notifications (`notifications`, badge with unread count — wired in Task 10, render the slot now), Bookmarks (`bookmark`), Profile (`person`); Moderation (`shield`, only MODERATOR/ADMIN), Admin (`admin_panel_settings`, only ADMIN). Desktop ≥ 840px: M3 navigation rail with FAB "Ask" (`edit`) on top linking `/new`. Phone: bottom navigation bar + FAB bottom-right. Active item: pill indicator in `secondary-container` that stretches in with spring easing.
- `sign-in`: email + password → `authClient.signIn.email`. On error "Email not verified" → offer "Send code" → OTP step (`authClient.emailOtp.sendVerificationOtp` then `verifyEmail`). On success `router.push(next ?? "/feed")`.
- `sign-up` wizard (3 steps, M3 linear progress at top, each step a card that slides in):
  1. **University**: Select from `auth.universities`; shows "Use your @domain email".
  2. **Identity**: student ID (helper text "Stored encrypted, never shown"), batch year (expected graduation, number input), department, institutional email, full name, password (≥ 8) → calls `auth.startSignup`; on success calls `authClient.signUp.email({ name, email, password })`. Show tRPC error messages inline on the relevant field (domain → email field, roster/batch → student ID field).
  3. **Verify**: 6-box OTP input (`otp-field.tsx`: six inputs, auto-advance, paste fills all, `inputMode="numeric"`, `autoComplete="one-time-code"`), "Resend code" (60 s cooldown). `authClient.emailOtp.verifyEmail({ email, otp })` → signed in (autoSignInAfterVerification) → if result role ALUMNUS show a celebratory "Welcome back, alumnus" screen, then `/feed` (or `/pending` if status PENDING).
  - Dev hint under the OTP field when `process.env.NODE_ENV !== "production"`: "Dev mode: the code is printed in the server terminal."
- `forgot-password`: email → `authClient.emailOtp.requestPasswordReset({ email })` → OTP + new password → `authClient.emailOtp.resetPassword(...)` → `/sign-in`.
- `pending` page: explains admin approval, sign-out button.
- Landing `(public)/page.tsx`: hero ("Ask the people who walked the path before you"), 3 feature cards (Verified alumni, Searchable archive, Your university only), CTA Sign up / Sign in. Expressive: big display type, a large shape-morphing decorative blob (CSS `border-radius` keyframes), tonal surfaces.

- [ ] **Step 1:** Implement proxy and layouts.
- [ ] **Step 2:** Implement sign-in, sign-up wizard, OTP field, forgot-password, pending page, landing.
- [ ] **Step 3: Manual check** (DB must be migrated; run seed-less with a manual university):
  ```bash
  psql postgres://postgres:postgres@localhost:5433/alumni -c "insert into university(name,slug,email_domain) values ('Northern University','nub','nub.ac.bd') on conflict do nothing"
  bun run dev
  ```
  Sign up with a `@nub.ac.bd` email (no roster → PENDING path), read OTP from the terminal, verify you land on `/pending`. Then `psql … -c "update \"user\" set status='ACTIVE'"`, reload → you reach `/feed` (404 page is fine until Task 7). Sign out, sign in again. Visit `/feed` signed out → redirected to `/sign-in?next=/feed`.
- [ ] **Step 4:** `bun run lint`, `bunx tsc --noEmit`, `bun test` all pass. `bun run build` passes (catches Suspense-rule errors).
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(ui): app shell, sign-up wizard with OTP, sign-in, password reset"`

---

### Task 6: Forum backend (posts, comments, tags, feed, search)

**Files:**
- Create: `src/server/tags.ts`, `src/server/queries/posts.ts`, `src/server/routers/post.ts`, `src/server/routers/comment.ts`, `tests/forum.test.ts`, `tests/tenant.test.ts`
- Modify: `src/server/root.ts` (add `post`, `comment`)

**Interfaces:**
- Consumes: `memberProcedure`, `modProcedure`, `audit` (Task 3), `publish` (Task 3), schema.
- Produces:
  - `normalizeTags(raw: string[]): string[]` (`@/server/tags`) — lowercase, trim, spaces/underscores → `-`, strip chars outside `[a-z0-9-]`, collapse `--`, trim `-`, drop empty, dedupe (keep first order), max 30 chars each. Throws `TRPCError BAD_REQUEST` "Max 5 tags" if more than 5 remain.
  - `type PostListItem = { id: string; title: string; excerpt: string; createdAt: Date; updatedAt: Date; score: number; commentCount: number; tags: string[]; author: AuthorInfo; myVote: -1 | 0 | 1; bookmarked: boolean; hasAlumnusReply: boolean }`
  - `type AuthorInfo = { id: string; name: string; role: Role; batchYear: number; department: string; avatarKey: string | null }`
  - `listPosts(tx: Tx, meId: string, opts: { where?: SQL; orderBy: "new" | "top" | "rank"; rankQuery?: string; offset: number; limit?: number }): Promise<{ items: PostListItem[]; nextCursor: number | null }>` (`@/server/queries/posts`) — always adds `post.deleted_at is null`. `limit` default 20. `nextCursor = offset + limit` when a further row exists (fetch limit + 1).
  - Procedures (all `memberProcedure` unless noted; inputs zod-validated):
    - `post.feed({ sort: "new" | "top" = "new", tag?: string, authorId?: string, cursor: number = 0 })` → `{ items, nextCursor }`
    - `post.search({ q: string(1..200), cursor: number = 0 })` → `{ items, nextCursor }` — `post.search @@ websearch_to_tsquery('english', q)` ordered by `ts_rank(post.search, websearch_to_tsquery('english', q)) desc`.
    - `post.byId({ id: uuid })` → `PostListItem & { body: string; attachments: { id: string; key: string; mime: string }[]; canEdit: boolean }`; `NOT_FOUND` when missing, deleted, or other tenant.
    - `post.create({ title: string(5..200), body: string(1..20000), tags: string[] (max 10 raw), attachmentIds: uuid[] (max 6) = [] })` → `{ id }`
    - `post.update({ id, title, body, tags })` → `{ id }` (author, or mod)
    - `post.remove({ id })` → `{ ok: true }` (author, or mod; mod-on-other's writes audit `post.remove`)
    - `post.tags()` → `{ name: string; count: number }[]` top 30 tags by post count (sidebar/chips)
    - `comment.list({ postId })` → `CommentItem[]` flat, ordered by `createdAt asc`, where `CommentItem = { id; parentId: string | null; body: string; createdAt; score; myVote: -1|0|1; deleted: boolean; author: AuthorInfo | null; canEdit: boolean }` — deleted comments: `body: "[removed]"`, `author: null`.
    - `comment.create({ postId, parentId?: uuid, body: string(1..10000) })` → `{ id }`
    - `comment.update({ id, body })`, `comment.remove({ id })` (author or mod)

**Rules:**
- `post.create`: if body or title matches `/https?:\/\/|www\./i` and `me.createdAt` is less than 3 days ago → `FORBIDDEN` "New accounts can post links after 3 days". Tags upserted per tenant (`insert … on conflict (university_id, name) do nothing`, then select ids). Attachments: `update attachment set post_id = new.id where id in (...) and owner_id = me and post_id is null`. Notifications (dedupe recipients, exclude author): followers of author → `FOLLOWED_USER_POST`; followers of any of the post's tags → `FOLLOWED_TAG_POST` (a user in both gets only `FOLLOWED_USER_POST`). Then `publish(tx, { universityId, kind: "post", postId })` and one `publish(... kind: "notification", userId)` per recipient.
- `comment.create`: post must exist & not deleted (`NOT_FOUND`); `parentId` must be a comment on the same post (`BAD_REQUEST`); increments `post.comment_count`; notification `REPLY_COMMENT` to parent author (if parent and not self) else `REPLY_POST` to post author (if not self); `publish` `comment` event with `postId`, plus `notification` event to recipient.
- `comment.remove`: soft delete (`deleted_at = now()`), decrement `comment_count`. Children stay.
- `hasAlumnusReply`: `exists (select 1 from comment c join "user" u on u.id = c.author_id where c.post_id = post.id and c.deleted_at is null and u.role = 'ALUMNUS')`.
- `myVote`/`bookmarked`: left join on `vote` (`target_type = 'POST'`, `user_id = meId`) and `bookmark`.
- `excerpt`: first 240 chars of body with markdown symbols (`#*_>\`[]()!`) stripped.

- [ ] **Step 1: Failing tests `tests/forum.test.ts`**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { normalizeTags } from "@/server/tags";
import { adminDb, callerFor, makeUniversity, makeUser, resetDb } from "./helpers";
import { followTag, followUser, notification, tag } from "@/db/schema";

const old = new Date(Date.now() - 10 * 86_400_000);
let uniId: string;
let alice: { id: string };
let bob: { id: string };
let alum: { id: string };

beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId, { createdAt: old });
  bob = await makeUser(uniId, { createdAt: old });
  alum = await makeUser(uniId, { role: "ALUMNUS", createdAt: old });
});

test("normalizeTags", () => {
  expect(normalizeTags(["React", " react ", "Next JS", "c++"])).toEqual(["react", "next-js", "c"]);
  expect(() => normalizeTags(["a", "b", "c", "d", "e", "f"])).toThrow(/5/);
  expect(normalizeTags(["a", "A", "a ", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
});

describe("posts", () => {
  test("create, read, edit, search, feed by tag", async () => {
    const c = callerFor(alice.id);
    const { id } = await c.post.create({ title: "Which supervisor for ML thesis?", body: "Looking for advice on **machine learning** supervisors", tags: ["ML", "Thesis"] });
    const p = await c.post.byId({ id });
    expect(p.tags.sort()).toEqual(["ml", "thesis"]);
    expect(p.canEdit).toBe(true);
    await c.post.update({ id, title: "Which supervisor for an ML thesis?", body: "Updated body about neural networks", tags: ["ml"] });
    expect((await c.post.byId({ id })).tags).toEqual(["ml"]);
    expect((await c.post.search({ q: "neural" })).items.map((i) => i.id)).toEqual([id]);
    expect((await c.post.feed({ tag: "ml" })).items).toHaveLength(1);
    expect((await c.post.feed({ tag: "thesis" })).items).toHaveLength(0);
  });

  test("only author or mod can edit/remove", async () => {
    const { id } = await callerFor(alice.id).post.create({ title: "Alice's question", body: "body", tags: [] });
    await expect(callerFor(bob.id).post.update({ id, title: "hacked title", body: "x", tags: [] })).rejects.toThrow(/FORBIDDEN/);
    await expect(callerFor(bob.id).post.remove({ id })).rejects.toThrow(/FORBIDDEN/);
    const mod = await makeUser(uniId, { role: "MODERATOR" });
    await callerFor(mod.id).post.remove({ id });
    await expect(callerFor(alice.id).post.byId({ id })).rejects.toThrow(/NOT_FOUND/);
  });

  test("new accounts cannot post links", async () => {
    const fresh = await makeUser(uniId);
    await expect(callerFor(fresh.id).post.create({ title: "Great internship", body: "apply at https://scam.example", tags: [] })).rejects.toThrow(/links/);
  });

  test("feed pagination", async () => {
    for (let i = 0; i < 25; i++) await callerFor(alice.id).post.create({ title: `Question number ${i}`, body: "b", tags: [] });
    const p1 = await callerFor(bob.id).post.feed({});
    expect(p1.items).toHaveLength(20);
    expect(p1.nextCursor).toBe(20);
    const p2 = await callerFor(bob.id).post.feed({ cursor: 20 });
    expect(p2.items).toHaveLength(5);
    expect(p2.nextCursor).toBeNull();
  });

  test("followers get notified of new posts", async () => {
    await adminDb.insert(followUser).values({ universityId: uniId, followerId: bob.id, followeeId: alice.id });
    const [t] = await adminDb.insert(tag).values({ universityId: uniId, name: "career" }).returning();
    await adminDb.insert(followTag).values({ universityId: uniId, userId: alum.id, tagId: t.id });
    await adminDb.insert(followTag).values({ universityId: uniId, userId: bob.id, tagId: t.id });
    await callerFor(alice.id).post.create({ title: "Career question here", body: "b", tags: ["career"] });
    const rows = await adminDb.select().from(notification);
    expect(rows.map((r) => `${r.userId === bob.id ? "bob" : "alum"}:${r.type}`).sort()).toEqual(["alum:FOLLOWED_TAG_POST", "bob:FOLLOWED_USER_POST"]);
  });
});

describe("comments", () => {
  test("threads 3+ levels, notifies, keeps replies of removed parent", async () => {
    const { id: postId } = await callerFor(alice.id).post.create({ title: "Thread test post", body: "b", tags: [] });
    const c1 = await callerFor(alum.id).comment.create({ postId, body: "level 1" });
    const c2 = await callerFor(alice.id).comment.create({ postId, parentId: c1.id, body: "level 2" });
    const c3 = await callerFor(alum.id).comment.create({ postId, parentId: c2.id, body: "level 3" });
    await callerFor(alum.id).comment.remove({ id: c1.id });
    const list = await callerFor(bob.id).comment.list({ postId });
    expect(list.map((c) => [c.id, c.parentId])).toEqual([[c1.id, null], [c2.id, c1.id], [c3.id, c2.id]]);
    expect(list[0]).toMatchObject({ deleted: true, body: "[removed]", author: null });
    const types = (await adminDb.select().from(notification)).map((n) => n.type).sort();
    expect(types).toEqual(["REPLY_COMMENT", "REPLY_COMMENT", "REPLY_POST"]);
    const p = await callerFor(bob.id).post.byId({ id: postId });
    expect(p.commentCount).toBe(2);
    expect(p.hasAlumnusReply).toBe(true);
  });

  test("parent must belong to same post", async () => {
    const a = await callerFor(alice.id).post.create({ title: "First post here", body: "b", tags: [] });
    const b = await callerFor(alice.id).post.create({ title: "Second post here", body: "b", tags: [] });
    const c = await callerFor(bob.id).comment.create({ postId: a.id, body: "hi" });
    await expect(callerFor(bob.id).comment.create({ postId: b.id, parentId: c.id, body: "x" })).rejects.toThrow(/BAD_REQUEST/);
  });
});
```

- [ ] **Step 2: Failing cross-tenant suite `tests/tenant.test.ts`** (extended in later tasks — keep the `asA` / `bIds` pattern)

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let asA: ReturnType<typeof callerFor>;
const bIds = {} as { userId: string; postId: string; commentId: string };

beforeAll(async () => {
  await resetDb();
  const a = await makeUniversity("A");
  const b = await makeUniversity("B");
  const old = new Date(Date.now() - 10 * 86_400_000);
  const ua = await makeUser(a.id, { createdAt: old });
  const ub = await makeUser(b.id, { createdAt: old });
  asA = callerFor(ua.id);
  const asB = callerFor(ub.id);
  const p = await asB.post.create({ title: "Secret B question", body: "only for B uniqueword", tags: ["secret"] });
  const c = await asB.comment.create({ postId: p.id, body: "B comment" });
  Object.assign(bIds, { userId: ub.id, postId: p.id, commentId: c.id });
});

describe("cross-tenant reads are impossible", () => {
  test("post.byId", () => expect(asA.post.byId({ id: bIds.postId })).rejects.toThrow(/NOT_FOUND/));
  test("post.feed", async () => expect((await asA.post.feed({})).items).toEqual([]));
  test("post.feed by tag", async () => expect((await asA.post.feed({ tag: "secret" })).items).toEqual([]));
  test("post.feed by author", async () => expect((await asA.post.feed({ authorId: bIds.userId })).items).toEqual([]));
  test("post.search", async () => expect((await asA.post.search({ q: "uniqueword" })).items).toEqual([]));
  test("post.tags", async () => expect(await asA.post.tags()).toEqual([]));
  test("comment.list", () => expect(asA.comment.list({ postId: bIds.postId })).rejects.toThrow(/NOT_FOUND/));
  test("comment.create on B post", () => expect(asA.comment.create({ postId: bIds.postId, body: "x" })).rejects.toThrow(/NOT_FOUND/));
  test("comment.remove B comment", () => expect(asA.comment.remove({ id: bIds.commentId })).rejects.toThrow(/NOT_FOUND/));
  test("post.update B post", () => expect(asA.post.update({ id: bIds.postId, title: "hijacked!", body: "x", tags: [] })).rejects.toThrow(/NOT_FOUND/));
});
```

Run `bun test tests/forum.test.ts tests/tenant.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/server/tags.ts`**

```ts
import { TRPCError } from "@trpc/server";

export function normalizeTags(raw: string[]) {
  const out: string[] = [];
  for (const r of raw) {
    const t = r.toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
  }
  if (out.length > 5) throw new TRPCError({ code: "BAD_REQUEST", message: "Max 5 tags" });
  return out;
}
```

- [ ] **Step 4: Implement `src/server/queries/posts.ts`** — one select over `post` joined to `user` (author), left join `vote`/`bookmark` for `meId`, tags via correlated subquery `coalesce((select array_agg(t.name order by t.name) from post_tag pt join tag t on t.id = pt.tag_id where pt.post_id = post.id), '{}')`, `hasAlumnusReply` via `exists(...)`. `orderBy`: `new` → `created_at desc`; `top` → `score desc, created_at desc`; `rank` → `ts_rank(search, websearch_to_tsquery('english', rankQuery)) desc`. Use drizzle `sql<T>` fragments for the subqueries. Map rows to `PostListItem` (author object, `myVote ?? 0`, `bookmarked: !!`).

- [ ] **Step 5: Implement routers `post.ts` and `comment.ts`** per the rules above. Pattern for "exists in my tenant or NOT_FOUND":

```ts
const [p] = await ctx.db.select().from(post).where(and(eq(post.id, input.id), isNull(post.deletedAt)));
if (!p) throw new TRPCError({ code: "NOT_FOUND" });
const canEdit = p.authorId === ctx.me.id || ctx.me.role === "MODERATOR" || ctx.me.role === "ADMIN";
if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });
```

Register both in `root.ts`: `router({ auth: authRouter, post: postRouter, comment: commentRouter })`.

- [ ] **Step 6:** `bun test` → all PASS.
- [ ] **Step 7: Commit** `git add -A && git commit -m "feat(forum): posts, threaded comments, tags, feed, full text search"`

---

### Task 7: Forum UI (feed, post page, composer, search, tag page)

**Files:**
- Create: `src/lib/comment-tree.ts`, `tests/comment-tree.test.ts`, `src/components/markdown.tsx`, `src/components/post-card.tsx`, `src/components/author-line.tsx`, `src/components/composer.tsx`, `src/components/comment-thread.tsx`, `src/components/comment-form.tsx`, `src/components/feed-list.tsx`, `src/app/(app)/feed/page.tsx`, `src/app/(app)/p/[id]/page.tsx`, `src/app/(app)/p/[id]/edit/page.tsx`, `src/app/(app)/new/page.tsx`, `src/app/(app)/search/page.tsx`, `src/app/(app)/t/[tag]/page.tsx`
- Read first: `refs/next16.md`, `refs/verified/misc.ts` (react-markdown)

**Interfaces:**
- Consumes: `post.*`, `comment.*` procedures (Task 6); UI kit (Task 4).
- Produces:
  - `buildTree<T extends { id: string; parentId: string | null }>(items: T[]): (T & { children: ... })[]` — type `TreeNode<T> = T & { children: TreeNode<T>[] }`. Orphans (parent missing) become roots.
  - `Markdown({ children: string })` — `react-markdown` + `remark-gfm`; links `target="_blank" rel="noopener noreferrer nofollow"`; styled prose (headings, code blocks on `surface-container-highest`, blockquote with primary left bar).
  - `PostCard({ post: PostListItem })`, `AuthorLine({ author: AuthorInfo; at: Date })` (avatar, name link `/u/[id]`, `RoleBadge`, `VerifiedMark`, "Batch 2022 · CSE", relative time via `Intl.RelativeTimeFormat`).
  - `FeedList({ input: { sort?, tag?, authorId? } | { q: string }; empty: ReactNode })` — `useInfiniteQuery(trpc.post.feed.infiniteQueryOptions(input, { getNextPageParam: (l) => l.nextCursor }))` (or `post.search` when `q`), "Load more" button + IntersectionObserver auto-load.
  - Slots used later: `PostCard` and post page render a `<VoteButtons …/>` and `<BookmarkButton …/>` placeholder area (`data-slot="post-actions"`) that Task 10 fills; leave the score as plain text for now.

- [ ] **Step 1: Failing test `tests/comment-tree.test.ts`**

```ts
import { expect, test } from "bun:test";
import { buildTree } from "@/lib/comment-tree";

test("buildTree nests by parentId and keeps order", () => {
  const t = buildTree([
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: null },
    { id: "e", parentId: "missing" },
  ]);
  expect(t.map((n) => n.id)).toEqual(["a", "d", "e"]);
  expect(t[0].children[0].children[0].id).toBe("c");
});
```

- [ ] **Step 2: Implement `buildTree`** (Map by id, one pass), run test → PASS.

```ts
export type TreeNode<T> = T & { children: TreeNode<T>[] };
export function buildTree<T extends { id: string; parentId: string | null }>(items: T[]): TreeNode<T>[] {
  const nodes = new Map(items.map((i) => [i.id, { ...i, children: [] as TreeNode<T>[] }]));
  const roots: TreeNode<T>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}
```

- [ ] **Step 3: Pages**
  - `/feed`: M3 primary Tabs "New" / "Top" (state in `?sort=`), trending tag chips row (`post.tags`), `FeedList`. Empty state: "No questions yet — be the first to ask."
  - `/p/[id]`: page component is sync, wraps an async/client inner in `<Suspense>` (see refs/next16.md); title (headline), `AuthorLine`, tags as chips (link `/t/[tag]`), `Markdown` body, attachments grid (`<img src={"/api/files/" + key} alt="Attachment" loading="lazy">`, rounded-[16px]), action row (slot for Task 10 + overflow `Menu`: Edit/Delete if `canEdit`, Report — Task 12 wires report), comment form, `CommentThread`. Comments: indent with a left rail line per level up to depth 6; deeper levels render flat under depth 6 with "↳ replying to {name}". Each comment: AuthorLine, Markdown body, Reply (inline `CommentForm`), Edit/Delete for `canEdit`. Alumni replies get a subtle `tertiary-container` left accent so students spot them.
  - `/new` and `/p/[id]/edit`: `Composer` — title TextField, body textarea with Write/Preview tabs (Preview uses `Markdown`), tag input (type + Enter/comma → chip, max 5, shows normalized form), attachment slot (Task 8 fills; render `data-slot="attachments"`). Submit → `router.push("/p/" + id)`; show tRPC error via toast.
  - `/search`: search field (`?q=`), debounced 300 ms, results `FeedList({ q })`.
  - `/t/[tag]`: header "#tag", Follow button slot (Task 10), `FeedList({ tag })`.
- [ ] **Step 4: Manual check** with `bun run dev`: create post with markdown + `<script>alert(1)</script>` in body → renders as text, no alert. Reply 3 levels deep. Search finds the post. Tag page lists it. Phone width (375px) — no horizontal scroll.
- [ ] **Step 5:** `bun run lint && bunx tsc --noEmit && bun test && bun run build` pass.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(ui): feed, post page with threaded comments, composer, search, tags"`

---
### Task 8: File uploads (MinIO) — avatars and post images

**Files:**
- Create: `src/server/storage.ts`, `src/server/routers/files.ts`, `src/app/api/files/[...key]/route.ts`, `src/components/image-uploader.tsx`, `tests/files.test.ts`
- Modify: `src/server/root.ts` (add `files`), `src/components/composer.tsx` (attachments slot)
- Read first: `refs/verified/misc.ts` (minio), `refs/next16.md` (route handler section)

**Interfaces:**
- Consumes: `memberProcedure`, schema `attachment`, `user`, `env`.
- Produces:
  - `storage` (`@/server/storage`): `minio` client, `ALLOWED_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const`, `MAX_BYTES = 5 * 1024 * 1024`, `presignPut(key: string): Promise<string>` (300 s), `presignGet(key: string): Promise<string>` (300 s), `stat(key: string): Promise<{ size: number } | null>` (null on NotFound), `remove(key: string): Promise<void>`.
  - `files.createUpload({ kind: "avatar" | "attachment", mime: keyof ALLOWED_MIME, size: number(1..MAX_BYTES) })` → `{ key: string; url: string }` with `key = ${me.universityId}/${kind}/${randomUUID()}.${ext}`.
  - `files.confirm({ key })` → `{ id: string; key: string }` — key must start with `${me.universityId}/` (else `FORBIDDEN`); `stat` null → `BAD_REQUEST` "Upload not found"; size > MAX → `remove` + `BAD_REQUEST` "File too large"; inserts `attachment` row (owner me, mime from extension). Idempotent per key (`on conflict (object_key) do nothing` + select).
  - `profile.setAvatar` is added in Task 10 and consumes an attachment key owned by me.
  - `ImageUploader({ kind; onUploaded(a: { id: string; key: string }): void; multiple?: boolean })` — hidden file input + M3 outlined button "Add image" (`add_photo_alternate`), client-side type/size check, `fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } })`, then `files.confirm`; shows per-file circular progress (indeterminate) and error toast.

**Rules:**
- `GET /api/files/[...key]`: `await connection()` not needed because it reads `req.headers`; get session via `auth.api.getSession({ headers: req.headers })` → load user → if none `401`; if `key[0] !== me.universityId` → `404`; else `302` redirect to `presignGet(key.join("/"))`. Set `Cache-Control: private, max-age=240`.
- Bucket stays private (no anonymous policy).

- [ ] **Step 1: Failing test `tests/files.test.ts`** (needs MinIO running via `bun run db:up`)

```ts
import { beforeEach, expect, test } from "bun:test";
import { callerFor, makeUniversity, makeUser, resetDb } from "./helpers";

let a: { id: string; universityId: string };
let b: { id: string; universityId: string };
beforeEach(async () => {
  await resetDb();
  a = await makeUser((await makeUniversity()).id);
  b = await makeUser((await makeUniversity()).id);
});

test("upload round-trip and tenant-scoped keys", async () => {
  const c = callerFor(a.id);
  const { key, url } = await c.files.createUpload({ kind: "attachment", mime: "image/png", size: 4 });
  expect(key.startsWith(`${a.universityId}/attachment/`)).toBe(true);
  const put = await fetch(url, { method: "PUT", body: new Uint8Array([137, 80, 78, 71]), headers: { "Content-Type": "image/png" } });
  expect(put.ok).toBe(true);
  const att = await c.files.confirm({ key });
  expect(att.key).toBe(key);
  await expect(callerFor(b.id).files.confirm({ key })).rejects.toThrow(/FORBIDDEN/);
});

test("rejects bad type, oversize, missing object", async () => {
  const c = callerFor(a.id);
  // @ts-expect-error invalid mime on purpose
  await expect(c.files.createUpload({ kind: "avatar", mime: "text/html", size: 10 })).rejects.toThrow();
  await expect(c.files.createUpload({ kind: "avatar", mime: "image/png", size: 6 * 1024 * 1024 })).rejects.toThrow();
  await expect(c.files.confirm({ key: `${a.universityId}/avatar/nope.png` })).rejects.toThrow(/not found/i);
});
```

- [ ] **Step 2:** Implement `storage.ts`, `files.ts` router, file route, register router → `bun test tests/files.test.ts` PASS.
- [ ] **Step 3:** `ImageUploader` + wire into Composer attachments slot (thumbnails grid with remove "x" before submit; pass `attachmentIds` to `post.create`).
- [ ] **Step 4: Manual check:** create a post with 2 images → visible on post page; copy an image URL, open it in a private window → 401.
- [ ] **Step 5:** lint/tsc/test/build pass. **Commit** `git add -A && git commit -m "feat(files): MinIO presigned uploads for avatars and post images"`

---

### Task 9: Social backend (votes, bookmarks, follows, notifications, profile) + SSE

**Files:**
- Create: `src/server/routers/social.ts`, `src/server/routers/notification.ts`, `src/server/routers/profile.ts`, `src/app/api/events/route.ts`, `tests/social.test.ts`
- Modify: `src/server/root.ts`, `tests/tenant.test.ts` (add cross-tenant cases)

**Interfaces:**
- Consumes: `listPosts`, `AuthorInfo` (Task 6), `publish`, `subscribe` (Task 3), `stat` (Task 8).
- Produces procedures (all `memberProcedure`):
  - `social.vote({ targetType: "POST" | "COMMENT", targetId: uuid, value: -1 | 0 | 1 })` → `{ score: number; myVote: -1 | 0 | 1 }`. Target must exist, not deleted, in tenant (`NOT_FOUND`). Cannot vote own content (`BAD_REQUEST` "You can't vote on your own post"). `value 0` deletes the vote. Recompute: `update post|comment set score = coalesce((select sum(value) from vote where target_type = $t and target_id = $id), 0)`.
  - `social.bookmark({ postId, on: boolean })` → `{ bookmarked: boolean }`; `social.bookmarks({ cursor = 0 })` → `listPosts` filtered by `exists bookmark for me`, ordered by bookmark time is not required (use `new`).
  - `social.followUser({ userId: string, on: boolean })` → `{ following: boolean }` — target must be in my university (explicit `user.universityId` filter, `NOT_FOUND`), not me (`BAD_REQUEST`).
  - `social.followTag({ tag: string, on: boolean })` → `{ following: boolean }` — tag normalized with `normalizeTags([tag])[0]`, created if missing.
  - `social.followedTags()` → `string[]`.
  - `notification.list({ cursor = 0 })` → `{ items: { id; type; createdAt; readAt: Date | null; actor: AuthorInfo; post: { id; title } | null; commentId: string | null }[]; nextCursor }` (page 30, newest first).
  - `notification.unreadCount()` → `number`.
  - `notification.markRead({ ids?: uuid[] })` → `{ ok: true }` (all mine when `ids` absent; only rows where `user_id = me`).
  - `profile.get({ id: string })` → `AuthorInfo & { bio: string | null; createdAt: Date; postCount: number; commentCount: number; followers: number; following: number; isFollowing: boolean; isMe: boolean }` — `NOT_FOUND` for other universities.
  - `profile.update({ name: string(2..80), bio: string(0..500), department: string(2..80) })` → `{ ok: true }`.
  - `profile.setAvatar({ key: string })` → `{ ok: true }` — requires an `attachment` row with that key owned by me (`NOT_FOUND`); sets `user.avatarKey`.
- SSE `GET /api/events`: session → user (ACTIVE only, else 401). `subscribe(e => …)` sends `data: {kind, postId}` when `e.universityId === me.universityId && (e.kind !== "notification" || e.userId === me.id)`. Ping comment every 15 s. Unsubscribe on `req.signal` abort. Use the SSE template in `refs/next16.md` (call `await connection()` first).

- [ ] **Step 1: Failing tests `tests/social.test.ts`**

```ts
import { beforeEach, expect, test } from "bun:test";
import { subscribe, type LiveEvent } from "@/server/events";
import { callerFor, makePost, makeUniversity, makeUser, resetDb } from "./helpers";

let uniId: string;
let alice: { id: string };
let bob: { id: string };
let carol: { id: string };
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  alice = await makeUser(uniId);
  bob = await makeUser(uniId);
  carol = await makeUser(uniId);
});

test("votes: up, change, clear, no self-vote", async () => {
  const p = await makePost(uniId, alice.id);
  expect(await callerFor(bob.id).social.vote({ targetType: "POST", targetId: p.id, value: 1 })).toEqual({ score: 1, myVote: 1 });
  expect((await callerFor(carol.id).social.vote({ targetType: "POST", targetId: p.id, value: 1 })).score).toBe(2);
  expect((await callerFor(bob.id).social.vote({ targetType: "POST", targetId: p.id, value: -1 })).score).toBe(0);
  expect((await callerFor(bob.id).social.vote({ targetType: "POST", targetId: p.id, value: 0 })).score).toBe(1);
  await expect(callerFor(alice.id).social.vote({ targetType: "POST", targetId: p.id, value: 1 })).rejects.toThrow(/own/);
  expect((await callerFor(bob.id).post.byId({ id: p.id })).myVote).toBe(0);
});

test("bookmarks", async () => {
  const p = await makePost(uniId, alice.id);
  await callerFor(bob.id).social.bookmark({ postId: p.id, on: true });
  expect((await callerFor(bob.id).social.bookmarks({})).items.map((i) => i.id)).toEqual([p.id]);
  await callerFor(bob.id).social.bookmark({ postId: p.id, on: false });
  expect((await callerFor(bob.id).social.bookmarks({})).items).toEqual([]);
});

test("follow user + notifications read flow", async () => {
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  await expect(callerFor(bob.id).social.followUser({ userId: bob.id, on: true })).rejects.toThrow(/BAD_REQUEST/);
  await callerFor(alice.id).post.create({ title: "Alice asks a question", body: "b", tags: [] });
  expect(await callerFor(bob.id).notification.unreadCount()).toBe(1);
  const list = await callerFor(bob.id).notification.list({});
  expect(list.items[0]).toMatchObject({ type: "FOLLOWED_USER_POST", actor: { id: alice.id } });
  await callerFor(bob.id).notification.markRead({});
  expect(await callerFor(bob.id).notification.unreadCount()).toBe(0);
  const prof = await callerFor(bob.id).profile.get({ id: alice.id });
  expect(prof).toMatchObject({ followers: 1, isFollowing: true, postCount: 1, isMe: false });
});

test("follow tag", async () => {
  await callerFor(bob.id).social.followTag({ tag: "Career Advice", on: true });
  expect(await callerFor(bob.id).social.followedTags()).toEqual(["career-advice"]);
});

test("live events are published on commit", async () => {
  const got: LiveEvent[] = [];
  const off = subscribe((e) => got.push(e));
  await new Promise((r) => setTimeout(r, 300)); // LISTEN connection warm-up
  await callerFor(bob.id).social.followUser({ userId: alice.id, on: true });
  await callerFor(alice.id).post.create({ title: "Live event post", body: "b", tags: [] });
  await new Promise((r) => setTimeout(r, 300));
  off();
  expect(got.some((e) => e.kind === "post" && e.universityId === uniId)).toBe(true);
  expect(got.some((e) => e.kind === "notification" && e.userId === bob.id)).toBe(true);
});
```

Add to `tests/tenant.test.ts` inside the describe:

```ts
  test("social.vote B post", () => expect(asA.social.vote({ targetType: "POST", targetId: bIds.postId, value: 1 })).rejects.toThrow(/NOT_FOUND/));
  test("social.bookmark B post", () => expect(asA.social.bookmark({ postId: bIds.postId, on: true })).rejects.toThrow(/NOT_FOUND/));
  test("social.followUser B user", () => expect(asA.social.followUser({ userId: bIds.userId, on: true })).rejects.toThrow(/NOT_FOUND/));
  test("profile.get B user", () => expect(asA.profile.get({ id: bIds.userId })).rejects.toThrow(/NOT_FOUND/));
  test("notification.list has nothing from B", async () => expect((await asA.notification.list({})).items).toEqual([]));
```

- [ ] **Step 2:** Implement routers + SSE route; register in root. `social.bookmark` on a missing/other-tenant post → `NOT_FOUND`.
- [ ] **Step 3:** `bun test` → all PASS.
- [ ] **Step 4: Manual SSE check:** `bun run dev`, sign in in the browser, then in DevTools console: `new EventSource("/api/events").onmessage = (e) => console.log(e.data)`; create a post in another tab → event logged.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(social): votes, bookmarks, follows, notifications, profiles, SSE live events"`

---

### Task 10: Social UI (votes, bookmarks, notifications, profiles, settings, live)

**Files:**
- Create: `src/lib/live.ts`, `src/components/vote-buttons.tsx`, `src/components/bookmark-button.tsx`, `src/components/follow-button.tsx`, `src/app/(app)/notifications/page.tsx`, `src/app/(app)/bookmarks/page.tsx`, `src/app/(app)/u/[id]/page.tsx`, `src/app/(app)/settings/page.tsx`
- Modify: `post-card.tsx`, post page, `comment-thread.tsx` (fill `post-actions` slots), `app-shell.tsx` (unread badge), `t/[tag]/page.tsx` (follow tag button), `feed/page.tsx` (new posts pill)

**Interfaces:**
- Consumes: Task 9 procedures, `ImageUploader` (Task 8), `/api/events`.
- Produces: `useLiveEvents()` (call once in `AppShell`) — opens `EventSource("/api/events")`, on `post` → invalidate `trpc.post.feed.pathFilter()` and set a "N new posts" counter in a tiny context; on `comment` → invalidate `trpc.comment.list.queryKey({ postId })` and `trpc.post.byId.queryKey({ id: postId })`; on `notification` → invalidate `trpc.notification.pathFilter()` and show toast "New notification". Auto-reconnect is built into EventSource; close on unmount.

**Behaviour:**
- `VoteButtons({ targetType, targetId, score, myVote, disabled? })` — vertical (post) / horizontal (comment) M3 icon toggle buttons `arrow_upward`/`arrow_downward` with filled state; optimistic update via `useMutation` `onMutate`, rollback on error with toast. Score number animates (spring scale) on change. Disabled with tooltip on own content.
- `BookmarkButton({ postId, bookmarked })` — `bookmark` icon toggle, optimistic.
- `FollowButton({ userId } | { tag }, following)` — tonal button "Follow" ↔ outlined "Following" with `check` icon morph.
- `/notifications`: list grouped by Today / Earlier; unread rows on `secondary-container` surface; text per type ("{actor} replied to your question {title}", "…replied to your comment on…", "{actor} posted {title}", "New post in a tag you follow: {title}"); click → `/p/[postId]#c-{commentId}` and mark that one read; "Mark all read" button.
- `/bookmarks`: list via `social.bookmarks` infinite query.
- `/u/[id]`: large avatar, name, `RoleBadge`, `VerifiedMark`, batch + department, bio, stats row (posts, comments, followers, following), Follow button (not on self), user's posts `FeedList({ authorId })`, Report user in overflow menu (wired in Task 12).
- `/settings`: avatar change (`ImageUploader kind="avatar"` → `profile.setAvatar`), name, department, bio (500 counter) → `profile.update`; theme note (follows system); followed tags list with unfollow chips; sign-out.
- App shell Notifications nav item shows `notification.unreadCount` badge (M3 small/large badge, refetch on live event).
- Feed shows a floating "↑ N new posts" pill (tonal, spring-in) when live posts arrive; click scrolls to top and refetches.

- [ ] **Step 1:** Build components and pages.
- [ ] **Step 2: Manual check** with two browsers (two users, same university): user B follows user A; A posts → B sees toast + badge without reload; B votes → score updates instantly; refresh keeps the vote.
- [ ] **Step 3:** lint/tsc/test/build pass. **Commit** `git add -A && git commit -m "feat(ui): votes, bookmarks, follows, notifications, profiles, settings, live updates"`

---

### Task 11: Moderation and admin backend

**Files:**
- Create: `src/server/roster-csv.ts`, `src/server/routers/moderation.ts`, `src/server/routers/admin.ts`, `tests/roster-csv.test.ts`, `tests/moderation.test.ts`
- Modify: `src/server/root.ts`, `tests/tenant.test.ts`

**Interfaces:**
- Consumes: `memberProcedure`, `modProcedure`, `adminProcedure`, `audit`, `hashStudentId`, schema.
- Produces:
  - `parseRosterCsv(text: string): { rows: { studentId: string; batchYear: number; department: string; graduated: boolean }[]; errors: { line: number; message: string }[] }` (`@/server/roster-csv`). Header line required, case-insensitive, exactly `student_id,batch_year,department,graduated`. Skips blank lines. `graduated` accepts `true/false/yes/no/1/0` (case-insensitive). Supports double-quoted fields with commas. Line numbers are 1-based file lines. Max 50 errors collected, max 20 000 rows (`errors` gets "Too many rows" and parsing stops).
  - `moderation.report({ targetType: "POST" | "COMMENT" | "USER", targetId: string, reason: string(5..500) })` (member) → `{ id }`. Target must exist in tenant (USER: explicit universityId filter) → `NOT_FOUND`. Same reporter + target with an OPEN report → returns existing id.
  - `moderation.queue({ status: "OPEN" | "RESOLVED" | "DISMISSED" = "OPEN", cursor = 0 })` (mod) → `{ items: { id; targetType; targetId; reason; status; createdAt; reporter: AuthorInfo; preview: { title?: string; body?: string; userName?: string; authorId?: string; postId?: string } | null; resolvedBy: string | null }[]; nextCursor }`, page 30, oldest first for OPEN.
  - `moderation.resolve({ reportId: uuid, action: "dismiss" | "remove" | "suspend" | "ban", days?: number(1..365), note?: string(0..500) })` (mod) → `{ ok: true }`.
    - `dismiss` → status DISMISSED.
    - `remove` → soft-delete target post/comment (USER target → `BAD_REQUEST`), status RESOLVED.
    - `suspend` → target user (USER target, or author of POST/COMMENT) `status = SUSPENDED, suspendedUntil = now + days` (`days` required), status RESOLVED.
    - `ban` → target user `status = BANNED`, delete their sessions, status RESOLVED.
    - Moderators cannot suspend/ban MODERATOR/ADMIN; nobody can act on themselves → `FORBIDDEN`.
    - Every resolve writes audit `report.<action>` with `target` = `${targetType}:${targetId}`, `meta: { reportId, days, note }`. Other OPEN reports on the same target are closed with the same status.
  - `moderation.setUserStatus({ userId, status: "ACTIVE" | "SUSPENDED" | "BANNED", days?: number(1..365) })` (mod; same role limits) → `{ ok: true }`, audit `user.status`.
  - `admin.importRoster({ csv: string(max 2_000_000 chars) })` → `{ inserted: number; updated: number; errors: { line; message }[] }` — upsert on `(university_id, student_id_hash)`; audit `roster.import` with counts. Raw IDs never stored or returned.
  - `admin.rosterStats()` → `{ total: number; graduated: number }`.
  - `admin.pendingUsers()` → `{ id; name; email; batchYear; department; role; createdAt }[]` (status PENDING, my university, emailVerified true).
  - `admin.approveUser({ userId })` → `{ ok: true }` (PENDING → ACTIVE, audit `user.approve`).
  - `admin.users({ q?: string, role?: Role, cursor = 0 })` → `{ items: (AuthorInfo & { email; status; createdAt })[]; nextCursor }` (my university only; `q` ilike name/email; page 50).
  - `admin.setRole({ userId, role: Role })` → `{ ok: true }` — not self (`BAD_REQUEST`), my university (`NOT_FOUND`), audit `user.role` with `{ from, to }`.
  - `admin.audit({ action?: string, cursor = 0 })` → `{ items: { id; action; target; ip; meta; createdAt; actor: { id; name } | null }[]; nextCursor }` page 50, newest first.
  - `admin.stats()` → `{ members: Record<Role, number>; pending: number; postsPerWeek: { week: string; posts: number; comments: number }[] (last 8 ISO weeks, zero-filled, oldest first); alumniAnsweredPct: number (0..100, posts with ≥1 non-deleted ALUMNUS comment / non-deleted posts, 0 if none); openReports: number; totalPosts: number }`.
  - Every `user` table write in these routers MUST include `eq(user.universityId, ctx.me.universityId)` in its `where`.

- [ ] **Step 1: Failing test `tests/roster-csv.test.ts`**

```ts
import { expect, test } from "bun:test";
import { parseRosterCsv } from "@/server/roster-csv";

test("parses valid rows, quoted fields, flags", () => {
  const r = parseRosterCsv(`Student_ID,Batch_Year,Department,Graduated\nNU-1,2022,CSE,true\n\n"NU-2",2028,"Electrical, Electronic",no\n`);
  expect(r.errors).toEqual([]);
  expect(r.rows).toEqual([
    { studentId: "NU-1", batchYear: 2022, department: "CSE", graduated: true },
    { studentId: "NU-2", batchYear: 2028, department: "Electrical, Electronic", graduated: false },
  ]);
});

test("reports bad header and bad rows with line numbers", () => {
  expect(parseRosterCsv("id,year\nx,1").errors[0]).toMatchObject({ line: 1 });
  const r = parseRosterCsv("student_id,batch_year,department,graduated\nNU-1,abc,CSE,true\n,2020,CSE,true\nNU-3,2020,CSE,maybe");
  expect(r.rows).toEqual([]);
  expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
});
```

- [ ] **Step 2: Failing test `tests/moderation.test.ts`**

```ts
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLog, post, user } from "@/db/schema";
import { adminDb, callerFor, makePost, makeUniversity, makeUser, resetDb } from "./helpers";

let uniId: string;
let student: { id: string };
let spammer: { id: string };
let mod: { id: string };
let admin: { id: string };
beforeEach(async () => {
  await resetDb();
  uniId = (await makeUniversity()).id;
  student = await makeUser(uniId);
  spammer = await makeUser(uniId);
  mod = await makeUser(uniId, { role: "MODERATOR" });
  admin = await makeUser(uniId, { role: "ADMIN" });
});

test("report → queue → remove → audit", async () => {
  const p = await makePost(uniId, spammer.id, { title: "Pay 5000 for referral" });
  const { id } = await callerFor(student.id).moderation.report({ targetType: "POST", targetId: p.id, reason: "Scam job offer" });
  expect((await callerFor(student.id).moderation.report({ targetType: "POST", targetId: p.id, reason: "again please" })).id).toBe(id);
  await expect(callerFor(student.id).moderation.queue({})).rejects.toThrow(/FORBIDDEN/);
  const q = await callerFor(mod.id).moderation.queue({});
  expect(q.items[0]).toMatchObject({ id, preview: { title: "Pay 5000 for referral" } });
  await callerFor(mod.id).moderation.resolve({ reportId: id, action: "remove" });
  const [row] = await adminDb.select().from(post).where(eq(post.id, p.id));
  expect(row.deletedAt).not.toBeNull();
  const logs = await adminDb.select().from(auditLog).where(eq(auditLog.action, "report.remove"));
  expect(logs).toHaveLength(1);
  expect(logs[0].actorId).toBe(mod.id);
});

test("suspend and ban via report; role limits", async () => {
  const p = await makePost(uniId, spammer.id);
  const r1 = await callerFor(student.id).moderation.report({ targetType: "POST", targetId: p.id, reason: "spam spam" });
  await expect(callerFor(mod.id).moderation.resolve({ reportId: r1.id, action: "suspend" })).rejects.toThrow(); // days required
  await callerFor(mod.id).moderation.resolve({ reportId: r1.id, action: "suspend", days: 7 });
  const [s] = await adminDb.select().from(user).where(eq(user.id, spammer.id));
  expect(s.status).toBe("SUSPENDED");
  await expect(callerFor(spammer.id).post.feed({})).rejects.toThrow(/suspended/i);
  const r2 = await callerFor(student.id).moderation.report({ targetType: "USER", targetId: admin.id, reason: "abuse of power" });
  await expect(callerFor(mod.id).moderation.resolve({ reportId: r2.id, action: "ban" })).rejects.toThrow(/FORBIDDEN/);
});

test("admin: roster import, approve, roles, stats", async () => {
  const a = callerFor(admin.id);
  const imp = await a.admin.importRoster({ csv: "student_id,batch_year,department,graduated\nNU-1,2022,CSE,true\nNU-2,2028,CSE,false" });
  expect(imp).toMatchObject({ inserted: 2, updated: 0, errors: [] });
  expect((await a.admin.importRoster({ csv: "student_id,batch_year,department,graduated\nNU-1,2022,CSE,true" })).updated).toBe(1);
  expect(await a.admin.rosterStats()).toEqual({ total: 2, graduated: 1 });
  const pending = await makeUser(uniId, { status: "PENDING" });
  expect((await a.admin.pendingUsers()).map((u) => u.id)).toEqual([pending.id]);
  await a.admin.approveUser({ userId: pending.id });
  await a.admin.setRole({ userId: student.id, role: "MODERATOR" });
  await expect(a.admin.setRole({ userId: admin.id, role: "STUDENT" })).rejects.toThrow(/BAD_REQUEST/);
  await expect(callerFor(mod.id).admin.stats()).rejects.toThrow(/FORBIDDEN/);
  const st = await a.admin.stats();
  expect(st.members.MODERATOR).toBe(2);
  expect(st.postsPerWeek).toHaveLength(8);
  expect((await a.admin.audit({})).items.map((i) => i.action)).toContain("user.role");
});
```

Add to `tests/tenant.test.ts` (inside describe; `asA` user is a STUDENT so first make an A-side admin in `beforeAll`: `adminA = callerFor((await makeUser(a.id, { role: "ADMIN" })).id)` and declare `let adminA: ReturnType<typeof callerFor>;`):

```ts
  test("moderation.report B post", () => expect(asA.moderation.report({ targetType: "POST", targetId: bIds.postId, reason: "cross tenant" })).rejects.toThrow(/NOT_FOUND/));
  test("admin.setRole B user", () => expect(adminA.admin.setRole({ userId: bIds.userId, role: "ADMIN" })).rejects.toThrow(/NOT_FOUND/));
  test("admin.approveUser B user", () => expect(adminA.admin.approveUser({ userId: bIds.userId })).rejects.toThrow(/NOT_FOUND/));
  test("moderation.setUserStatus B user", async () => {
    const modA = adminA; // admin is also a mod
    await expect(modA.moderation.setUserStatus({ userId: bIds.userId, status: "BANNED" })).rejects.toThrow(/NOT_FOUND/);
  });
  test("admin.users excludes B", async () => expect((await adminA.admin.users({})).items.map((u) => u.id)).not.toContain(bIds.userId));
  test("admin.audit excludes B", async () => expect((await adminA.admin.audit({})).items).toEqual([]));
```

- [ ] **Step 3:** Implement `roster-csv.ts`, routers; register. `bun test` → all PASS.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(mod): reports, moderation queue, suspensions, roster import, admin stats, audit"`

---

### Task 12: Moderation and admin UI

**Files:**
- Create: `src/components/report-dialog.tsx`, `src/app/(app)/mod/page.tsx`, `src/app/(app)/admin/page.tsx` (tabs), `src/components/admin/{stats-panel,roster-panel,users-panel,pending-panel,audit-panel}.tsx`
- Modify: post page + comment thread + profile page overflow menus (Report), app shell (role-gated nav already present)

**Interfaces:**
- Consumes: Task 11 procedures. `ReportDialog({ targetType, targetId, trigger })` — Dialog with reason radio presets (Spam, Scam or fake offer, Harassment, Off-topic, Other) + optional details TextField; submit → toast "Report sent to moderators".

**Behaviour:**
- `/mod` (MODERATOR/ADMIN; others see 403 EmptyState): Tabs Open / Resolved / Dismissed; each report a Card: target preview (title/body excerpt/user), reason, reporter AuthorLine, link to content; actions as M3 button group: Dismiss (text), Remove (tonal, error color), Suspend (opens Dialog with days Select 1/3/7/30/90), Ban (filled error, confirm Dialog "This blocks the account. Continue?").
- `/admin` (ADMIN only) Tabs:
  - **Overview**: stat cards (members by role, pending, open reports, alumni answered %), bar chart of posts/comments per week — plain SVG bars (no chart lib), labelled axes, values on hover via `<title>`. Use the `dataviz` skill guidance for colors (primary/tertiary tokens).
  - **Roster**: roster stats, CSV upload (`<input type="file" accept=".csv,text/csv">` → `file.text()` → `admin.importRoster`), sample CSV download link (data URL), result summary with error table (line, message).
  - **Pending**: list with Approve button.
  - **Members**: search field + role filter chips; table (phone: list) with role Select per row (disabled for self) and status.
  - **Audit log**: table: time, actor, action, target, ip; action filter; read-only, "Load more".

- [ ] **Step 1:** Build UI.
- [ ] **Step 2: Manual check:** as student report a post → as mod remove it → post gone for student → admin Audit tab shows `report.remove`. Import `docs/sample-roster.csv` (create it: 10 rows) → summary shows inserted 10.
- [ ] **Step 3:** lint/tsc/test/build pass. **Commit** `git add -A && git commit -m "feat(ui): moderation queue and admin console"`

---

### Task 13: Seed data, README, docs

**Files:**
- Create: `src/db/seed.ts`, `docs/sample-roster.csv` (if not created in Task 12)
- Modify: `README.md`

**Interfaces:**
- Consumes: schema, `hashStudentId` logic (re-implement inline with `DATABASE_ADMIN_URL` connection — seed runs as superuser; import `hashStudentId` from `@/server/student-id` is fine since it only needs env), `hashPassword` from `better-auth/crypto` (verify the export exists; if not, create users through `auth.api.signUpEmail` after inserting `pending_signup`, then set `email_verified = true`).

**Seed contents** (idempotent: `resetDb`-style truncate first, ask nothing):
- Universities: **Northern University Bangladesh** (`slug: nub`, `email_domain: nub.ac.bd`, with roster) and **Demo Tech University** (`slug: dtu`, `demo.edu`, no roster → PENDING flow demo).
- NUB roster: 200 IDs `NUB-<batch><0001..>` across batches 2018–2029, departments CSE/EEE/BBA/LLB, `graduated = batch < 2026`. Print 3 unused sample IDs (one graduated, one not) at the end so the demo signup works.
- Users (password `password123` for all, email verified, ACTIVE): `admin@nub.ac.bd` (ADMIN), `mod@nub.ac.bd` (MODERATOR), 5 alumni (`rahim.alumni@nub.ac.bd` …, batches 2018–2024), 6 students; 2 DTU users (`admin@demo.edu` ADMIN, `student@demo.edu`). Each linked to a roster ID (hash) so those IDs are "used".
- ~20 NUB posts on realistic topics (course choice, thesis supervisors, internships, interview prep, scholarships, campus life) with tags, 2–6 comments each, ≥ 60% with an alumnus reply, a few 3-level threads, random votes, a couple of follows/bookmarks, one OPEN report. 2 DTU posts (to show isolation).
- Seed writes audit rows `seed.run`.

**README** sections: what it is; stack; prerequisites (bun, docker); setup:
```bash
cp .env.example .env    # set BETTER_AUTH_SECRET (openssl rand -hex 32)
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev             # http://localhost:3000
```
demo accounts table; where OTP codes appear (server terminal); MinIO console (`http://localhost:9001`, minioadmin/minioadmin); `bun test`; architecture summary (tenancy via RLS, roles, SSE); project structure; reset (`docker compose down -v`).

- [ ] **Step 1:** Write seed; run `bun run db:seed` twice (idempotent) → prints summary + sample IDs.
- [ ] **Step 2:** Write README.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: demo seed data and README"`

---

### Task 14: Final verification

- [ ] **Step 1:** Fresh start: `docker compose down -v && bun run db:up && bun run db:migrate && bun run db:seed`.
- [ ] **Step 2:** `bun test` (all pass, paste summary), `bun run lint`, `bunx tsc --noEmit`, `bun run build` — all clean.
- [ ] **Step 3: End-to-end walkthrough** (`bun run start` after build): sign up with a printed sample roster ID → OTP from terminal → lands in feed with correct role badge; ask a question with image + tags; second browser as alumnus replies → first browser gets live notification; vote; bookmark; search; report → mod removes → audit visible to admin; DTU admin sees none of NUB's content; phone-width check of feed, post, composer, admin; keyboard-only pass of sign-in + composer (focus visible everywhere); dark mode check.
- [ ] **Step 4:** Fix anything found (each fix: failing test first where logic is involved). Commit `fix: …` per fix.

---

### Task 7R: Restyle to the minimal design (added 2026-10-16, runs after Task 7, before Task 8)

**Why:** user feedback — the M3 Expressive kit reads as a Material UI clone; wanted modern minimal like their slash-commands-dashboard. Binding design ref: `docs/superpowers/plans/refs/design-minimal.md` (+ `refs/slash-style/*`). It supersedes spec §10 and Task 4's design rules. Every later UI task follows it.

**Files:**
- Modify: `src/app/globals.css` (tokens per design-minimal.md; keep Tailwind class names that components use, or update all usages), `src/app/layout.tsx` (Google Sans Flex), every `src/components/ui/*.tsx`, `src/components/ui/styles.ts`, `src/components/app-shell.tsx`, `src/components/user-menu.tsx`, `src/components/auth/*`, `src/app/(public)/**` (landing + auth pages), `src/app/kit/*`, and the Task 7 forum components/pages so nothing references removed tokens.
- Do NOT change any component's exported name or props (later tasks depend on them). Internal markup/classes may change freely.

**Steps:**
- [ ] Replace the color/shape/motion tokens with the design-minimal set (light + dark via prefers-color-scheme). Remove blob keyframes, spring easing, shape-morph.
- [ ] Restyle each kit component (Button/ButtonLink, IconButton, Fab, Card, TextField with label above, Select, Dialog, Menu, Tabs, Toast, Avatar, Chip, RoleBadge/VerifiedMark, Spinner, EmptyState).
- [ ] App shell: slim sidebar (desktop) with tonal-pill active row + compact top bar; bottom bar on phones; "Ask" primary button instead of a big FAB on desktop (FAB stays on phones, small).
- [ ] Landing: minimal — short headline, one-line subtext, two buttons, 3 small feature rows. No blob, no giant display type. Auth pages: centered narrow card, plain.
- [ ] Forum pages from Task 7: align with tokens (no bespoke colors).
- [ ] Screenshots (headless Chromium, port 3200) of /, /sign-up, /sign-in, /kit, /feed, a post page at desktop + 375px, light + dark → scratchpad `task7r-*.png`. Compare side by side with the user's dashboard look described in design-minimal.md.
- [ ] lint, tsc, `bun test`, `bun run build` pass. Commit `refactor(ui): minimal design system`.
