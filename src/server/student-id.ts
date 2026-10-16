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

/** Alumnus once the graduation year has passed; only ever STUDENT/ALUMNUS. */
export function roleFor({
  graduationYear,
  now = new Date(),
}: {
  graduationYear: number;
  now?: Date;
}): "STUDENT" | "ALUMNUS" {
  return graduationYear < now.getFullYear() ? "ALUMNUS" : "STUDENT";
}
