import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { university, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { EXT_TO_MIME, presignGet } from "@/server/storage";
import { activeStatusError, isPlatformAdmin } from "@/server/trpc";

export type IdCardAccessResult =
  | { ok: true; url: string }
  | { ok: false; status: 401 | 403 | 404; message: string };

/**
 * OWNER/ADMIN of the target's university, or a platform admin viewing a
 * PENDING university's OWNER (the rep application card) — nothing else.
 * Reps never upload a card, but the check is scoped to OWNER-in-PENDING
 * regardless, so platform admin never widens into every tenant's students.
 */
export async function resolveIdCardAccess(
  viewerId: string | null,
  targetId: string,
): Promise<IdCardAccessResult> {
  if (!viewerId) return { ok: false, status: 401, message: "Unauthorized" };
  const [row] = await db
    .select({ me: user, universityStatus: university.status })
    .from(user)
    .leftJoin(university, eq(university.id, user.universityId))
    .where(eq(user.id, viewerId));
  if (!row?.me?.emailVerified)
    return { ok: false, status: 401, message: "Unauthorized" };
  const me = row.me;
  const statusError = activeStatusError({
    ...me,
    universityStatus: row.universityStatus,
  });
  if (statusError) return { ok: false, status: 403, message: statusError };
  const platform = await isPlatformAdmin(me);
  const sameTenantAccess = me.role === "OWNER" || me.role === "ADMIN";
  if (!platform && !sameTenantAccess)
    return { ok: false, status: 403, message: "Forbidden" };

  // Two independent grants, not mutually exclusive: an OWNER/ADMIN who
  // *also* happens to be a platform admin keeps full access to their own
  // university's cards, on top of the narrow cross-tenant PENDING-OWNER view.
  const [target] = await db
    .select({ key: user.idCardKey })
    .from(user)
    .innerJoin(university, eq(university.id, user.universityId))
    .where(
      and(
        eq(user.id, targetId),
        or(
          sameTenantAccess && me.universityId
            ? eq(user.universityId, me.universityId)
            : undefined,
          platform
            ? and(eq(user.role, "OWNER"), eq(university.status, "PENDING"))
            : undefined,
        ),
      ),
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
