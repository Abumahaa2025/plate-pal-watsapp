import * as XLSX from "xlsx";

export type Plate = { value: string; row: number; extra?: Record<string, unknown> };

/** Try to detect the "plate" column and extract plate strings from a workbook buffer. */
export function parsePlateFile(buffer: ArrayBuffer, filename: string): Plate[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) return [];

  // Detect the plate column by header name (Arabic + English) or fall back to first column
  const headers = Object.keys(rows[0]);
  const plateKey =
    headers.find((h) =>
      /(لوحة|رقم\s*اللوحة|plate|number|no\.?)/i.test(h.trim()),
    ) ?? headers[0];

  const plates: Plate[] = [];
  rows.forEach((r, i) => {
    const raw = r[plateKey];
    if (raw === undefined || raw === null) return;
    const value = String(raw).trim();
    if (!value) return;
    const extra: Record<string, unknown> = {};
    for (const h of headers) if (h !== plateKey) extra[h] = r[h];
    plates.push({ value, row: i + 2, extra });
  });

  return plates;
}

/** Natural sort: splits digits from letters so "أ 12" < "أ 100" and "ABC 9" < "ABC 10". */
export function naturalCompare(a: string, b: string): number {
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];
  a.replace(/(\d+)|(\D+)/g, (_m, n, s) => {
    ax.push(n !== undefined ? Number(n) : s);
    return "";
  });
  b.replace(/(\d+)|(\D+)/g, (_m, n, s) => {
    bx.push(n !== undefined ? Number(n) : s);
    return "";
  });
  while (ax.length && bx.length) {
    const x = ax.shift()!;
    const y = bx.shift()!;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y), "ar");
  }
  return ax.length - bx.length;
}

export function exportPlates(plates: Plate[], filename: string, format: "xlsx" | "csv") {
  const data = plates.map((p, i) => ({ "#": i + 1, "رقم اللوحة": p.value, ...(p.extra || {}) }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plates");
  const base = filename.replace(/\.(xlsx|xls|csv)$/i, "") || "plates";
  XLSX.writeFile(wb, `${base}.${format}`, { bookType: format });
}
