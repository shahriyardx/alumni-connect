CREATE TABLE "broadcast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"actor_id" text,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"ip" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "broadcast_id" uuid;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_broadcast_id_broadcast_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON "platform_audit"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();--> statement-breakpoint
-- Cross-tenant work for platform procedures only. SECURITY DEFINER runs as
-- the migration owner, which RLS does not apply to; app_user may only call
-- these two fixed queries (counts out, one fan-out in), never read rows.
CREATE FUNCTION platform_content_counts(OUT posts bigint, OUT comments bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM post WHERE deleted_at IS NULL),
         (SELECT count(*) FROM comment WHERE deleted_at IS NULL)
$$;--> statement-breakpoint
CREATE FUNCTION platform_broadcast(b uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO notification (university_id, user_id, type, broadcast_id)
  SELECT u.university_id, u.id, 'PLATFORM_ANNOUNCEMENT', b
  FROM "user" u JOIN university un ON un.id = u.university_id
  WHERE un.status = 'ACTIVE' AND u.status = 'ACTIVE' AND u.email_verified;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_content_counts(), platform_broadcast(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_content_counts(), platform_broadcast(uuid) TO app_user;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status_before_ban" text;
