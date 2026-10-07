/** Trial balance and general ledger (P1-15). Figures are calculated by the database every time
 *  (trial_balance / general_ledger functions); these helpers only shape them for the screen. */
import { supabase } from "./supabase";
import type { Fils } from "./money";
import type { Database } from "./database.types";

export type TbRow = Database["public"]["Functions"]["trial_balance"]["Returns"][number];
export type GlRow = Database["public"]["Functions"]["general_ledger"]["Returns"][number];

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

export async function trialBalance(orgId: string, from: string, to: string): Promise<TbRow[]> {
  const r = await db().rpc("trial_balance", { p_organization_id: orgId, p_from: from, p_to: to });
  if (r.error) throw r.error;
  return r.data ?? [];
}

export async function generalLedger(orgId: string, accountId: string, from: string, to: string): Promise<GlRow[]> {
  const r = await db().rpc("general_ledger", { p_organization_id: orgId, p_account_id: accountId, p_from: from, p_to: to });
  if (r.error) throw r.error;
  return r.data ?? [];
}

/** A signed balance (debit positive) shown in Debit / Credit columns, as accountants expect. */
export const drCr = (balance: Fils): { dr: Fils; cr: Fils } => (balance >= 0 ? { dr: balance, cr: 0 } : { dr: 0, cr: -balance });

export function tbTotals(rows: Pick<TbRow, "opening" | "debit" | "credit" | "closing">[]) {
  const t = { openingDr: 0, openingCr: 0, debit: 0, credit: 0, closingDr: 0, closingCr: 0 };
  for (const r of rows) {
    const o = drCr(r.opening), c = drCr(r.closing);
    t.openingDr += o.dr; t.openingCr += o.cr; t.debit += r.debit; t.credit += r.credit; t.closingDr += c.dr; t.closingCr += c.cr;
  }
  return { ...t, balanced: t.openingDr === t.openingCr && t.debit === t.credit && t.closingDr === t.closingCr };
}

/** Start of the financial year containing `today` (yyyy-mm-dd), for a year starting in `fyStartMonth`. */
export function fyStart(today: string, fyStartMonth: number): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const year = m < fyStartMonth ? y - 1 : y;
  return `${year}-${String(fyStartMonth).padStart(2, "0")}-01`;
}
