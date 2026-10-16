import { expect, test } from "bun:test";
import { rowsToCsv } from "@/lib/roster-file";
import { parseRosterCsv } from "@/server/roster-csv";

test("parses valid rows, quoted fields, case-insensitive header, optional name", () => {
  const r = parseRosterCsv(
    `Student_ID,Department,Name\nNU-1,CSE,Rahim\n\n"NU-2","Electrical, Electronic",\n`,
  );
  expect(r.errors).toEqual([]);
  expect(r.rows).toEqual([
    { studentId: "NU-1", department: "CSE", name: "Rahim" },
    { studentId: "NU-2", department: "Electrical, Electronic" },
  ]);
});

test("name column is optional", () => {
  const r = parseRosterCsv("student_id,department\nNU-1,CSE");
  expect(r.errors).toEqual([]);
  expect(r.rows).toEqual([{ studentId: "NU-1", department: "CSE" }]);
});

test("reports bad header and bad rows with line numbers", () => {
  expect(parseRosterCsv("id,year\nx,1").errors[0]).toMatchObject({ line: 1 });
  expect(
    parseRosterCsv("student_id,batch_year,department,graduated\nx,1,a,b")
      .errors[0],
  ).toMatchObject({ line: 1 });
  const r = parseRosterCsv("student_id,department\n,CSE\nNU-3,\nNU-4");
  expect(r.rows).toEqual([]);
  expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
});

test("dedupes duplicate student IDs (case/whitespace-insensitive), reporting the later line", () => {
  const r = parseRosterCsv(
    "student_id,department\nNU-1,CSE\nnu-1,EEE\nNU-2,CSE",
  );
  expect(r.rows).toEqual([
    { studentId: "NU-1", department: "CSE" },
    { studentId: "NU-2", department: "CSE" },
  ]);
  expect(r.errors).toEqual([
    { line: 3, message: "Duplicate student ID (also on line 2)" },
  ]);
});

test("handles a UTF-8 BOM, CRLF line endings, doubled-quote escapes, and a trailing comma", () => {
  const csv =
    '﻿student_id,department\r\nNU-1,"O""Brien"\r\nNU-2,CSE,\r\nNU-3,CSE,x,y\r\n';
  const r = parseRosterCsv(csv);
  expect(r.rows).toEqual([
    { studentId: "NU-1", department: 'O"Brien' },
    { studentId: "NU-2", department: "CSE" },
  ]);
  expect(r.errors).toEqual([{ line: 4, message: "Expected 2 fields, got 4" }]);
});

test("rowsToCsv: spreadsheet rows survive the round trip", () => {
  const csv = rowsToCsv([
    ["student_id", "department", "name"],
    [20300001, "CSE", 'Rahim "R", Uddin'],
    ["NU-2", "EEE\nevening", null],
  ]);
  expect(parseRosterCsv(csv)).toEqual({
    rows: [
      { studentId: "20300001", department: "CSE", name: 'Rahim "R", Uddin' },
      { studentId: "NU-2", department: "EEE evening" },
    ],
    errors: [],
  });
});

test("rowsToCsv: long numeric IDs stay exact; empty rows and trailing cells", () => {
  const csv = rowsToCsv([
    ["student_id", "department", null],
    ["0012345678901234567", "CSE", null, ""],
    [null, "", null],
    ["1234567890123456789", "EEE", ""],
  ]);
  expect(csv).toBe(
    "student_id,department\n0012345678901234567,CSE\n\n1234567890123456789,EEE",
  );
  expect(parseRosterCsv(csv).rows.map((r) => r.studentId)).toEqual([
    "0012345678901234567",
    "1234567890123456789",
  ]);
});
