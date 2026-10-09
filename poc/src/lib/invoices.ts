/** Sales invoices and credit notes (P2-02). The database calculates and posts; the preview below uses
 *  the same rules (F-01, F-24) with exact integer maths so the screen matches the database to the fils. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type SalesInvoice = Database["public"]["Tables"]["sales_invoices"]["Row"];
export type SalesLine = Database["public"]["Tables"]["sales_invoice_lines"]["Row"];
export type InvoiceWithLines = SalesInvoice & { lines: SalesLine[]; customer: string; preparer: string | null; approver: string | null };
export const SALES_TAX_CODES: [string, string][] = [["SR", "Standard 5%"], ["ZR", "Zero rated"], ["EX", "Exempt"], ["OS", "Out of scope"]];

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

// ── Exact calculation (unit-tested; mirrors app.sales_line_amounts) ─────────────────────
/** a × b ÷ d rounded half-up, for non-negative integers, without floating point. */
const mulDivHalfUp = (a: bigint, b: bigint, d: bigint): bigint => (2n * a * b + d) / (2n * d);

/** "1.5" → 15000n (quantity × 10,000). Returns null for anything that is not a positive number with ≤ 4 decimals. */
export function parseQuantity(text: string): bigint | null {
  const m = text.trim().replace(/,/g, "").match(/^(\d+)(?:\.(\d{0,4}))?$/);
  if (!m) return null;
  const q = BigInt(m[1]) * 10000n + BigInt((m[2] ?? "").padEnd(4, "0") || "0");
  return q > 0n ? q : null;
}

/** "3.6725" → 3672500n (rate × 1,000,000). */
const rateMicros = (rate: string): bigint => {
  const [i, f = ""] = rate.split(".");
  return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0").slice(0, 6) || "0");
};

/**
 * One line: net in document currency = quantity × unit price (half-up); AED net = that × rate (half-up,
 * F-24); VAT = AED net × rate ÷ 10,000 (half-up, F-01). VAT in the document currency likewise.
 * Prices include VAT (D-54, F-02; mirrors app.sales_line_amounts_gross): gross = quantity × unit price,
 * AED gross = that × rate; VAT = gross × rate ÷ (10,000 + rate), net = gross − VAT.
 */
export function lineAmounts(quantity: bigint, unitPrice: number, rateBp: number, fxRate: string, pricesIncludeVat = false) {
  if (pricesIncludeVat) {
    const grossFcy = mulDivHalfUp(quantity, BigInt(unitPrice), 10000n);
    const gross = fxRate === "1" ? grossFcy : mulDivHalfUp(grossFcy, rateMicros(fxRate), 1_000_000n);
    const vatFcy = mulDivHalfUp(grossFcy, BigInt(rateBp), 10000n + BigInt(rateBp));
    const vat = mulDivHalfUp(gross, BigInt(rateBp), 10000n + BigInt(rateBp));
    return { netFcy: Number(grossFcy - vatFcy), vatFcy: Number(vatFcy), net: Number(gross - vat), vat: Number(vat) };
  }
  const netFcy = mulDivHalfUp(quantity, BigInt(unitPrice), 10000n);
  const vatFcy = mulDivHalfUp(netFcy, BigInt(rateBp), 10000n);
  const net = fxRate === "1" ? netFcy : mulDivHalfUp(netFcy, rateMicros(fxRate), 1_000_000n);
  const vat = mulDivHalfUp(net, BigInt(rateBp), 10000n);
  return { netFcy: Number(netFcy), vatFcy: Number(vatFcy), net: Number(net), vat: Number(vat) };
}

export type LineCalc = { netFcy: number; vatFcy: number; net: number; vat: number };

/** D-62 · VAT on the total of amounts, rounded half-up once, spread by largest remainder (each share rounded down; the
 *  remaining fils to the largest fractions, then the larger amount, then the earlier line). Mirrors app.allocate_vat. */
export function allocateVat(amounts: number[], rateBp: number, inclusive: boolean): number[] {
  const den = BigInt(inclusive ? 10000 + rateBp : 10000), r = BigInt(rateBp);
  const num = amounts.map((a) => BigInt(a) * r);
  const total = (2n * num.reduce((s, x) => s + x, 0n) + den) / (2n * den);
  const out = num.map((x) => x / den);
  let k = Number(total - out.reduce((s, x) => s + x, 0n));
  const order = amounts.map((a, i) => ({ i, rem: num[i] % den, a })).sort((x, y) => (y.rem > x.rem ? 1 : y.rem < x.rem ? -1 : y.a - x.a || x.i - y.i));
  for (const o of order) { if (k <= 0) break; out[o.i] += 1n; k--; }
  return out.map(Number);
}

/** D-62 · the document's lines after VAT is rounded once per tax code (only codes with a rate). Mirrors app.recalc_sales_invoice. */
export function documentVat(calc: (LineCalc | null)[], taxCodes: string[], rateBp: (code: string) => number, inclusive: boolean): (LineCalc | null)[] {
  const out = calc.map((c) => (c ? { ...c } : null));
  for (const code of new Set(taxCodes)) {
    const rate = rateBp(code);
    const idx = out.flatMap((c, i) => (c && taxCodes[i] === code ? [i] : []));
    if (rate === 0 || idx.length === 0) continue;
    const aed = idx.map((i) => (inclusive ? out[i]!.net + out[i]!.vat : out[i]!.net));
    const fcy = idx.map((i) => (inclusive ? out[i]!.netFcy + out[i]!.vatFcy : out[i]!.netFcy));
    const vat = allocateVat(aed, rate, inclusive), vatF = allocateVat(fcy, rate, inclusive);
    idx.forEach((i, k) => { out[i] = { net: inclusive ? aed[k] - vat[k] : aed[k], vat: vat[k], netFcy: inclusive ? fcy[k] - vatF[k] : fcy[k], vatFcy: vatF[k] }; });
  }
  return out;
}

export function documentTotals(lines: { netFcy: number; vatFcy: number; net: number; vat: number }[]) {
  const s = (k: "netFcy" | "vatFcy" | "net" | "vat") => lines.reduce((t, l) => t + l[k], 0);
  return { net: s("net"), vat: s("vat"), gross: s("net") + s("vat"), netFcy: s("netFcy"), vatFcy: s("vatFcy"), grossFcy: s("netFcy") + s("vatFcy") };
}

/** D-29 / Art 67 reminders shown before submitting (the invoice date is the tax date). */
export function taxDateWarnings(issueDate: string, supplyDate: string | null, vatPeriods: { start_date: string; end_date: string }[], issueDays: number): string[] {
  const w: string[] = [];
  if (!supplyDate) return w;
  const days = (Date.parse(issueDate) - Date.parse(supplyDate)) / 86_400_000;
  if (days > issueDays) w.push(`The invoice is dated ${days} days after the supply — tax invoices must be issued within ${issueDays} days (Art 67).`);
  const period = (d: string) => vatPeriods.find((p) => p.start_date <= d && d <= p.end_date);
  const sp = period(supplyDate), ip = period(issueDate);
  if (sp && ip && sp.start_date < ip.start_date) w.push("The supply date is in an earlier VAT period than the invoice date. VAT will be reported in the invoice date's period (D-29) — check this is intended.");
  if (supplyDate > issueDate) w.push("The supply date is after the invoice date.");
  return w;
}

// ── Data access ─────────────────────────────────────────────────────────────────────────
export async function listInvoices(orgId: string): Promise<InvoiceWithLines[]> {
  const r = await db().from("sales_invoices")
    .select("*, sales_invoice_lines(*), contacts!sales_invoices_contact_id_organization_id_fkey(name), preparer:profiles!sales_invoices_prepared_by_fkey(full_name), approver:profiles!sales_invoices_approved_by_fkey(full_name)")
    .eq("organization_id", orgId).order("issue_date", { ascending: false }).order("created_at", { ascending: false });
  if (r.error) throw r.error;
  type Row = SalesInvoice & { sales_invoice_lines: SalesLine[] | null; contacts: { name: string } | null; preparer: { full_name: string } | null; approver: { full_name: string } | null };
  return ((r.data ?? []) as unknown as Row[]).map(({ sales_invoice_lines, contacts, preparer, approver, ...inv }) => ({
    ...inv, lines: [...(sales_invoice_lines ?? [])].sort((a, b) => a.line_no - b.line_no),
    customer: contacts?.name ?? "", preparer: preparer?.full_name ?? null, approver: approver?.full_name ?? null,
  }));
}

export interface InvoiceDraft {
  doc_type: "invoice" | "credit_note"; contact_id: string; issue_date: string; due_date: string | null; supply_date: string | null;
  supply_emirate: string; currency: "AED" | "USD"; original_invoice_id: string | null; customer_reference: string; notes: string;
  prices_include_vat: boolean;
  transaction_type?: string; payment_means_code?: string | null; credit_reason_code?: string | null; incoterms?: string | null;   // P4-05
  lines: { description: string; quantity: string; unit_price: number; account_id: string; tax_code: string; item_id?: string | null;
    item_type?: string | null; hs_code?: string | null; sac_code?: string | null; unit_code?: string | null; exemption_reason?: string | null }[];   // D-64
}
export async function saveInvoice(orgId: string, id: string | null, doc: InvoiceDraft): Promise<string> {
  const r = await db().rpc("save_sales_invoice", { p_id: id as unknown as string /* null = new */, p_organization_id: orgId, p_doc: doc as never });
  if (r.error) throw r.error;
  return r.data as string;
}
const call = async (fn: "submit_sales_invoice" | "delete_sales_invoice", id: string) => { const r = await db().rpc(fn, { p_id: id }); if (r.error) throw r.error; };
export const submitInvoice = (id: string) => call("submit_sales_invoice", id);
export const deleteInvoice = (id: string) => call("delete_sales_invoice", id);
export async function postInvoice(id: string): Promise<string> { const r = await db().rpc("post_sales_invoice", { p_id: id }); if (r.error) throw r.error; return r.data as string; }
export async function sendBackInvoice(id: string, reason: string) { const r = await db().rpc("reject_sales_invoice", { p_id: id, p_reason: reason }); if (r.error) throw r.error; }

/** What is still available to credit on an invoice (D-30), from posted credit notes. */
export function creditRemaining(invoice: Pick<SalesInvoice, "id" | "net_total" | "vat_total">, all: Pick<SalesInvoice, "original_invoice_id" | "status" | "net_total" | "vat_total">[]) {
  const cns = all.filter((d) => d.original_invoice_id === invoice.id && d.status === "posted");
  return { net: invoice.net_total - cns.reduce((s, d) => s + d.net_total, 0), vat: invoice.vat_total - cns.reduce((s, d) => s + d.vat_total, 0) };
}
