// tests/setup.ts — migrate the test DB once per run, the same way production does.
await import("../src/db/migrate");
export {};
