import { TRPCError } from "@trpc/server";

export function normalizeTags(raw: string[]) {
  const out: string[] = [];
  for (const r of raw) {
    const t = r
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
  }
  if (out.length > 5)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Max 5 tags" });
  return out;
}
