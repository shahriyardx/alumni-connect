CREATE TABLE "follow_post" (
	"university_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_post_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_followed_post" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_post" ADD CONSTRAINT "follow_post_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_post" ADD CONSTRAINT "follow_post_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_post" ADD CONSTRAINT "follow_post_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_post_post_idx" ON "follow_post" USING btree ("post_id");--> statement-breakpoint
-- Hand-written: authors follow their existing posts.
INSERT INTO "follow_post" ("university_id", "user_id", "post_id")
SELECT "university_id", "author_id", "id" FROM "post";
