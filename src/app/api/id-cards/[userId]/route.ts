import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/server/auth";
import { EXT_TO_MIME, presignGet } from "@/server/storage";
import { activeStatusError, isPlatformAdmin } from "@/server/trpc";

export type IdCardAccessResult =
  | { ok: true; url: string }
  | { ok: false; status: 401 | 403 | 404; message: string };

/** OWNER/ADMIN of the target's university (or a platform admin) only. */
export async function resolveIdCardAccess(
  viewerId: string | null,
  targetId: string,
): Promise<IdCardAccessResult> {
  if (!viewerId) return { ok: false, status: 401, message: "Unauthorized" };
  const [me] = await db.select().from(user).where(eq(user.id, viewerId));
  if (!me?.emailVerified)
    return { ok: false, status: 401, message: "Unauthorized" };
  const statusError = activeStatusError(me);
  if (statusError) return { ok: false, status: 403, message: statusError };
  const platform = isPlatformAdmin(me);
  if (!platform && me.role !== "OWNER" && me.role !== "ADMIN")
    return { ok: false, status: 403, message: "Forbidden" };

  const [target] = await db
    .select({ key: user.idCardKey })
    .from(user)
    .where(
      platform
        ? eq(user.id, targetId)
        : and(eq(user.id, targetId), eq(user.universityId, me.universityId)),
    );
  const mime = target?.key && EXT_TO_MIME[target.key.split(".").pop() ?? ""];
  if (!target?.key || !mime)
    return { ok: false, status: 404, message: "Not found" };
  return { ok: true, url: await presignGet(target.key, mime) };
}

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/id-cards/[userId]">,
) {
  const session = await auth.api.getSession({ headers: req.headers });
  const { userId } = await params;
  const r = await resolveIdCardAccess(session?.user.id ?? null, userId);
  const headers = { "Cache-Control": "private, no-store" };
  if (!r.ok) return new Response(r.message, { status: r.status, headers });
  return new Response(null, {
    status: 302,
    headers: { ...headers, Location: r.url },
  });
}
