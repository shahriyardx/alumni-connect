import { expect, test } from "bun:test";
import {
  hashStudentId,
  normalizeStudentId,
  roleFor,
} from "@/server/student-id";

test("normalize trims, uppercases, strips inner spaces", () => {
  expect(normalizeStudentId(" nu-2020 0711 ")).toBe("NU-20200711");
});

test("hash is stable across formatting and differs per university", () => {
  expect(hashStudentId("u1", " nu-2020 0711 ")).toBe(
    hashStudentId("u1", "NU-20200711"),
  );
  expect(hashStudentId("u1", "X1")).not.toBe(hashStudentId("u2", "X1"));
  expect(hashStudentId("u1", "X1")).toMatch(/^[0-9a-f]{64}$/);
});

test("roleFor: alumnus once the graduation year has passed", () => {
  const now = new Date("2026-10-16");
  expect(roleFor({ graduationYear: 2025, now })).toBe("ALUMNUS");
  expect(roleFor({ graduationYear: 2026, now })).toBe("STUDENT");
  expect(roleFor({ graduationYear: 2030, now })).toBe("STUDENT");
});
