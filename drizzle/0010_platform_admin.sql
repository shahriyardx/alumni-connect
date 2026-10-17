CREATE TABLE "platform_admin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_signup" DROP CONSTRAINT "pending_signup_target_ck";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "university_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD COLUMN "platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_target_ck" CHECK ("pending_signup"."university_id" is not null or "pending_signup"."application_name" is not null or "pending_signup"."platform_admin");