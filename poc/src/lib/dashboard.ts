/** Firm dashboard (P3-07 · F-23, display only). The database calculates every figure (firm_dashboard); the helpers
 *  below only rank clients and total them for the screen, and are unit-tested. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type DashRow = Database["public"]["Functions"]["firm_dashboard"]["Returns"][number];

export async function firmDashboard(): Promise<DashRow[]> {
  if (!supabase) throw new Error("Not connected");
  const r = await supabase.rpc("firm_dashboard");
  if (r.error) throw r.error;
  return r.data ?? [];
}

/** F-23 · days sales outstanding = open receivables ÷ revenue of the last 365 days × 365 (null when no revenue). */
export function dso(arOpen: number, revenue365: number): number | null {
  if (revenue365 <= 0) return null;
  return Math.round((arOpen * 365) / revenue365);
}

export const approvalsWaiting = (r: Pick<DashRow, "pending_journals" | "pending_invoices" | "pending_bills" | "pending_payments" | "pending_vat_returns" | "pending_reconciliations">) =>
  r.pending_journals + r.pending_invoices + r.pending_bills + r.pending_payments + r.pending_vat_returns + r.pending_reconciliations;

/** What needs attention, most urgent first: overdue VAT, integrity problems, approvals, overdue receivables. */
export function attention(r: DashRow): { level: 0 | 1 | 2 | 3; reasons: string[] } {
  const reasons: string[] = [];
  let level: 0 | 1 | 2 | 3 = 0;
  const up = (l: 1 | 2 | 3) => { if (l > level) level = l; };
  if (r.vat_overdue_returns > 0) { reasons.push(`${r.vat_overdue_returns} VAT return${r.vat_overdue_returns > 1 ? "s" : ""} overdue`); up(3); }
  if (r.integrity_status === "error") { reasons.push("Integrity problem"); up(3); }
  if (approvalsWaiting(r) > 0) { reasons.push(`${approvalsWaiting(r)} waiting for approval`); up(2); }
  if (r.vat_open_returns > r.vat_overdue_returns) { reasons.push("VAT return to prepare"); up(2); }
  if (r.integrity_status === "warning") { reasons.push("Housekeeping warning"); up(1); }
  if (r.ar_overdue > 0) { reasons.push("Customers overdue"); up(1); }
  if (r.bank_unmatched > 0) { reasons.push(`${r.bank_unmatched} bank line${r.bank_unmatched > 1 ? "s" : ""} to match`); up(1); }
  return { level, reasons };
}

export function sortByAttention(rows: DashRow[]): DashRow[] {
  return [...rows].sort((a, b) => attention(b).level - attention(a).level || a.legal_name.localeCompare(b.legal_name));
}

export function firmTotals(rows: DashRow[]) {
  const s = (f: (r: DashRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    clients: rows.length, vatOverdue: s((r) => r.vat_overdue_returns), vatToPrepare: s((r) => r.vat_open_returns),
    approvals: s(approvalsWaiting), arOverdue: s((r) => r.ar_overdue), arOpen: s((r) => r.ar_open), apOpen: s((r) => r.ap_open),
    integrityProblems: rows.filter((r) => r.integrity_status === "error").length, bankUnmatched: s((r) => r.bank_unmatched),
  };
}
