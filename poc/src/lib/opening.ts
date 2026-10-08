/** Data migration (D-52): opening documents — the old system's unpaid invoices and bills. The database checks every row
 *  again (all-or-nothing) and posts them; this file reads the Excel template and calls it. */
import { supabase } from "./supabase";
import { parseAedToFils } from "./money";
import { parseStatementDate } from "./bankImport";

export interface OpeningRow { row: number; kind: "customer" | "supplier"; contact_name: string; number: string; date: string; due_date: string | null; amount: number }
export interface OpeningDoc { id: string; kind: "customer" | "supplier"; contact: string; number: string; date: string; due_date: string; amount: number; status: string }
export interface OpeningStatus { clearing_balance: number; opening_journals: number; documents: OpeningDoc[] }

export const OPENING_COLUMNS = ["Type", "Name", "Number", "Date", "Due date", "Amount"] as const;

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

export async function openingStatus(orgId: string): Promise<OpeningStatus> {
  const r = await db().rpc("opening_status", { p_organization_id: orgId });
  if (r.error) throw r.error;
  return r.data as unknown as OpeningStatus;
}
export async function saveOpeningDocuments(orgId: string, rows: OpeningRow[]): Promise<number> {
  const r = await db().rpc("save_opening_documents", { p_organization_id: orgId, p_rows: rows as never });
  if (r.error) throw r.error;
  return r.data as number;
}
export async function postOpeningDocuments(orgId: string, date: string): Promise<number> {
  const r = await db().rpc("post_opening_documents", { p_organization_id: orgId, p_date: date });
  if (r.error) throw r.error;
  return r.data as number;
}
export async function deleteOpeningDocument(id: string) {
  const r = await db().rpc("delete_opening_document", { p_id: id });
  if (r.error) throw r.error;
}

/** Rows of the template's first sheet → opening rows (dates day-first or from Excel; amounts in AED). Unit-tested. */
export function parseOpeningSheet(sheet: string[][]): { rows: OpeningRow[]; errors: string[] } {
  const h = sheet.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "type") && r.some((c) => c.trim().toLowerCase() === "amount"));
  if (h < 0) return { rows: [], errors: ["This is not the opening balances template — the Type and Amount columns were not found."] };
  const idx = (t: string) => sheet[h].findIndex((c) => c.trim().toLowerCase() === t.toLowerCase());
  const col = { type: idx("Type"), name: idx("Name"), number: idx("Number"), date: idx("Date"), due: idx("Due date"), amount: idx("Amount") };
  const rows: OpeningRow[] = [], errors: string[] = [];
  sheet.slice(h + 1).forEach((r, k) => {
    const line = h + k + 2;
    const cell = (i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    if (r.every((c) => !String(c ?? "").trim())) return;
    const kind = cell(col.type).toLowerCase();
    const date = parseStatementDate(cell(col.date), "dd/mm/yyyy");
    const due = cell(col.due) ? parseStatementDate(cell(col.due), "dd/mm/yyyy") : null;
    const amount = parseAedToFils(cell(col.amount));
    if (kind !== "customer" && kind !== "supplier") { errors.push(`Row ${line}: Type must be Customer or Supplier.`); return; }
    if (!date) { errors.push(`Row ${line}: "${cell(col.date)}" is not a date (day/month/year).`); return; }
    if (cell(col.due) && !due) { errors.push(`Row ${line}: "${cell(col.due)}" is not a date (day/month/year).`); return; }
    if (amount === null || amount <= 0) { errors.push(`Row ${line}: the amount must be above zero.`); return; }
    rows.push({ row: line, kind, contact_name: cell(col.name), number: cell(col.number), date, due_date: due, amount });
  });
  return { rows, errors: rows.length === 0 && errors.length === 0 ? ["The sheet has no rows."] : errors };
}

export async function downloadOpeningTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...OPENING_COLUMNS]]), "Opening documents");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Unpaid invoices and bills at the cut-off date (from the previous system)"], [],
    ["Type", "Customer or Supplier"], ["Name", "Exactly as in Customers & suppliers (import the contacts first)"],
    ["Number", "The old invoice / bill number"], ["Date", "Document date, day/month/year"], ["Due date", "day/month/year (blank = the document date)"],
    ["Amount", "The amount STILL OPEN in AED, incl. VAT (not the original total if partly paid)"], [],
    ["Example (do not copy as is)"], [...OPENING_COLUMNS], ["Customer", "Customer A", "INV-1043", "15/05/2026", "14/06/2026", "10500.00"],
    [], ["When all are entered, account 3999 Opening balance clearing must be exactly zero."],
  ]), "Instructions");
  XLSX.writeFile(wb, "Opening balances template.xlsx");
}
