/** Browser side of roster uploads: .xlsx/.csv → the CSV text `admin.importRoster` validates. */
type Cell = unknown;

const cellText = (v: Cell) =>
  v instanceof Date
    ? v.toISOString().slice(0, 10)
    : String(v ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim();

/** RFC 4180 quoting; the server parser never spans lines, so newlines become spaces. */
export function rowsToCsv(rows: Cell[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const t = cellText(v);
          return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(","),
    )
    .join("\n");
}

export async function rosterFileToCsv(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  const { readSheet } = await import("read-excel-file/browser");
  return rowsToCsv(await readSheet(file));
}
