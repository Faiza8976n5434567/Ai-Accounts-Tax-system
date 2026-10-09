/** Year-end close (P5-05 · D-75 → D-77). The database runs the checklist, builds the closing journal, refuses an
 *  approval by the preparer or on changed figures, and locks the year; this file reads and calls it. */
import { supabase } from "./supabase";

export interface YeCheck { code: string; label: string; blocking: boolean; ok: boolean; detail: string | null }
export interface YeClose { id: string; journal_id: string; journal_no: string | null; status: string; net_result: number; created_at: string; prepared_by: string | null }
export interface YearEndStatus {
  fy_start: string; fy_end: string; ended: boolean; ready: boolean; checks: YeCheck[];
  to_close: { account_id: string; code: string; name: string; dc: number }[]; net_result: number;
  closes: YeClose[]; periods: { total: number; locked: number };
}

/** Financial-year ends covered by the client's accounting periods (latest first). The year ends on the last day of the
 *  month before the FY start month; only years whose 12 months all exist are listed. */
export function fyEnds(periods: { start_date: string; end_date: string }[], fyStartMonth: number): string[] {
  const ends = new Set(periods.map((p) => p.end_date));
  const starts = new Set(periods.map((p) => p.start_date));
  const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
  const out: string[] = [];
  for (const e of ends) {
    const [y, m] = e.split("-").map(Number);
    if (m !== endMonth) continue;
    const startYear = fyStartMonth === 1 ? y : y - 1;
    if (starts.has(`${startYear}-${String(fyStartMonth).padStart(2, "0")}-01`)) out.push(e);
  }
  return out.sort().reverse();
}

/** "Profit" or "Loss" and the amount for the closing journal's result. */
export const resultLabel = (net: number) => (net >= 0 ? { label: "Profit for the year", amount: net } : { label: "Loss for the year", amount: -net });

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };
export const yearEndStatus = async (orgId: string, fyEnd: string) => ok(await db().rpc("year_end_status", { p_organization_id: orgId, p_fy_end: fyEnd })) as unknown as YearEndStatus;
export const closeYear = async (orgId: string, fyEnd: string) => ok(await db().rpc("close_year", { p_organization_id: orgId, p_fy_end: fyEnd })) as string;
export const completeYearClose = async (closeId: string) => ok(await db().rpc("complete_year_close", { p_close_id: closeId })) as string;
export const cancelYearClose = async (closeId: string) => { ok(await db().rpc("cancel_year_close", { p_close_id: closeId })); };
