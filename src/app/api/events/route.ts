import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/server/auth";
import { subscribe } from "@/server/events";
import { activeStatusError } from "@/server/trpc";

export async function GET(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const [me] = await db.select().from(user).where(eq(user.id, session.user.id));
  if (!me || !me.emailVerified || activeStatusError(me)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (d: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      const off = subscribe((e) => {
        if (e.universityId !== me.universityId) return;
        if (e.kind === "notification" && e.userId !== me.id) return;
        send({ kind: e.kind, postId: e.postId });
      });
      const ping = setInterval(() => {
        controller.enqueue(enc.encode(": ping\n\n"));
      }, 15000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        off();
        controller.close();
      });
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
