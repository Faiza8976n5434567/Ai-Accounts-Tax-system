/** Corporate Tax return (P5-01 · F-08 → F-11, D-66, D-67). The database computes every figure from the posted books and
 *  the tax rules in force at the period end, freezes approved returns and keeps maker-checker; this file only reads and
 *  calls it, and lays the computation out as the lines the screen and the Excel file show. */
import { supabase } from "./supabase";
import { fmt } from "./money";

export type CtStatus = "draft" | "approved" | "filed";
export interface CtAddback { account_id: string; account_code: string; account_name: string; tag: string; tag_label: string; legal_reference: string | null; expense: number; percent_bp: number; add_back: number }
export interface CtAdjustment { id: string; direction: "add" | "deduct"; amount: number; description: string; legal_reference: string | null }
export interface CtProfitLine { account_id: string; account_code: string; account_name: string; type: "revenue" | "expense"; amount: number }
export interface CtComputation {
  period: { id: string; start_date: string; end_date: string; due_date: string };
  organization: { legal_name: string; ct_trn: string | null; regime: "standard" | "sbr" | "qfzp" };
  rules: { rate_bp: number; zero_band: number; loss_cap_bp: number; sbr_limit: number; sbr_last_period_end: string };
  revenue: number; expenses: number; accounting_profit: number; profit_lines: CtProfitLine[];
  addbacks: CtAddback[]; addbacks_total: number; adjustments: CtAdjustment[]; adjustments_total: number;
  taxable_income_before_losses: number; sbr_elected: boolean; sbr_eligible: boolean; sbr_applied: boolean;
  losses_bf: number; loss_relief: number; loss_of_period: number; taxable_income: number; ct_payable: number; losses_cf: number;
  warnings: string[]; config_version?: string;
  return: { id: string; status: CtStatus; prepared_by: string | null; approved_by: string | null; approved_at: string | null; snapshot_sha256: string | null;
            filed_on: string | null; fta_reference: string | null } | null;
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const ctPreview = async (taxPeriodId: string) => ok(await db().rpc("ct_return_preview", { p_tax_period_id: taxPeriodId })) as unknown as CtComputation;
export const startCtReturn = async (taxPeriodId: string) => ok(await db().rpc("start_ct_return", { p_tax_period_id: taxPeriodId })) as string;
export async function addCtAdjustment(returnId: string, direction: "add" | "deduct", amount: number, description: string, legalReference: string) {
  ok(await db().rpc("add_ct_adjustment", { p_return_id: returnId, p_direction: direction, p_amount: amount, p_description: description, p_legal_reference: legalReference }));
}
export const deleteCtAdjustment = async (id: string) => { ok(await db().rpc("delete_ct_adjustment", { p_id: id })); };
export const approveCtReturn = async (id: string) => ok(await db().rpc("approve_ct_return", { p_return_id: id })) as string;
export const fileCtReturn = async (id: string, filedOn: string, reference: string) => {
  ok(await db().rpc("file_ct_return", { p_return_id: id, p_filed_on: filedOn, p_fta_reference: reference }));
};

export const CT_STATUS_LABEL: Record<CtStatus | "none", [string, "slate" | "emerald" | "indigo"]> = {
  none: ["Not started", "slate"], draft: ["Draft", "slate"], approved: ["Approved — frozen", "emerald"], filed: ["Filed with the FTA", "indigo"],
};

/** "900" bp → "9%", "7500" → "75%", "5000" → "50%" (whole or 2-decimal percentages, no floating point). */
export function pct(bp: number): string {
  const whole = Math.trunc(bp / 100), rest = Math.abs(bp % 100);
  return rest === 0 ? `${whole}%` : `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
}

export interface CtLine { label: string; amount: number | null; basis: string; kind: "base" | "add" | "less" | "total" | "note"; drill?: "profit" }
/** The computation as the lines of the return (amounts in fils; "less" lines are shown as deductions). */
export function ctLines(c: CtComputation): CtLine[] {
  const L: CtLine[] = [
    { label: "Accounting profit before tax", amount: c.accounting_profit, basis: "Posted books of the period (Corporate Tax expense excluded)", kind: "base", drill: "profit" },
    ...c.addbacks.map((a): CtLine => ({ label: `${a.account_code} ${a.account_name} — ${a.tag_label} (${pct(a.percent_bp)} of ${fmt(a.expense)})`,
      amount: a.add_back, basis: a.legal_reference ?? "F-08", kind: "add" })),
    ...c.adjustments.map((a): CtLine => ({ label: a.description, amount: a.amount, basis: a.legal_reference ?? "", kind: a.direction === "add" ? "add" : "less" })),
    { label: "Taxable income before losses", amount: c.taxable_income_before_losses, basis: "", kind: "total" },
  ];
  if (c.sbr_applied) {
    L.push({ label: `Small Business Relief — revenue ${fmt(c.revenue)} within the limit; taxable income treated as nil`, amount: null, basis: "FDL 47/2022 Art 21; MD 73/2023", kind: "note" });
  } else if (c.loss_of_period > 0) {
    L.push({ label: "Tax loss of the period (carried forward)", amount: c.loss_of_period, basis: "FDL 47/2022 Art 37", kind: "note" });
  } else if (c.loss_relief > 0) {
    L.push({ label: `Loss relief (losses brought forward, capped at ${pct(c.rules.loss_cap_bp)} of taxable income)`, amount: c.loss_relief, basis: "FDL 47/2022 Art 37", kind: "less" });
  }
  L.push({ label: "Taxable income", amount: c.taxable_income, basis: "", kind: "total" });
  if (!c.sbr_applied) L.push({ label: `Less 0% band`, amount: Math.min(c.taxable_income, c.rules.zero_band), basis: "CD 116/2022", kind: "less" });
  L.push({ label: `Corporate Tax payable (${pct(c.rules.rate_bp)})`, amount: c.ct_payable, basis: "FDL 47/2022 Art 3", kind: "total" });
  return L;
}
