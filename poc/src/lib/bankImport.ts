/** Reading a bank's own CSV/Excel statement with a remembered column mapping (P2-05 · D-38). Pure and
 *  unit-tested except readStatementFile(), which loads the spreadsheet reader only when a file is chosen. */
import { fmtPlain, parseAedToFils } from "./money";

export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "dd-mmm-yyyy";
export interface ColumnMapping {
  header_row: number;                 // 0-based row holding the column titles
  date: string; description: string; reference?: string;
  amount?: string; in?: string; out?: string; balance?: string;   // either a signed amount column, or money in + money out
  date_format: DateFormat;
}
export interface StatementRow { date: string; description: string; reference: string | null; amount: number; balance: number | null }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar date as YYYY-MM-DD, or null when the text is not a real date in that format. */
export function parseStatementDate(text: string, format: DateFormat): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return validDate(+t.slice(0, 4), +t.slice(5, 7), +t.slice(8, 10));   // already ISO (Excel dates)
  let y: number, m: number, d: number;
  if (format === "dd-mmm-yyyy") {
    const r = t.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3})[A-Za-z]*[\s\-/.,]+(\d{2,4})$/);
    if (!r) return null;
    d = +r[1]; m = MONTHS.indexOf(r[2].toLowerCase()) + 1; y = +r[3];
  } else if (format === "yyyy-mm-dd") {
    const r = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
    if (!r) return null;
    y = +r[1]; m = +r[2]; d = +r[3];
  } else {
    const r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!r) return null;
    [d, m] = format === "dd/mm/yyyy" ? [+r[1], +r[2]] : [+r[2], +r[1]];
    y = +r[3];
  }
  if (y < 100) y += 2000;
  return validDate(y, m, d);
}
function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Signed fils from bank text: "1,234.50", "-1,234.50", "(1,234.50)", "1,234.50 DR", "AED 1,234.50 CR". Blank → 0. */
export function parseStatementAmount(text: string): number | null {
  let t = text.trim().replace(/\b(AED|USD)\b/gi, "").replace(/\s+/g, "");
  if (t === "" || t === "-") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }
  if (/DR$/i.test(t)) { negative = true; t = t.slice(0, -2); } else if (/CR$/i.test(t)) t = t.slice(0, -2);
  if (t.endsWith("-")) { negative = !negative; t = t.slice(0, -1); }
  if (t.startsWith("-")) { negative = !negative; t = t.slice(1); }
  if (t.startsWith("+")) t = t.slice(1);
  const f = parseAedToFils(t);
  if (f === null) return null;
  return negative && f !== 0 ? -f : f;
}

/** The first row that looks like column titles (has a date-ish and an amount-ish title). */
export function findHeaderRow(rows: string[][]): number {
  const i = rows.slice(0, 30).findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit/i.test(c)));
  return i < 0 ? 0 : i;
}

/** Best guess of the mapping from the column titles; the user confirms it the first time. */
export function guessMapping(rows: string[][]): ColumnMapping {
  const header_row = findHeaderRow(rows);
  const h = rows[header_row] ?? [];
  const find = (...res: RegExp[]) => { for (const re of res) { const c = h.find((x) => re.test(x.trim())); if (c) return c; } return undefined; };
  const inCol = find(/^credit/i, /deposit/i, /money in/i, /^cr\b/i);
  const outCol = find(/^debit/i, /withdraw/i, /money out/i, /^dr\b/i);
  return {
    header_row,
    date: find(/value date/i, /transaction date/i, /txn date/i, /posting date/i, /date/i) ?? "",
    description: find(/narration/i, /description/i, /details/i, /particulars/i, /remarks/i) ?? "",
    reference: find(/ref/i, /cheque/i, /chq/i),
    ...(inCol && outCol ? { in: inCol, out: outCol } : { amount: find(/^amount/i, /amount/i) }),
    balance: find(/balance/i),
    date_format: "dd/mm/yyyy",
  };
}

/** Applies the mapping. Rows without a date and amount (titles, opening/closing balance lines) are skipped. */
export function mapStatement(rows: string[][], m: ColumnMapping): { rows: StatementRow[]; errors: string[]; skipped: number } {
  const header = rows[m.header_row] ?? [];
  const col = (name?: string) => (name ? header.indexOf(name) : -1);
  const ci = { date: col(m.date), desc: col(m.description), ref: col(m.reference), amount: col(m.amount), in: col(m.in), out: col(m.out), bal: col(m.balance) };
  const errors: string[] = [];
  if (ci.date < 0) errors.push("Choose the date column.");
  if (ci.desc < 0) errors.push("Choose the description column.");
  if (ci.amount < 0 && (ci.in < 0 || ci.out < 0)) errors.push("Choose either one amount column, or both the money-in and money-out columns.");
  if (errors.length) return { rows: [], errors, skipped: 0 };
  const out: StatementRow[] = [];
  let skipped = 0;
  rows.slice(m.header_row + 1).forEach((r, k) => {
    const line = m.header_row + k + 2;                                  // the row number the user sees in Excel
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").toString() : "");
    if (r.every((c) => !String(c ?? "").trim())) return;
    const date = parseStatementDate(cell(ci.date), m.date_format);
    let amount: number | null;
    if (ci.amount >= 0) amount = parseStatementAmount(cell(ci.amount));
    else {
      const a = parseStatementAmount(cell(ci.in)), b = parseStatementAmount(cell(ci.out));
      amount = a === null || b === null ? null : Math.abs(a) - Math.abs(b);
    }
    if (!date && (amount === 0 || amount === null)) { skipped++; return; }               // title / balance line
    if (!date) { errors.push(`Row ${line}: "${cell(ci.date)}" is not a date in ${m.date_format} format.`); return; }
    if (amount === null) { errors.push(`Row ${line}: the amount is not a number.`); return; }
    if (amount === 0) { skipped++; return; }
    const balance = ci.bal >= 0 && cell(ci.bal).trim() ? parseStatementAmount(cell(ci.bal)) : null;
    out.push({ date, description: cell(ci.desc).trim() || "(no description)", reference: cell(ci.ref).trim() || null, amount, balance });
  });
  return { rows: out, errors: errors.slice(0, 20), skipped };
}

/** Reads a CSV/XLS/XLSX file into rows of text (dates from Excel cells as YYYY-MM-DD). */
export async function readStatementFile(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: isCsv });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
  return data.map((r) => r.map((c) => c instanceof Date ? `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
    : typeof c === "number" ? numberText(c) : String(c ?? "")));
}
/** Excel numbers to plain text with at most 2 decimals, without float noise (e.g. 1234.5 → "1234.50"). */
export const numberText = (n: number) => (Number.isInteger(n) ? String(n) : fmtPlain(Math.round(n * 100)));
