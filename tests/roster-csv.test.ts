import { expect, test } from "bun:test";
import { parseRosterCsv } from "@/server/roster-csv";

test("parses valid rows, quoted fields, flags", () => {
  const r = parseRosterCsv(
    `Student_ID,Batch_Year,Department,Graduated\nNU-1,2022,CSE,true\n\n"NU-2",2028,"Electrical, Electronic",no\n`,
  );
  expect(r.errors).toEqual([]);
  expect(r.rows).toEqual([
    { studentId: "NU-1", batchYear: 2022, department: "CSE", graduated: true },
    {
      studentId: "NU-2",
      batchYear: 2028,
      department: "Electrical, Electronic",
      graduated: false,
    },
  ]);
});

test("reports bad header and bad rows with line numbers", () => {
  expect(parseRosterCsv("id,year\nx,1").errors[0]).toMatchObject({ line: 1 });
  const r = parseRosterCsv(
    "student_id,batch_year,department,graduated\nNU-1,abc,CSE,true\n,2020,CSE,true\nNU-3,2020,CSE,maybe",
  );
  expect(r.rows).toEqual([]);
  expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
});

test("rejects batch_year out of the 1950..2100 range", () => {
  const r = parseRosterCsv(
    "student_id,batch_year,department,graduated\nNU-1,1800,CSE,true\nNU-2,2200,CSE,true\nNU-3,99999999999999999999,CSE,true",
  );
  expect(r.rows).toEqual([]);
  expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
});

test("dedupes duplicate student IDs (case/whitespace-insensitive), reporting the later line", () => {
  const r = parseRosterCsv(
    "student_id,batch_year,department,graduated\nNU-1,2022,CSE,true\nnu-1,2023,EEE,false\nNU-2,2024,CSE,true",
  );
  expect(r.rows).toEqual([
    { studentId: "NU-1", batchYear: 2022, department: "CSE", graduated: true },
    { studentId: "NU-2", batchYear: 2024, department: "CSE", graduated: true },
  ]);
  expect(r.errors).toEqual([
    { line: 3, message: "Duplicate student ID (also on line 2)" },
  ]);
});

test("handles a UTF-8 BOM, CRLF line endings, doubled-quote escapes, and a trailing comma", () => {
  const csv =
    '﻿student_id,batch_year,department,graduated\r\nNU-1,2022,"O""Brien",true\r\nNU-2,2023,CSE,true,\r\n';
  const r = parseRosterCsv(csv);
  expect(r.rows).toEqual([
    {
      studentId: "NU-1",
      batchYear: 2022,
      department: 'O"Brien',
      graduated: true,
    },
  ]);
  expect(r.errors).toEqual([{ line: 3, message: "Expected 4 fields, got 5" }]);
});
