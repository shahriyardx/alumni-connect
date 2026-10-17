CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"kind" text DEFAULT 'IMAGE' NOT NULL,
	"filename" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "attachment_one_parent" CHECK ("attachment"."post_id" is null or "attachment"."comment_id" is null)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"graduation_year" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batch_uni_number_uq" UNIQUE("university_id","number"),
	CONSTRAINT "batch_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "bookmark" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookmark_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "broadcast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"actor_id" text,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "comment_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "department_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "follow_tag" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	CONSTRAINT "follow_tag_user_id_tag_id_pk" PRIMARY KEY("user_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "follow_user" (
	"university_id" uuid NOT NULL,
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	CONSTRAINT "follow_user_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text,
	"title" text,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invite_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"broadcast_id" uuid,
	"post_id" uuid,
	"comment_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_signup" (
	"email" text PRIMARY KEY NOT NULL,
	"university_id" uuid,
	"application_name" text,
	"application_website" text,
	"batch_number" integer,
	"graduation_year" integer,
	"department" text NOT NULL,
	"title" text,
	"student_id_hash" text,
	"signup_token_hash" text,
	"id_card_key" text,
	"roster_match" boolean,
	"student_id_hint" text,
	"invite_id" uuid,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"claimed_at" timestamp,
	"platform_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pending_signup_target_ck" CHECK ("pending_signup"."university_id" is not null or "pending_signup"."application_name" is not null or "pending_signup"."platform_admin")
);
--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"kind" text DEFAULT 'QUESTION' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"accepted_comment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("post"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("post"."body", '')), 'B')) STORED,
	CONSTRAINT "post_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "post_tag" (
	"university_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "post_tag_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id_hash" text NOT NULL,
	"department" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tag_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_ban" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"student_id_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "university" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email_domain" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"logo_key" text,
	"website" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "university_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"university_id" uuid,
	"role" text DEFAULT 'STUDENT' NOT NULL,
	"graduation_year" integer,
	"batch_number" integer,
	"department" text,
	"title" text,
	"student_id_hash" text,
	"id_card_key" text,
	"roster_match" boolean,
	"student_id_hint" text,
	"decided_at" timestamp,
	"bio" text,
	"avatar_key" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"suspended_until" timestamp,
	"notify_reply_post" boolean DEFAULT true NOT NULL,
	"notify_reply_comment" boolean DEFAULT true NOT NULL,
	"notify_announcements" boolean DEFAULT true NOT NULL,
	"notify_followed_tag" boolean DEFAULT true NOT NULL,
	"notify_accepted_answer" boolean DEFAULT true NOT NULL,
	"email_digest" text DEFAULT 'off' NOT NULL,
	"last_digest_at" timestamp,
	"status_before_ban" text,
	"platform_banned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_student_id_hash_unique" UNIQUE("student_id_hash"),
	CONSTRAINT "user_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "vote_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_fk" FOREIGN KEY ("owner_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_fk" FOREIGN KEY ("comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_fk" FOREIGN KEY ("parent_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_fk" FOREIGN KEY ("author_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_tag_fk" FOREIGN KEY ("tag_id","university_id") REFERENCES "public"."tag"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_follower_fk" FOREIGN KEY ("follower_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_followee_fk" FOREIGN KEY ("followee_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_fk" FOREIGN KEY ("invited_by","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_broadcast_id_broadcast_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_fk" FOREIGN KEY ("actor_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_comment_fk" FOREIGN KEY ("comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_invite_fk" FOREIGN KEY ("invite_id","university_id") REFERENCES "public"."invite"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_fk" FOREIGN KEY ("author_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_accepted_comment_fk" FOREIGN KEY ("accepted_comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE SET NULL ("accepted_comment_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_fk" FOREIGN KEY ("tag_id","university_id") REFERENCES "public"."tag"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_fk" FOREIGN KEY ("reporter_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_fk" FOREIGN KEY ("resolved_by","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_batch_fk" FOREIGN KEY ("batch_id","university_id") REFERENCES "public"."batch"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_ban" ADD CONSTRAINT "tenant_ban_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachment_post_idx" ON "attachment" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "attachment_comment_idx" ON "attachment" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "audit_uni_created_idx" ON "audit_log" USING btree ("university_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_post_idx" ON "comment" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "comment_author_idx" ON "comment" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_uni_lower_name_uq" ON "department" USING btree ("university_id",lower("name"));--> statement-breakpoint
CREATE INDEX "follow_tag_tag_idx" ON "follow_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "follow_user_followee_idx" ON "follow_user" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "invite_uni_idx" ON "invite" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_uni_created_idx" ON "post" USING btree ("university_id","created_at");--> statement-breakpoint
CREATE INDEX "post_uni_kind_created_idx" ON "post" USING btree ("university_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "post_uni_score_idx" ON "post" USING btree ("university_id","score");--> statement-breakpoint
CREATE INDEX "post_author_idx" ON "post" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_search_idx" ON "post" USING gin ("search");--> statement-breakpoint
CREATE INDEX "post_tag_tag_idx" ON "post_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "report_uni_status_idx" ON "report" USING btree ("university_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_uni_hash_uq" ON "roster_entry" USING btree ("university_id","student_id_hash");--> statement-breakpoint
CREATE INDEX "roster_batch_idx" ON "roster_entry" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_uni_name_uq" ON "tag" USING btree ("university_id","name");--> statement-breakpoint
CREATE INDEX "tenant_ban_email_idx" ON "tenant_ban" USING btree ("university_id","email_hash");--> statement-breakpoint
CREATE INDEX "tenant_ban_student_idx" ON "tenant_ban" USING btree ("university_id","student_id_hash");--> statement-breakpoint
CREATE INDEX "user_university_idx" ON "user" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "vote_target_idx" ON "vote" USING btree ("target_type","target_id");--> statement-breakpoint
-- Hand-written below. post_accepted_comment_fk above is edited to a
-- column-scoped SET NULL (PG 15+): only accepted_comment_id is nulled, never
-- university_id. See the note on that FK in src/db/schema.ts.
CREATE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();--> statement-breakpoint
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON "platform_audit"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
