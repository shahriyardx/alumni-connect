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
