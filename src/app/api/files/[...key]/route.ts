import { Readable } from "node:stream";
import { and, eq, sql } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { attachment, university, user } from "@/db/schema";
import { auth } from "@/server/auth";
import { getObject, presignGet } from "@/server/storage";
import { activeStatusError } from "@/server/trpc";

export type FileAccessResult =
  /** Image: 302 to a presigned GET (served inline). */
  | { ok: true; url: string }
  /** Document: proxied through us so we control every response header. */
  | { ok: true; key: string; headers: Record<string, string> }
  | { ok: false; status: 401 | 403 | 404; message: string };

/** RFC 5987 `filename*` value. */
const rfc5987 = (s: string) =>
  encodeURIComponent(s).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

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
      universityStatus: university.status,
    })
    .from(user)
    .innerJoin(university, eq(university.id, user.universityId))
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
      .select({
        mime: attachment.mime,
        kind: attachment.kind,
        size: attachment.size,
        filename: attachment.filename,
      })
      .from(attachment)
      .where(
        and(
          eq(attachment.objectKey, objectKey),
          // Documents and comment files die with their parent: a removed
          // comment, or a deleted post (directly or via the comment's post).
          // Post images, avatars and logos are served as before.
          sql`((attachment.kind = 'IMAGE' and attachment.comment_id is null) or (
            not exists (select 1 from post p where p.id = attachment.post_id and p.deleted_at is not null)
            and not exists (select 1 from comment c join post p on p.id = c.post_id
              where c.id = attachment.comment_id and (c.deleted_at is not null or p.deleted_at is not null))))`,
        ),
      ),
  );
  if (!att) return { ok: false, status: 404, message: "Not found" };

  if (att.kind === "IMAGE") {
    const url = await presignGet(objectKey, att.mime);
    return { ok: true, url };
  }
  // Never rendered inline: forced detected type, download disposition, and
  // nosniff (a presigned S3 GET can't set that header, hence the proxy).
  const name = att.filename ?? objectKey.split("/").pop() ?? "file";
  return {
    ok: true,
    key: objectKey,
    headers: {
      "Content-Type": att.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${rfc5987(name)}`,
      "Content-Length": String(att.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=240",
    },
  };
}

/**
 * The HTTP response for an access result (separate for tests).
 * ponytail: no Range support for proxied documents (full 200 only); add it if large-PDF seeking matters.
 */
export async function fileResponse(result: FileAccessResult) {
  if (!result.ok)
    return new Response(result.message, { status: result.status });
  if ("url" in result)
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.url,
        "Cache-Control": "private, max-age=240",
      },
    });
  const stream = await getObject(result.key);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: result.headers,
  });
}

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/files/[...key]">,
) {
  const session = await auth.api.getSession({ headers: req.headers });
  const { key } = await params;
  return fileResponse(await resolveFileAccess(session?.user.id ?? null, key));
}
