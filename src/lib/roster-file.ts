/** Browser side of roster uploads: .xlsx/.csv → the CSV text `admin.importRoster` validates. */
type Cell = unknown;

const cellText = (v: Cell) =>
  v instanceof Date
    ? v.toISOString().slice(0, 10)
    : String(v ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim();

const quote = (v: Cell) => {
  const t = cellText(v);
  return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * RFC 4180 quoting; the server parser never spans lines, so newlines become
 * spaces. Empty rows stay as "" (line numbers in errors match the sheet) and
 * trailing empty cells beyond the header's width are dropped.
 */
export function rowsToCsv(rows: Cell[][]): string {
  const texts = rows.map((r) => r.map(cellText));
  const trimmed = (r: string[], min = 0) => {
    let n = r.length;
    while (n > min && r[n - 1] === "") n--;
    return r.slice(0, n);
  };
  const width = trimmed(texts[0] ?? []).length;
  return texts
    .map((r) =>
      r.every((t) => t === "") ? "" : trimmed(r, width).map(quote).join(","),
    )
    .join("\n");
}

export async function rosterFileToCsv(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  const { readSheet } = await import("read-excel-file/browser");
  // Keep number cells as their raw digits: long IDs lose precision as JS numbers.
  return rowsToCsv(await readSheet(file, { parseNumber: (s) => s }));
}
