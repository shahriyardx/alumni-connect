/** One tag → canonical slug ("Next JS" → "next-js"). Shared by server + composer. */
export function normalizeTag(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}
