CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "department_id_uni_uq" UNIQUE("id","university_id")
);
--> statement-breakpoint
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "department_uni_lower_name_uq" ON "department" USING btree ("university_id",lower("name"));--> statement-breakpoint
CREATE POLICY "department_tenant" ON "department" AS PERMISSIVE FOR ALL TO "app_user" USING ("department"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid) WITH CHECK ("department"."university_id" = nullif(current_setting('app.university_id', true), '')::uuid);