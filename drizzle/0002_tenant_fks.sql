ALTER TABLE "attachment" DROP CONSTRAINT "attachment_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "attachment" DROP CONSTRAINT "attachment_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "bookmark" DROP CONSTRAINT "bookmark_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bookmark" DROP CONSTRAINT "bookmark_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "comment" DROP CONSTRAINT "comment_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "comment" DROP CONSTRAINT "comment_parent_id_comment_id_fk";
--> statement-breakpoint
ALTER TABLE "comment" DROP CONSTRAINT "comment_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "follow_tag" DROP CONSTRAINT "follow_tag_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "follow_tag" DROP CONSTRAINT "follow_tag_tag_id_tag_id_fk";
--> statement-breakpoint
ALTER TABLE "follow_user" DROP CONSTRAINT "follow_user_follower_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "follow_user" DROP CONSTRAINT "follow_user_followee_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_actor_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_comment_id_comment_id_fk";
--> statement-breakpoint
ALTER TABLE "post" DROP CONSTRAINT "post_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "post_tag" DROP CONSTRAINT "post_tag_post_id_post_id_fk";
--> statement-breakpoint
ALTER TABLE "post_tag" DROP CONSTRAINT "post_tag_tag_id_tag_id_fk";
--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_reporter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_resolved_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "vote" DROP CONSTRAINT "vote_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_id_uni_uq" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_id_uni_uq" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_id_uni_uq" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_id_uni_uq" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_fk" FOREIGN KEY ("owner_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_fk" FOREIGN KEY ("parent_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_fk" FOREIGN KEY ("author_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_tag" ADD CONSTRAINT "follow_tag_tag_fk" FOREIGN KEY ("tag_id","university_id") REFERENCES "public"."tag"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_follower_fk" FOREIGN KEY ("follower_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_user" ADD CONSTRAINT "follow_user_followee_fk" FOREIGN KEY ("followee_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_fk" FOREIGN KEY ("actor_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_comment_fk" FOREIGN KEY ("comment_id","university_id") REFERENCES "public"."comment"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_fk" FOREIGN KEY ("author_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_fk" FOREIGN KEY ("post_id","university_id") REFERENCES "public"."post"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_fk" FOREIGN KEY ("tag_id","university_id") REFERENCES "public"."tag"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_fk" FOREIGN KEY ("reporter_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_fk" FOREIGN KEY ("resolved_by","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_fk" FOREIGN KEY ("user_id","university_id") REFERENCES "public"."user"("id","university_id") ON DELETE cascade ON UPDATE no action;