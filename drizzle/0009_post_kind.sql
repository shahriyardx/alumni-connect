ALTER TABLE "post" ADD COLUMN "kind" text DEFAULT 'QUESTION' NOT NULL;--> statement-breakpoint
CREATE INDEX "post_uni_kind_created_idx" ON "post" USING btree ("university_id","kind","created_at");