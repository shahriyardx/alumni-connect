ALTER TABLE "pending_signup" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_id_uni_uq" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_invite_fk" FOREIGN KEY ("invite_id","university_id") REFERENCES "public"."invite"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "invite_token_lookup" ON "invite" AS PERMISSIVE FOR SELECT TO "app_user" USING ("invite"."token_hash" = nullif(current_setting('app.lookup_token_hash', true), ''));