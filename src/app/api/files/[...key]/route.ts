import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/server/auth";
import { presignGet } from "@/server/storage";

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/files/[...key]">,
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const [me] = await db
    .select({ universityId: user.universityId })
    .from(user)
    .where(eq(user.id, session.user.id));
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  if (key[0] !== me.universityId)
    return new Response("Not found", { status: 404 });

  const url = await presignGet(key.join("/"));
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, max-age=240" },
  });
}
