import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrated");
