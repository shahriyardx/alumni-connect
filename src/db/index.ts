import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const g = globalThis as unknown as { pg?: postgres.Sql };
export const client = g.pg ?? postgres(env.DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Run fn in a transaction where RLS sees only rows of this university. */
export function withTenant<T>(
  universityId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.university_id', ${universityId}, true)`,
    );
    return fn(tx);
  });
}
