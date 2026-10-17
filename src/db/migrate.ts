import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Owner-level connection; DATABASE_URL alone is enough.
const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const role = process.env.DATABASE_APP_ROLE || "app_user";
if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error("bad DATABASE_APP_ROLE");

const sql = postgres(url, { max: 1, onnotice: () => {} });

// The low-privilege role the app switches to (see src/db/index.ts). Policies
// in the migrations name it, so it must exist first; the login user must be
// able to SET ROLE to it.
await sql.unsafe(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = '${role}') then
      create role ${role} nologin;
    end if;
    if not (select rolsuper from pg_roles where rolname = current_user) then
      execute format('grant %I to %I', '${role}', current_user);
    end if;
  end $$;
  grant usage on schema public to ${role};
  -- Tables the migrations create get app access by default; migrations then
  -- narrow it where needed (e.g. audit_log is append-only).
  alter default privileges in schema public grant select, insert, update, delete on tables to ${role};
  alter default privileges in schema public grant usage, select on sequences to ${role};
`);

await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

await sql.end();
console.log("migrated");
