import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
export const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
export async function asUser<T>(userId: string, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
export async function runMigrations() { await migrate(db, { migrationsFolder: "./drizzle" }); }
const l = await client.listen("new_message", (payload) => console.log(payload), () => console.log("listening"));
await l.unlisten();
await client.notify("new_message", JSON.stringify({ id: 1 }));
