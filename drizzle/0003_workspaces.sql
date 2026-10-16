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
ALTER TABLE "batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	CONSTRAINT "invite_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pending_signup" RENAME COLUMN "batch_year" TO "graduation_year";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "batch_year" TO "graduation_year";--> statement-breakpoint
-- Hand-added: drizzle-kit drops the nullability change on renamed columns (staff have no graduation year).
ALTER TABLE "pending_signup" ALTER COLUMN "graduation_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "graduation_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_signup" ALTER COLUMN "student_id_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "university" ALTER COLUMN "email_domain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "department" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "batch_number" integer;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "signup_token_hash" text;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "id_card_key" text;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "roster_match" boolean;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "student_id_hint" text;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "university" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "university" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "university" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "batch_number" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "id_card_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "roster_match" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "student_id_hint" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_fk" FOREIGN KEY ("invited_by","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_uni_idx" ON "invite" USING btree ("university_id");--> statement-breakpoint
-- Data migration (hand-written): one batch per distinct roster batch_year, number = year.
INSERT INTO "batch" ("university_id", "number", "graduation_year")
  SELECT DISTINCT "university_id", "batch_year", "batch_year" FROM "roster_entry";--> statement-breakpoint
UPDATE "roster_entry" r SET "batch_id" = b."id" FROM "batch" b
  WHERE b."university_id" = r."university_id" AND b."number" = r."batch_year";--> statement-breakpoint
ALTER TABLE "roster_entry" ALTER COLUMN "batch_id" SET NOT NULL;--> statement-breakpoint
UPDATE "user" SET "batch_number" = "graduation_year" WHERE "role" IN ('STUDENT', 'ALUMNUS');--> statement-breakpoint
UPDATE "pending_signup" SET "batch_number" = "graduation_year";--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_batch_fk" FOREIGN KEY ("batch_id","university_id") REFERENCES "public"."batch"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roster_batch_idx" ON "roster_entry" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "roster_entry" DROP COLUMN "batch_year";--> statement-breakpoint
ALTER TABLE "roster_entry" DROP COLUMN "graduated";--> statement-breakpoint
CREATE POLICY "batch_tenant" ON "batch" AS PERMISSIVE FOR ALL TO "app_user" USING ("batch"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("batch"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invite_tenant" ON "invite" AS PERMISSIVE FOR ALL TO "app_user" USING ("invite"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("invite"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);