CREATE TABLE "tenant_ban" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"student_id_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_ban" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_ban" ADD CONSTRAINT "tenant_ban_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_ban_email_idx" ON "tenant_ban" USING btree ("university_id","email_hash");--> statement-breakpoint
CREATE INDEX "tenant_ban_student_idx" ON "tenant_ban" USING btree ("university_id","student_id_hash");--> statement-breakpoint
CREATE POLICY "tenant_ban_tenant" ON "tenant_ban" AS PERMISSIVE FOR ALL TO "app_user" USING ("tenant_ban"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("tenant_ban"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);