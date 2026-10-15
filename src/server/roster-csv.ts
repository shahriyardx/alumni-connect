// Minimal CSV parser for roster imports: no external library needed since
// the only CSV feature required is quoted fields that may contain commas
// (RFC 4180 double-quote escaping, `""` -> `"`). Fields never span lines.
export type RosterCsvRow = {
  studentId: string;
  batchYear: number;
  department: string;
  graduated: boolean;
};
export type RosterCsvError = { line: number; message: string };

const EXPECTED_HEADER = ["student_id", "batch_year", "department", "graduated"];
const GRADUATED_TRUE = new Set(["true", "yes", "1"]);
const GRADUATED_FALSE = new Set(["false", "no", "0"]);
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
  const pushError = (line: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, message });
  };

  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "").map((f) =>
    f.trim().toLowerCase(),
  );
  const headerOk =
    header.length === EXPECTED_HEADER.length &&
    EXPECTED_HEADER.every((h, i) => header[i] === h);
  if (!headerOk) {
    pushError(1, `Header must be exactly "${EXPECTED_HEADER.join(",")}"`);
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
    if (fields.length !== EXPECTED_HEADER.length) {
      pushError(
        lineNo,
        `Expected ${EXPECTED_HEADER.length} fields, got ${fields.length}`,
      );
      continue;
    }

    const [studentIdRaw, batchYearRaw, departmentRaw, graduatedRaw] = fields;
    const studentId = studentIdRaw.trim();
    const department = departmentRaw.trim();
    const yearText = batchYearRaw.trim();
    const graduatedKey = graduatedRaw.trim().toLowerCase();

    if (!studentId) {
      pushError(lineNo, "student_id is required");
      continue;
    }
    if (!/^\d+$/.test(yearText)) {
      pushError(lineNo, "batch_year must be a whole number");
      continue;
    }
    if (!department) {
      pushError(lineNo, "department is required");
      continue;
    }
    let graduated: boolean;
    if (GRADUATED_TRUE.has(graduatedKey)) graduated = true;
    else if (GRADUATED_FALSE.has(graduatedKey)) graduated = false;
    else {
      pushError(lineNo, "graduated must be true/false/yes/no/1/0");
      continue;
    }

    rows.push({
      studentId,
      batchYear: Number(yearText),
      department,
      graduated,
    });
  }

  return { rows, errors };
}
