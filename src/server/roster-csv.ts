// Minimal CSV parser for roster imports: no external library needed since
// the only CSV feature required is quoted fields that may contain commas
// (RFC 4180 double-quote escaping, `""` -> `"`). Fields never span lines.
import { normalizeStudentId } from "./student-id";

export type RosterCsvRow = {
  studentId: string;
  department: string;
  name?: string;
};
export type RosterCsvError = { line: number; message: string };

const REQUIRED_HEADER = ["student_id", "department"];
const MAX_ERRORS = 50;
const MAX_ROWS = 20_000;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (true) {
    let field = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
    } else {
      while (i < line.length && line[i] !== ",") {
        field += line[i];
        i++;
      }
    }
    fields.push(field);
    if (line[i] === ",") {
      i++;
      continue;
    }
    break;
  }
  return fields;
}

export function parseRosterCsv(text: string): {
  rows: RosterCsvRow[];
  errors: RosterCsvError[];
} {
  const errors: RosterCsvError[] = [];
  const rows: RosterCsvRow[] = [];
  const seenIds = new Map<string, number>(); // normalized student id -> first line number
  const pushError = (line: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, message });
  };

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "").map((f) =>
    f.trim().toLowerCase(),
  );
  const hasName = header.length === 3 && header[2] === "name";
  const headerOk =
    (header.length === 2 || hasName) &&
    REQUIRED_HEADER.every((h, i) => header[i] === h);
  if (!headerOk) {
    pushError(
      1,
      'Header must be "student_id,department" or "student_id,department,name"',
    );
    return { rows, errors };
  }

  for (let idx = 1; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const raw = lines[idx];
    if (raw === undefined || raw.trim() === "") continue;

    if (rows.length >= MAX_ROWS) {
      pushError(lineNo, "Too many rows");
      break;
    }

    const fields = parseCsvLine(raw);
    // Spreadsheet exports often pad rows with empty trailing cells.
    while (fields.length > header.length && fields.at(-1)?.trim() === "")
      fields.pop();
    if (fields.length > header.length || fields.length < 2) {
      pushError(
        lineNo,
        `Expected ${header.length} fields, got ${fields.length}`,
      );
      continue;
    }

    const studentId = fields[0].trim();
    const department = fields[1].trim();
    const name = fields[2]?.trim();

    if (!studentId) {
      pushError(lineNo, "student_id is required");
      continue;
    }
    if (!department) {
      pushError(lineNo, "department is required");
      continue;
    }

    const normalized = normalizeStudentId(studentId);
    const firstLine = seenIds.get(normalized);
    if (firstLine !== undefined) {
      pushError(lineNo, `Duplicate student ID (also on line ${firstLine})`);
      continue;
    }
    seenIds.set(normalized, lineNo);

    rows.push(
      name ? { studentId, department, name } : { studentId, department },
    );
  }

  return { rows, errors };
}
