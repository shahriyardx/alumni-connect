ALTER TABLE "attachment" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "kind" text DEFAULT 'IMAGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_fk" FOREIGN KEY ("comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_comment_idx" ON "attachment" USING btree ("comment_id");--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_one_parent" CHECK ("attachment"."post_id" is null or "attachment"."comment_id" is null);