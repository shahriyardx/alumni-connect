REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM app_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
