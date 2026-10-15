import { expect, test } from "bun:test";
import { safeNext } from "@/lib/safe-next";

test("keeps same-origin paths", () => {
  expect(safeNext("/feed")).toBe("/feed");
  expect(safeNext("/p/1?x=2#c")).toBe("/p/1?x=2#c");
});

test.each([
  "//evil.com",
  "/\\evil.com",
  "\\/evil.com",
  "/\t/evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "",
  null,
  undefined,
])("rejects %p", (n) => {
  expect(safeNext(n)).toBe("/feed");
  expect(safeNext(n, "/pending")).toBe("/pending");
});
