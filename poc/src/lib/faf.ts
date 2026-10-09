/** FTA VAT Audit File (FAF v1.0.0) — layout from the FTA "Requirements Document for Tax Accounting Software",
 *  Appendix 5. The database gathers the data (app.faf_data, D-57); this file writes it exactly as laid out there:
 *  one marker row to start each table, the data rows, one footer row (end marker + totals); fields separated by ",";
 *  dates DD-MM-YYYY; amounts with 2 decimals; text without "," or line breaks; strings cut to the FTA lengths. */
import { supabase } from "./supabase";

export const FAF_VERSION = "FAFv1.0.0";
export const PRODUCT_VERSION = "1.0";

type Line = { trn: string; date: string; invoice_no: string; line_no: number; description: string; value: number; vat: number; tax_code: string; currency: string; value_fcy: number; vat_fcy: number };
export interface FafData {
  company: { name_en: string; name_ar: string; trn: string; product: string };
  purchases: (Line & { supplier: string })[];
  supplies: (Line & { customer: string; country: string })[];
  ledger: { date: string; account_code: string; account_name: string; description: string; name: string; transaction_id: string; source_document: string; source_type: string; debit: number; credit: number; balance: number }[];
}

export async function fafData(orgId: string, start: string, end: string): Promise<FafData> {
  if (!supabase) throw new Error("Not connected");
  const r = await supabase.rpc("faf_data", { p_organization_id: orgId, p_start: start, p_end: end });
  if (r.error) throw r.error;
  return r.data as unknown as FafData;
}

/** ISO yyyy-mm-dd → dd-mm-yyyy; blank → the FTA "no date" default. */
export const fafDate = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "31-12-9999"); // check-finance-ignore: the FTA's "no date" default (Appendix 5), not a business date
/** Integer fils/cents → "1234.56" / "-12.00", exact (no floating point). */
export function fafAmount(minor: number): string {
  const sign = minor < 0 ? "-" : "", a = Math.abs(minor);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}
/** Text: "," is the separator, so it becomes ";"; line breaks removed; cut to the FTA maximum length. */
export const fafText = (s: string | null | undefined, max: number) => (s ?? "").replace(/,/g, ";").replace(/[\r\n]+/g, " ").trim().slice(0, max);

const fcy = (l: Line): [string, string, string] => (l.currency === "AED" ? ["XXX", "0.00", "0.00"] : [l.currency, fafAmount(l.value_fcy), fafAmount(l.vat_fcy)]);
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

export function buildFaf(d: FafData, o: { start: string; end: string; created: string }): string {
  const rows: string[][] = [];
  rows.push(["CompInfoStart"]);
  rows.push([fafText(d.company.name_en, 100), fafText(d.company.name_ar, 100), fafText(d.company.trn, 15), "", "", "", "",
    fafDate(o.start), fafDate(o.end), fafDate(o.created), fafText(`${d.company.product} ${PRODUCT_VERSION}`, 100), FAF_VERSION]);
  rows.push(["CompInfoEnd"]);

  rows.push(["PurcDataStart"]);
  for (const l of d.purchases) rows.push([fafText(l.supplier, 100), fafText(l.trn, 15), fafDate(l.date), fafText(l.invoice_no, 50), "", String(l.line_no),
    fafText(l.description, 250), fafAmount(l.value), fafAmount(l.vat), fafText(l.tax_code, 2), ...fcy(l)]);
  rows.push(["PurcDataEnd", fafAmount(sum(d.purchases.map((l) => l.value))), fafAmount(sum(d.purchases.map((l) => l.vat))), String(d.purchases.length)]);

  rows.push(["SuppDataStart"]);
  for (const l of d.supplies) rows.push([fafText(l.customer, 100), fafText(l.trn, 15), fafDate(l.date), fafText(l.invoice_no, 50), String(l.line_no),
    fafText(l.description, 250), fafAmount(l.value), fafAmount(l.vat), fafText(l.tax_code, 20), fafText(l.country, 50), ...fcy(l)]);
  rows.push(["SuppDataEnd", fafAmount(sum(d.supplies.map((l) => l.value))), fafAmount(sum(d.supplies.map((l) => l.vat))), String(d.supplies.length)]);

  rows.push(["GLDataStart"]);
  for (const g of d.ledger) rows.push([fafDate(g.date), fafText(g.account_code, 20), fafText(g.account_name, 100), fafText(g.description, 250), fafText(g.name, 100),
    fafText(g.transaction_id, 50), fafText(g.source_document, 50), fafText(g.source_type, 20), fafAmount(g.debit), fafAmount(g.credit), fafAmount(g.balance)]);
  rows.push(["GLDataEnd", fafAmount(sum(d.ledger.map((g) => g.debit))), fafAmount(sum(d.ledger.map((g) => g.credit))), String(d.ledger.length), "AED"]);

  return rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}

export function downloadFaf(csv: string, trn: string, start: string, end: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `FAF_${trn || "noTRN"}_${start}_${end}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
