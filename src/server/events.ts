import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { client, type Tx } from "@/db";

export type LiveEvent = {
  universityId: string;
  kind: "post" | "comment" | "notification";
  /** Omitted on kind "notification" = every member (platform broadcast). */
  userId?: string;
  postId?: string;
  /** kind "post" only: lets the author's own client skip the "new posts" pill. */
  authorId?: string;
};

const g = globalThis as unknown as {
  liveBus?: EventEmitter;
  liveListen?: Promise<unknown>;
};
g.liveBus ??= new EventEmitter().setMaxListeners(0);
const bus = g.liveBus;

/** NOTIFY is delivered only when the transaction commits. */
export async function publish(tx: Tx, e: LiveEvent) {
  await tx.execute(sql`select pg_notify('events', ${JSON.stringify(e)})`);
}

export function subscribe(fn: (e: LiveEvent) => void) {
  g.liveListen ??= client.listen("events", (payload) =>
    bus.emit("event", JSON.parse(payload)),
  );
  bus.on("event", fn);
  return () => {
    bus.off("event", fn);
  };
}
