import { sql, type SQL } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, timestamp, boolean, integer, bigint, index, uniqueIndex, customType, pgPolicy, pgRole } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  role: text("role", { enum: ["student", "alumni", "admin"] }).default("student").notNull(),
  gradYear: integer("grad_year"),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_userId_idx").on(t.userId)]);
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"), refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"), password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull(),
}, (t) => [index("account_userId_idx").on(t.userId)]);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export const postStatus = pgEnum("post_status", ["draft", "published"]);
export const appUser = pgRole("app_user").existing();
export const post = pgTable("post", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorId: text("author_id").notNull().references(() => user.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: postStatus("status").default("draft").notNull(),
  search: tsvector("search").generatedAlwaysAs(
    (): SQL => sql`to_tsvector('english', coalesce(${post.title}, '') || ' ' || coalesce(${post.body}, ''))`),
}, (t) => [
  uniqueIndex("post_slug_uq").on(t.slug),
  index("post_search_idx").using("gin", t.search),
  pgPolicy("post_owner", { for: "all", to: appUser,
    using: sql`${t.authorId} = current_setting('app.user_id', true)`,
    withCheck: sql`${t.authorId} = current_setting('app.user_id', true)` }),
]).enableRLS();
