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
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
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
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
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
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
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
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
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
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comment.id),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
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
  (t) => [
    uniqueIndex("tag_uni_name_uq").on(t.universityId, t.name),
    tenantPolicy("tag", t.universityId),
  ],
).enableRLS();

export const postTag = pgTable(
  "post_tag",
  {
    universityId: universityRef(),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    tenantPolicy("bookmark", t.universityId),
  ],
).enableRLS();

export const followUser = pgTable(
  "follow_user",
  {
    universityId: universityRef(),
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tagId] }),
    index("follow_tag_tag_idx").on(t.tagId),
    tenantPolicy("follow_tag", t.universityId),
  ],
).enableRLS();

export const NOTIFICATION_TYPES = [
  "REPLY_POST",
  "REPLY_COMMENT",
  "FOLLOWED_USER_POST",
  "FOLLOWED_TAG_POST",
] as const;
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => post.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comment.id, {
      onDelete: "cascade",
    }),
    readAt: timestamp("read_at"),
    createdAt: created(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.createdAt),
    tenantPolicy("notification", t.universityId),
  ],
).enableRLS();

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => post.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("attachment_post_idx").on(t.postId),
    tenantPolicy("attachment", t.universityId),
  ],
).enableRLS();

export const report = pgTable(
  "report",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type", {
      enum: ["POST", "COMMENT", "USER"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["OPEN", "RESOLVED", "DISMISSED"] })
      .default("OPEN")
      .notNull(),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: created(),
  },
  (t) => [
    index("report_uni_status_idx").on(t.universityId, t.status),
    tenantPolicy("report", t.universityId),
  ],
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
  (t) => [
    index("audit_uni_created_idx").on(t.universityId, t.createdAt),
    tenantPolicy("audit_log", t.universityId),
  ],
).enableRLS();
