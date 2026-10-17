import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { university, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { subscribe } from "@/server/events";
import { activeStatusError } from "@/server/trpc";

export async function GET(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const [row] = await db
    .select({ me: user, universityStatus: university.status })
    .from(user)
    .innerJoin(university, eq(university.id, user.universityId))
    .where(eq(user.id, session.user.id));
  if (!row?.me?.emailVerified) {
    return new Response("Unauthorized", { status: 401 });
  }
  const me = row.me;
  const statusError = activeStatusError({
    ...me,
    universityStatus: row.universityStatus,
  });
  if (statusError) return new Response(statusError, { status: 403 });

  const enc = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    unsubscribe?.();
  };

  const stream = new ReadableStream({
    start(controller) {
      if (req.signal.aborted) {
        cleanup();
        return;
      }
      // One misbehaving/closed client must not throw out of the shared
      // EventEmitter's synchronous `emit` and break delivery to every other
      // subscriber — so enqueue failures are swallowed here, not up top.
      const enqueue = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (d: unknown) => enqueue(`data: ${JSON.stringify(d)}\n\n`);
      unsubscribe = subscribe((e) => {
        if (e.universityId !== me.universityId) return;
        // A notification without userId (platform broadcast) is for everyone.
        if (e.kind === "notification" && e.userId && e.userId !== me.id) return;
        send({
          kind: e.kind,
          postId: e.postId,
          ...(e.kind === "post" && { authorId: e.authorId }),
        });
      });
      ping = setInterval(() => enqueue(": ping\n\n"), 15000);
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
