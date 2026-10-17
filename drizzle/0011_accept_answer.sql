ALTER TABLE "post" ADD COLUMN "accepted_comment_id" uuid;--> statement-breakpoint
-- Column-scoped SET NULL (PG 15+): only accepted_comment_id is nulled, never
-- university_id (NOT NULL on post). drizzle-kit has no builder for this, so
-- this constraint is hand-written; see the comment on post.acceptedCommentId.
ALTER TABLE "post" ADD CONSTRAINT "post_accepted_comment_fk" FOREIGN KEY ("accepted_comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE SET NULL ("accepted_comment_id") ON UPDATE no action;