import { beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { resolveUniversityLogo } from "@/app/api/universities/[id]/logo/route";
import { university } from "@/db/schema";
import { adminDb, makeUniversity, resetDb } from "./helpers";

beforeEach(resetDb);

test("404 for a missing id, a non-ACTIVE university, and an ACTIVE university with no logo", async () => {
  expect(await resolveUniversityLogo(randomUUID())).toEqual({
    ok: false,
    status: 404,
  });
  // Not even a UUID.
  expect(await resolveUniversityLogo("not-a-uuid")).toEqual({
    ok: false,
    status: 404,
  });

  const active = await makeUniversity();
  expect(await resolveUniversityLogo(active.id)).toEqual({
    ok: false,
    status: 404,
  });

  await adminDb
    .update(university)
    .set({ status: "PENDING", logoKey: `${active.id}/logo/f/x.png` })
    .where(eq(university.id, active.id));
  expect(await resolveUniversityLogo(active.id)).toEqual({
    ok: false,
    status: 404,
  });

  await adminDb
    .update(university)
    .set({ status: "REJECTED" })
    .where(eq(university.id, active.id));
  expect(await resolveUniversityLogo(active.id)).toEqual({
    ok: false,
    status: 404,
  });
});

test("ACTIVE university with a logo: a presigned URL forcing the stored image type", async () => {
  const uni = await makeUniversity();
  const logoKey = `${uni.id}/logo/f/${randomUUID()}.webp`;
  await adminDb
    .update(university)
    .set({ logoKey })
    .where(eq(university.id, uni.id));

  const r = await resolveUniversityLogo(uni.id);
  expect(r.ok).toBe(true);
  if (r.ok) {
    const u = new URL(r.url);
    expect(u.pathname.endsWith(logoKey)).toBe(true);
    expect(u.searchParams.get("response-content-type")).toBe("image/webp");
  }
});
