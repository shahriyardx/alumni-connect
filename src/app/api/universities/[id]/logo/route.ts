import { eq } from "drizzle-orm";
import { db } from "@/db";
import { university } from "@/db/schema";
import { EXT_TO_MIME, presignGet } from "@/server/storage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LogoAccessResult =
  | { ok: true; url: string }
  | { ok: false; status: 404 };

/**
 * Public, unauthenticated: any ACTIVE university's logo, forced to the
 * stored image type. Never takes an arbitrary object key from the request —
 * only `university.logoKey` for an id that resolves to an ACTIVE row.
 */
export async function resolveUniversityLogo(
  id: string,
): Promise<LogoAccessResult> {
  if (!UUID_RE.test(id)) return { ok: false, status: 404 };

  const [row] = await db
    .select({ status: university.status, logoKey: university.logoKey })
    .from(university)
    .where(eq(university.id, id));
  if (!row || row.status !== "ACTIVE" || !row.logoKey)
    return { ok: false, status: 404 };

  const ext = row.logoKey.slice(row.logoKey.lastIndexOf(".") + 1);
  const mime = EXT_TO_MIME[ext];
  if (!mime) return { ok: false, status: 404 };

  return { ok: true, url: await presignGet(row.logoKey, mime) };
}

export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/universities/[id]/logo">,
) {
  const { id } = await params;
  const r = await resolveUniversityLogo(id);
  if (!r.ok) return new Response("Not found", { status: r.status });
  return new Response(null, {
    status: 302,
    headers: { Location: r.url, "Cache-Control": "public, max-age=3600" },
  });
}
