import { expect, test } from "bun:test";
import { retryQuery } from "@/lib/query-retry";

const http = (httpStatus: number) => ({ data: { httpStatus } });

test("never retries client errors (4xx)", () => {
  for (const s of [400, 401, 403, 404, 429])
    expect(retryQuery(0, http(s))).toBe(false);
});

test("retries server/network errors up to 3 times", () => {
  expect(retryQuery(0, http(500))).toBe(true);
  expect(retryQuery(2, new Error("network"))).toBe(true);
  expect(retryQuery(3, new Error("network"))).toBe(false);
});
