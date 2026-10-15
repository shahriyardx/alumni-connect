import { createHash } from "node:crypto";
import { env } from "@/env";

export const normalizeStudentId = (raw: string) =>
  raw.trim().toUpperCase().replace(/\s+/g, "");

export const hashStudentId = (universityId: string, raw: string) =>
  createHash("sha256")
    .update(
      `${env.STUDENT_ID_PEPPER}:${universityId}:${normalizeStudentId(raw)}`,
    )
    .digest("hex");

export function roleFor({
  graduated,
  batchYear,
  now = new Date(),
}: {
  graduated: boolean | null;
  batchYear: number;
  now?: Date;
}) {
  if (graduated === null)
    return batchYear < now.getFullYear() ? "ALUMNUS" : "STUDENT";
  return graduated ? "ALUMNUS" : "STUDENT";
}
