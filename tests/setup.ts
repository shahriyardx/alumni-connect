// tests/setup.ts — migrate the test DB once per run
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_ADMIN_URL ?? "", {
  max: 1,
  onnotice: () => {},
});
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
