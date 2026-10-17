import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const g = globalThis as unknown as { pg?: postgres.Sql };
// Every app connection switches to the low-privilege role at startup, so RLS
// holds even if DATABASE_URL is the owner. ponytail: the session user could
// RESET ROLE; the app never runs caller-supplied SQL, so that needs an injection.
export const client =
  g.pg ??
  postgres(env.DATABASE_URL, {
    max: 10,
    connection: { role: env.DATABASE_APP_ROLE } as Record<string, string>,
  });
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
