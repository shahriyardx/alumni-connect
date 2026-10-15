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
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bookmark" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookmark_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "bookmark" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "follow_tag" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "follow_tag_user_id_tag_id_pk" PRIMARY KEY("user_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "follow_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "follow_user" (
	"university_id" uuid NOT NULL,
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	CONSTRAINT "follow_user_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
ALTER TABLE "follow_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pending_signup" (
	"email" text PRIMARY KEY NOT NULL,
	"university_id" uuid NOT NULL,
	"batch_year" integer NOT NULL,
	"department" text NOT NULL,
	"student_id_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("post"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("post"."body", '')), 'B')) STORED
);
--> statement-breakpoint
ALTER TABLE "post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_tag" (
	"university_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "post_tag_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "post_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roster_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"student_id_hash" text NOT NULL,
	"batch_year" integer NOT NULL,
	"department" text NOT NULL,
	"graduated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "university" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email_domain" text NOT NULL,
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
	"university_id" uuid NOT NULL,
	"role" text DEFAULT 'STUDENT' NOT NULL,
	"batch_year" integer NOT NULL,
	"department" text NOT NULL,
	"student_id_hash" text,
	"bio" text,
	"avatar_key" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"suspended_until" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_student_id_hash_unique" UNIQUE("student_id_hash")
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
ALTER TABLE "vote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachment_post_idx" ON "attachment" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "audit_uni_created_idx" ON "audit_log" USING btree ("university_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_post_idx" ON "comment" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "comment_author_idx" ON "comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "follow_tag_tag_idx" ON "follow_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "follow_user_followee_idx" ON "follow_user" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "post_uni_created_idx" ON "post" USING btree ("university_id","created_at");--> statement-breakpoint
CREATE INDEX "post_uni_score_idx" ON "post" USING btree ("university_id","score");--> statement-breakpoint
CREATE INDEX "post_author_idx" ON "post" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_search_idx" ON "post" USING gin ("search");--> statement-breakpoint
CREATE INDEX "post_tag_tag_idx" ON "post_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "report_uni_status_idx" ON "report" USING btree ("university_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_uni_hash_uq" ON "roster_entry" USING btree ("university_id","student_id_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_uni_name_uq" ON "tag" USING btree ("university_id","name");--> statement-breakpoint
CREATE INDEX "user_university_idx" ON "user" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "vote_target_idx" ON "vote" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE POLICY "attachment_tenant" ON "attachment" AS PERMISSIVE FOR ALL TO "app_user" USING ("attachment"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("attachment"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_log_tenant" ON "audit_log" AS PERMISSIVE FOR ALL TO "app_user" USING ("audit_log"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("audit_log"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "bookmark_tenant" ON "bookmark" AS PERMISSIVE FOR ALL TO "app_user" USING ("bookmark"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("bookmark"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "comment_tenant" ON "comment" AS PERMISSIVE FOR ALL TO "app_user" USING ("comment"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("comment"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "follow_tag_tenant" ON "follow_tag" AS PERMISSIVE FOR ALL TO "app_user" USING ("follow_tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("follow_tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "follow_user_tenant" ON "follow_user" AS PERMISSIVE FOR ALL TO "app_user" USING ("follow_user"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("follow_user"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notification_tenant" ON "notification" AS PERMISSIVE FOR ALL TO "app_user" USING ("notification"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("notification"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "post_tenant" ON "post" AS PERMISSIVE FOR ALL TO "app_user" USING ("post"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("post"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "post_tag_tenant" ON "post_tag" AS PERMISSIVE FOR ALL TO "app_user" USING ("post_tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("post_tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "report_tenant" ON "report" AS PERMISSIVE FOR ALL TO "app_user" USING ("report"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("report"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "roster_entry_tenant" ON "roster_entry" AS PERMISSIVE FOR ALL TO "app_user" USING ("roster_entry"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("roster_entry"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tag_tenant" ON "tag" AS PERMISSIVE FOR ALL TO "app_user" USING ("tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("tag"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "vote_tenant" ON "vote" AS PERMISSIVE FOR ALL TO "app_user" USING ("vote"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("vote"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);