import { TRPCError } from "@trpc/server";
import { normalizeTag } from "@/lib/tags";

export function normalizeTags(raw: string[]) {
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !out.includes(t)) out.push(t);
  }
  if (out.length > 5)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Max 5 tags" });
  return out;
}
