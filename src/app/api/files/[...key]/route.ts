import { eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { attachment, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { presignGet } from "@/server/storage";
import { activeStatusError } from "@/server/trpc";

export type FileAccessResult =
  | { ok: true; url: string }
  | { ok: false; status: 401 | 403 | 404; message: string };

/**
 * All the authorization + lookup logic behind `GET /api/files/[...key]`,
 * pulled out of the route handler so it can be exercised directly in tests
 * without needing a real better-auth session/cookie.
 */
export async function resolveFileAccess(
  userId: string | null,
  key: string[],
): Promise<FileAccessResult> {
  if (!userId) return { ok: false, status: 401, message: "Unauthorized" };

  const [me] = await db
    .select({
      universityId: user.universityId,
      status: user.status,
      suspendedUntil: user.suspendedUntil,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (!me || !me.emailVerified) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const statusError = activeStatusError(me);
  if (statusError) return { ok: false, status: 403, message: statusError };

  const traversal = key.some(
    (seg) => !seg || seg === "." || seg === ".." || /[/\\]/.test(seg),
  );
  if (traversal) return { ok: false, status: 404, message: "Not found" };
  if (key[0] !== me.universityId) {
    return { ok: false, status: 404, message: "Not found" };
  }

  const objectKey = key.join("/");
  // Only ever serve objects that cleared `files.confirm` (type/size checked,
  // owned row exists) — something PUT to a presigned URL but never confirmed
  // must not be fetchable here.
  const [att] = await withTenant(me.universityId, (tx) =>
    tx
      .select({ mime: attachment.mime })
      .from(attachment)
      .where(eq(attachment.objectKey, objectKey)),
  );
  if (!att) return { ok: false, status: 404, message: "Not found" };

  const url = await presignGet(objectKey, att.mime);
  return { ok: true, url };
}

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/files/[...key]">,
) {
  const session = await auth.api.getSession({ headers: req.headers });
  const { key } = await params;
  const result = await resolveFileAccess(session?.user.id ?? null, key);
  if (!result.ok) {
    return new Response(result.message, { status: result.status });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: result.url, "Cache-Control": "private, max-age=240" },
  });
}
