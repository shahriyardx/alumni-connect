ALTER TABLE "pending_signup" ALTER COLUMN "university_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "application_name" text;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "application_website" text;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_target_ck" CHECK ("pending_signup"."university_id" is not null or "pending_signup"."application_name" is not null);