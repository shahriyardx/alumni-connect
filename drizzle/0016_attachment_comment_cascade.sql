ALTER TABLE "attachment" DROP CONSTRAINT "attachment_comment_fk";
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_fk" FOREIGN KEY ("comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE cascade ON UPDATE no action;