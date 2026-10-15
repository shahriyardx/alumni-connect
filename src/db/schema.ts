import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  type PgTableExtraConfigValue,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
  (t) => [
    index("user_university_idx").on(t.universityId),
    unique("user_id_uni_uq").on(t.id, t.universityId),
  ],
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
    authorId: text("author_id").notNull(),
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
    unique("post_id_uni_uq").on(t.id, t.universityId),
    foreignKey({
      name: "post_author_fk",
      columns: [t.authorId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }),
    tenantPolicy("post", t.universityId),
  ],
).enableRLS();

export const comment = pgTable(
  "comment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    postId: uuid("post_id").notNull(),
    parentId: uuid("parent_id"),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t): PgTableExtraConfigValue[] => [
    index("comment_post_idx").on(t.postId),
    index("comment_author_idx").on(t.authorId),
    unique("comment_id_uni_uq").on(t.id, t.universityId),
    foreignKey({
      name: "comment_post_fk",
      columns: [t.postId, t.universityId],
      foreignColumns: [post.id, post.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "comment_parent_fk",
      columns: [t.parentId, t.universityId],
      foreignColumns: [comment.id, comment.universityId],
    }),
    foreignKey({
      name: "comment_author_fk",
      columns: [t.authorId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }),
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
    unique("tag_id_uni_uq").on(t.id, t.universityId),
    tenantPolicy("tag", t.universityId),
  ],
).enableRLS();

export const postTag = pgTable(
  "post_tag",
  {
    universityId: universityRef(),
    postId: uuid("post_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tag_tag_idx").on(t.tagId),
    foreignKey({
      name: "post_tag_post_fk",
      columns: [t.postId, t.universityId],
      foreignColumns: [post.id, post.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "post_tag_tag_fk",
      columns: [t.tagId, t.universityId],
      foreignColumns: [tag.id, tag.universityId],
    }).onDelete("cascade"),
    tenantPolicy("post_tag", t.universityId),
  ],
).enableRLS();

export const vote = pgTable(
  "vote",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull(),
    targetType: text("target_type", { enum: ["POST", "COMMENT"] }).notNull(),
    targetId: uuid("target_id").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("vote_target_idx").on(t.targetType, t.targetId),
    foreignKey({
      name: "vote_user_fk",
      columns: [t.userId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    tenantPolicy("vote", t.universityId),
  ],
).enableRLS();

export const bookmark = pgTable(
  "bookmark",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull(),
    postId: uuid("post_id").notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    foreignKey({
      name: "bookmark_user_fk",
      columns: [t.userId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "bookmark_post_fk",
      columns: [t.postId, t.universityId],
      foreignColumns: [post.id, post.universityId],
    }).onDelete("cascade"),
    tenantPolicy("bookmark", t.universityId),
  ],
).enableRLS();

export const followUser = pgTable(
  "follow_user",
  {
    universityId: universityRef(),
    followerId: text("follower_id").notNull(),
    followeeId: text("followee_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follow_user_followee_idx").on(t.followeeId),
    foreignKey({
      name: "follow_user_follower_fk",
      columns: [t.followerId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "follow_user_followee_fk",
      columns: [t.followeeId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    tenantPolicy("follow_user", t.universityId),
  ],
).enableRLS();

export const followTag = pgTable(
  "follow_tag",
  {
    universityId: universityRef(),
    userId: text("user_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tagId] }),
    index("follow_tag_tag_idx").on(t.tagId),
    foreignKey({
      name: "follow_tag_user_fk",
      columns: [t.userId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "follow_tag_tag_fk",
      columns: [t.tagId, t.universityId],
      foreignColumns: [tag.id, tag.universityId],
    }).onDelete("cascade"),
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
    userId: text("user_id").notNull(),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    actorId: text("actor_id").notNull(),
    postId: uuid("post_id"),
    commentId: uuid("comment_id"),
    readAt: timestamp("read_at"),
    createdAt: created(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.createdAt),
    foreignKey({
      name: "notification_user_fk",
      columns: [t.userId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_actor_fk",
      columns: [t.actorId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_post_fk",
      columns: [t.postId, t.universityId],
      foreignColumns: [post.id, post.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_comment_fk",
      columns: [t.commentId, t.universityId],
      foreignColumns: [comment.id, comment.universityId],
    }).onDelete("cascade"),
    tenantPolicy("notification", t.universityId),
  ],
).enableRLS();

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    ownerId: text("owner_id").notNull(),
    postId: uuid("post_id"),
    objectKey: text("object_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("attachment_post_idx").on(t.postId),
    foreignKey({
      name: "attachment_owner_fk",
      columns: [t.ownerId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    // No onDelete action: a composite SET NULL would null university_id too; posts are only soft-deleted.
    foreignKey({
      name: "attachment_post_fk",
      columns: [t.postId, t.universityId],
      foreignColumns: [post.id, post.universityId],
    }),
    tenantPolicy("attachment", t.universityId),
  ],
).enableRLS();

export const report = pgTable(
  "report",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    reporterId: text("reporter_id").notNull(),
    targetType: text("target_type", {
      enum: ["POST", "COMMENT", "USER"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["OPEN", "RESOLVED", "DISMISSED"] })
      .default("OPEN")
      .notNull(),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: created(),
  },
  (t) => [
    index("report_uni_status_idx").on(t.universityId, t.status),
    foreignKey({
      name: "report_reporter_fk",
      columns: [t.reporterId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "report_resolved_by_fk",
      columns: [t.resolvedBy, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }),
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
