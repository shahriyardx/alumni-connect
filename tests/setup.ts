// tests/setup.ts — migrate the test DB once per run, the same way production
// does (role bootstrap + migrations + grants).
await import("../src/db/migrate");
