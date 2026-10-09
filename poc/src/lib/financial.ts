/** Profit & loss, balance sheet, ageing and statements (P2-06 · D-28). The database calculates every figure;
 *  the helpers below only group and total them for the screen and the Excel export, and are unit-tested. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

type F = Database["public"]["Functions"];
export type PnlRow = F["profit_and_loss"]["Returns"][number];
export type BsRow = F["balance_sheet"]["Returns"][number];
export type AgeRow = F["ageing"]["Returns"][number];
export type StatementRow = F["contact_statement"]["Returns"][number];
export interface Bucket { label: string; from: number | null; to: number | null }

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const profitAndLoss = async (orgId: string, from: string, to: string) => ok(await db().rpc("profit_and_loss", { p_organization_id: orgId, p_from: from, p_to: to })) ?? [];
export const balanceSheet = async (orgId: string, asOf: string) => ok(await db().rpc("balance_sheet", { p_organization_id: orgId, p_as_of: asOf })) ?? [];
export const ageing = async (orgId: string, side: "customer" | "supplier", asOf: string) => ok(await db().rpc("ageing", { p_organization_id: orgId, p_side: side, p_as_of: asOf })) ?? [];
export const contactStatement = async (orgId: string, contactId: string, side: "customer" | "supplier", from: string, to: string) =>
  ok(await db().rpc("contact_statement", { p_organization_id: orgId, p_contact_id: contactId, p_side: side, p_from: from, p_to: to })) ?? [];
export async function ageingBuckets(firmId: string): Promise<Bucket[]> {
  const r = await db().from("firm_settings").select("value").eq("firm_id", firmId).eq("key", "ageing_buckets").maybeSingle();
  return (r.data?.value as Bucket[] | undefined) ?? DEFAULT_BUCKETS;
}
export const DEFAULT_BUCKETS: Bucket[] = [
  { label: "Current", from: null, to: 0 }, { label: "1–30", from: 1, to: 30 }, { label: "31–60", from: 31, to: 60 }, { label: "61–90", from: 61, to: 90 }, { label: "90+", from: 91, to: null },
];

// ── P&L (IFRS for SMEs function-of-expense layout) ──────────────────────────────────────
export interface PnlSection { title: string; rows: PnlRow[]; total: number }
export function pnlLayout(rows: PnlRow[]) {
  const pick = (f: (r: PnlRow) => boolean) => rows.filter(f);
  const sum = (rs: PnlRow[]) => rs.reduce((s, r) => s + r.amount, 0);
  const revenue = pick((r) => r.type === "revenue" && r.report_group !== "Other income");
  const other = pick((r) => r.type === "revenue" && r.report_group === "Other income");
  const cos = pick((r) => r.type === "expense" && r.report_group === "Cost of sales");
  const tax = pick((r) => r.type === "expense" && r.report_group === "Income tax");
  const opex = pick((r) => r.type === "expense" && r.report_group !== "Cost of sales" && r.report_group !== "Income tax");
  const grossProfit = sum(revenue) - sum(cos);
  const beforeTax = grossProfit + sum(other) - sum(opex);
  return {
    sections: [
      { title: "Revenue", rows: revenue, total: sum(revenue) }, { title: "Cost of sales", rows: cos, total: sum(cos) },
      { title: "Other income", rows: other, total: sum(other) }, { title: "Expenses", rows: opex, total: sum(opex) },
      { title: "Income tax", rows: tax, total: sum(tax) },
    ] as PnlSection[],
    grossProfit, beforeTax, netProfit: beforeTax - sum(tax),
  };
}

// ── Balance sheet ───────────────────────────────────────────────────────────────────────
export function bsLayout(rows: BsRow[]) {
  const section = (s: string) => {
    const rs = rows.filter((r) => r.section === s);
    const groups = new Map<string, BsRow[]>();
    for (const r of rs) { const g = r.report_group ?? "Other"; groups.set(g, [...(groups.get(g) ?? []), r]); }
    return { groups: [...groups.entries()].map(([name, list]) => ({ name, rows: list, total: list.reduce((t, r) => t + r.amount, 0) })), total: rs.reduce((t, r) => t + r.amount, 0) };
  };
  const assets = section("assets"), liabilities = section("liabilities"), equity = section("equity");
  return { assets, liabilities, equity, balanced: assets.total === liabilities.total + equity.total };
}

// ── Ageing by due date (ARAP-01) ────────────────────────────────────────────────────────
export function bucketOf(daysOverdue: number, buckets: Bucket[]): number {
  const i = buckets.findIndex((b) => (b.from === null || daysOverdue >= b.from) && (b.to === null || daysOverdue <= b.to));
  return i < 0 ? buckets.length - 1 : i;
}
export function ageingByContact(rows: AgeRow[], buckets: Bucket[]) {
  const by = new Map<string, { contact: string; buckets: number[]; total: number }>();
  for (const r of rows) {
    const c = by.get(r.contact_id) ?? { contact: r.contact_name, buckets: buckets.map(() => 0), total: 0 };
    c.buckets[bucketOf(r.days_overdue, buckets)] += r.open_aed;
    c.total += r.open_aed;
    by.set(r.contact_id, c);
  }
  const list = [...by.values()].sort((a, b) => a.contact.localeCompare(b.contact));
  return { list, totals: buckets.map((_, i) => list.reduce((s, c) => s + c.buckets[i], 0)), total: list.reduce((s, c) => s + c.total, 0) };
}

// ── Excel export (RPT-03 · SEC-14) ──────────────────────────────────────────────────────
/** Text that Excel could run as a formula (=, +, -, @, tab, CR) is made inert with a leading apostrophe. */
export const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export type Cell = string | number | null;
/** AED amounts go to Excel as numbers of dirhams with 2 decimals (from exact fils), text is made safe. */
export const xlsxRow = (cells: (string | { fils: number } | null)[]): Cell[] =>
  cells.map((c) => (c === null ? null : typeof c === "string" ? safeCell(c) : c.fils / 100));
export async function downloadXlsx(fileName: string, sheetName: string, rows: Cell[][]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (const key of Object.keys(ws)) {
    const cell = ws[key] as { t?: string; z?: string } | undefined;
    if (cell && cell.t === "n") cell.z = "#,##0.00";
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}
