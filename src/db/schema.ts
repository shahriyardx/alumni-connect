import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
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

export const ROLES = [
  "OWNER",
  "ADMIN",
  "MODERATOR",
  "STAFF",
  "STUDENT",
  "ALUMNUS",
] as const;
export const STAFF_ROLES = ["OWNER", "ADMIN", "MODERATOR", "STAFF"] as const;
export const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "BANNED"] as const;
export const UNIVERSITY_STATUSES = ["PENDING", "ACTIVE", "REJECTED"] as const;
export const POST_KINDS = ["QUESTION", "ANNOUNCEMENT"] as const;
export type Role = (typeof ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Status = (typeof STATUSES)[number];
export type UniversityStatus = (typeof UNIVERSITY_STATUSES)[number];
export type PostKind = (typeof POST_KINDS)[number];

// Shared with client components (trpc.ts re-exports them for server code).
export const isMod = (r: Role) =>
  r === "MODERATOR" || r === "ADMIN" || r === "OWNER";
export const isAdmin = (r: Role) => r === "ADMIN" || r === "OWNER";
/** OWNER, ADMIN, MODERATOR, STAFF (faculty) — everyone who can post announcements. */
export const isStaff = (r: Role) =>
  (STAFF_ROLES as readonly Role[]).includes(r);

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
  emailDomain: text("email_domain"),
  status: text("status", { enum: UNIVERSITY_STATUSES })
    .default("ACTIVE")
    .notNull(),
  logoKey: text("logo_key"),
  website: text("website"),
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
    // Null only for a super admin (platform_admin row): no tenant at all.
    universityId: uuid("university_id").references(() => university.id, {
      onDelete: "cascade",
    }),
    role: text("role", { enum: ROLES }).default("STUDENT").notNull(),
    graduationYear: integer("graduation_year"),
    batchNumber: integer("batch_number"),
    department: text("department"),
    title: text("title"),
    studentIdHash: text("student_id_hash").unique(),
    idCardKey: text("id_card_key"),
    rosterMatch: boolean("roster_match"),
    studentIdHint: text("student_id_hint"),
    decidedAt: timestamp("decided_at"),
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

/** Super admins (global, no RLS). The first row is claimed at /admin. */
export const platformAdmin = pgTable("platform_admin", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: created(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---- tenant tables (RLS) ----
export const batch = pgTable(
  "batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    number: integer("number").notNull(),
    graduationYear: integer("graduation_year").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("batch_uni_number_uq").on(t.universityId, t.number),
    unique("batch_id_uni_uq").on(t.id, t.universityId),
    tenantPolicy("batch", t.universityId),
  ],
).enableRLS();

/** Admin-curated picklist; `user`/`invite`/`pendingSignup`.department stay free text (no FK). */
export const department = pgTable(
  "department",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("department_id_uni_uq").on(t.id, t.universityId),
    uniqueIndex("department_uni_lower_name_uq").on(
      t.universityId,
      sql`lower(${t.name})`,
    ),
    tenantPolicy("department", t.universityId),
  ],
).enableRLS();

export const rosterEntry = pgTable(
  "roster_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    batchId: uuid("batch_id").notNull(),
    studentIdHash: text("student_id_hash").notNull(),
    department: text("department").notNull(),
  },
  (t) => [
    uniqueIndex("roster_uni_hash_uq").on(t.universityId, t.studentIdHash),
    index("roster_batch_idx").on(t.batchId),
    foreignKey({
      name: "roster_batch_fk",
      columns: [t.batchId, t.universityId],
      foreignColumns: [batch.id, batch.universityId],
    }).onDelete("cascade"),
    tenantPolicy("roster_entry", t.universityId),
  ],
).enableRLS();

export const invite = pgTable(
  "invite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    email: text("email").notNull(),
    role: text("role", { enum: STAFF_ROLES }).notNull(),
    department: text("department"),
    title: text("title"),
    tokenHash: text("token_hash").notNull().unique(),
    // Null for platform-created OWNER invites (no in-tenant inviter).
    invitedBy: text("invited_by"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: created(),
  },
  (t) => [
    index("invite_uni_idx").on(t.universityId),
    unique("invite_id_uni_uq").on(t.id, t.universityId),
    foreignKey({
      name: "invite_invited_by_fk",
      columns: [t.invitedBy, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }).onDelete("cascade"),
    tenantPolicy("invite", t.universityId),
    // The public /invite/[token] flow doesn't know the tenant yet (that's
    // what it's looking up), so RLS can't gate it by app.university_id.
    // Instead it proves it already holds the secret token by setting
    // app.lookup_token_hash to that token's hash; this permissive SELECT
    // policy then reveals exactly the one matching row (permissive
    // policies OR together, so tenant-scoped reads are unaffected).
    pgPolicy("invite_token_lookup", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`${t.tokenHash} = nullif(current_setting('app.lookup_token_hash', true), '')`,
    }),
    // Lets findInvite() recover an invite whose accepted_at was set by a
    // sign-up that never verified and is now abandoned (see
    // routers/invites.ts): it resets accepted_at back to null on the one
    // row it already holds the secret for. Same token-hash gate as above,
    // just for UPDATE instead of SELECT.
    pgPolicy("invite_token_recover", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: sql`${t.tokenHash} = nullif(current_setting('app.lookup_token_hash', true), '')`,
      withCheck: sql`${t.tokenHash} = nullif(current_setting('app.lookup_token_hash', true), '')`,
    }),
  ],
).enableRLS();

// Holds verified roster data between auth.startSignup and better-auth sign-up (no RLS: read by auth hook).
export const pendingSignup = pgTable(
  "pending_signup",
  {
    email: text("email").primaryKey(),
    // Null for a university application: the university is created by the
    // sign-up hook, so abandoned applications leave no university rows.
    universityId: uuid("university_id").references(() => university.id, {
      onDelete: "cascade",
    }),
    applicationName: text("application_name"),
    applicationWebsite: text("application_website"),
    batchNumber: integer("batch_number"),
    graduationYear: integer("graduation_year"),
    department: text("department").notNull(),
    title: text("title"),
    studentIdHash: text("student_id_hash"),
    signupTokenHash: text("signup_token_hash"),
    idCardKey: text("id_card_key"),
    rosterMatch: boolean("roster_match"),
    studentIdHint: text("student_id_hint"),
    // Set by invites.accept; the sign-up hook re-validates the invite (it
    // may have been revoked/accepted elsewhere since) and marks it accepted.
    inviteId: uuid("invite_id"),
    role: text("role", { enum: ROLES }).notNull(),
    status: text("status", { enum: STATUSES }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    // Set when better-auth's sign-up hook claims the row; the after-hook
    // deletes it once the user exists.
    claimedAt: timestamp("claimed_at"),
    // The first super admin's claim (auth.claimSuperAdmin): no university.
    platformAdmin: boolean("platform_admin").default(false).notNull(),
  },
  (t) => [
    check(
      "pending_signup_target_ck",
      sql`${t.universityId} is not null or ${t.applicationName} is not null or ${t.platformAdmin}`,
    ),
    foreignKey({
      name: "pending_signup_invite_fk",
      columns: [t.inviteId, t.universityId],
      foreignColumns: [invite.id, invite.universityId],
    }).onDelete("cascade"),
  ],
);

export const post = pgTable(
  "post",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    universityId: universityRef(),
    authorId: text("author_id").notNull(),
    kind: text("kind", { enum: POST_KINDS }).default("QUESTION").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    score: integer("score").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    // QUESTION only; set by the post's author via post.accept.
    acceptedCommentId: uuid("accepted_comment_id"),
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
    index("post_uni_kind_created_idx").on(t.universityId, t.kind, t.createdAt),
    index("post_uni_score_idx").on(t.universityId, t.score),
    index("post_author_idx").on(t.authorId),
    index("post_search_idx").using("gin", t.search),
    unique("post_id_uni_uq").on(t.id, t.universityId),
    foreignKey({
      name: "post_author_fk",
      columns: [t.authorId, t.universityId],
      foreignColumns: [user.id, user.universityId],
    }),
    // drizzle-kit has no builder for a column-scoped ON DELETE action on a
    // composite FK, so this intentionally declares "no action" (the default)
    // and the *real*, deployed constraint — ON DELETE SET NULL
    // (accepted_comment_id) — is hand-written in drizzle/0011_accept_answer.sql.
    // A plain composite SET NULL would also null university_id, which is
    // NOT NULL on post (see the same note on `attachment`'s post FK). This is
    // deliberate drift between this declaration and the live DB: if a future
    // migration ever touches `post_accepted_comment_fk` (drizzle-kit will
    // regenerate it as "no action" from this schema), re-apply the
    // column-scoped SET NULL by hand in that migration's SQL too.
    foreignKey({
      name: "post_accepted_comment_fk",
      columns: [t.acceptedCommentId, t.universityId],
      foreignColumns: [comment.id, comment.universityId],
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
  "ANNOUNCEMENT",
  "ACCEPTED_ANSWER",
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
