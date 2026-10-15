import { expect, test } from "bun:test";
import { safeNext } from "@/lib/safe-next";

test("keeps same-origin paths", () => {
  expect(safeNext("/feed")).toBe("/feed");
  expect(safeNext("/p/1?x=2#c")).toBe("/p/1?x=2#c");
  expect(safeNext("/a/../b")).toBe("/b");
});

test.each([
  "//evil.com",
  "/\\evil.com",
  "\\/evil.com",
  "/\t/evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "/..//evil.com",
  "/.//evil.com",
  "/a/../..//evil.com",
  "/%2e%2e//evil.com",
  "",
  null,
  undefined,
])("rejects %p", (n) => {
  expect(safeNext(n)).toBe("/feed");
  expect(safeNext(n, "/pending")).toBe("/pending");
});
