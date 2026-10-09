/** Fixed asset register (P5-04 · F-21, D-68, D-70 → D-74). The database computes every schedule, builds the monthly
 *  depreciation and disposal journals and refuses anything out of order; this file shapes the form and calls it. */
import { supabase } from "./supabase";
import { fmtPlain, parseAedToFils } from "./money";

export type Method = "straight_line" | "reducing_balance" | "sum_of_years" | "units";
export const METHODS: [Method, string, string][] = [
  ["straight_line", "Straight line", "Equal monthly charge over the useful life"],
  ["reducing_balance", "Reducing balance", "A yearly % of the book value at the start of each asset-year"],
  ["sum_of_years", "Sum-of-years' digits", "Higher charges early: year 1 = n/Σ, year 2 = (n−1)/Σ … (life in whole years)"],
  ["units", "Units of production", "Cost per unit × units used each month (km, hours …)"],
];
export const METHOD_LABEL = Object.fromEntries(METHODS.map(([v, l]) => [v, l])) as Record<Method, string>;

export interface AssetCategory { code: string; name: string; default_method: Method; default_life_months: number | null; default_rate_bp: number | null }
export interface Asset {
  id: string; asset_no: string; name: string; description: string | null; category_code: string | null; category_name: string | null; location: string | null; tag_no: string | null;
  purchase_date: string; cost: number; residual: number; method: Method; life_months: number | null; rate_bp: number | null; units_total: number | null; units_name: string | null;
  opening_accum: number; opening_units: number; opening_as_at: string | null; asset_account_id: string; accum_account_id: string; expense_account_id: string;
  source_bill_line_id: string | null; status: "active" | "disposed"; disposed_on: string | null; disposal_kind: "sold" | "scrapped" | null; disposal_proceeds: number | null;
  disposal_journal_id: string | null; disposal_journal_status: string | null; accum: number; pending: number; nbv: number; in_books: boolean; charged: boolean;
}
export interface Register {
  as_at: string; assets: Asset[];
  ledger: { account_id: string; code: string; name: string; kind: "cost" | "accum"; register: number; ledger: number }[];
  candidates: { line_id: string; bill_id: string; supplier_invoice_no: string; bill_date: string; description: string; account_code: string; cost: number }[];
  runs: { id: string; month: string; journal_id: string; journal_no: string | null; status: string; total: number }[];
  next_month: string | null;
  sale_lines: { line_id: string; invoice_no: string | null; issue_date: string; description: string; net: number }[];
}
export interface ScheduleRow { month: string; charge: number; nbv: number; charged: number | null; units: number | null }

/** The form, as typed (AED and years as text). */
export interface AssetDraft {
  name: string; description: string; category_code: string; location: string; tag_no: string; purchase_date: string; cost: string; residual: string;
  method: Method; life_years: string; rate_pct: string; units_total: string; units_name: string;
  has_history: boolean; opening_accum: string; opening_units: string; opening_as_at: string;
  asset_account_id: string; accum_account_id: string; expense_account_id: string; source_bill_line_id: string | null;
}
export const emptyAsset = (): AssetDraft => ({
  name: "", description: "", category_code: "", location: "", tag_no: "", purchase_date: "", cost: "", residual: "0", method: "straight_line",
  life_years: "", rate_pct: "", units_total: "", units_name: "", has_history: false, opening_accum: "", opening_units: "", opening_as_at: "",
  asset_account_id: "", accum_account_id: "", expense_account_id: "", source_bill_line_id: null,
});
export function fromAsset(a: Asset): AssetDraft {
  return {
    name: a.name, description: a.description ?? "", category_code: a.category_code ?? "", location: a.location ?? "", tag_no: a.tag_no ?? "", purchase_date: a.purchase_date,
    cost: fmtPlain(a.cost), residual: fmtPlain(a.residual), method: a.method, life_years: a.life_months ? yearsText(a.life_months) : "", rate_pct: a.rate_bp ? pctText(a.rate_bp) : "",
    units_total: a.units_total ? String(a.units_total) : "", units_name: a.units_name ?? "", has_history: a.opening_as_at !== null,
    opening_accum: fmtPlain(a.opening_accum), opening_units: String(a.opening_units), opening_as_at: a.opening_as_at ?? "",
    asset_account_id: a.asset_account_id, accum_account_id: a.accum_account_id, expense_account_id: a.expense_account_id, source_bill_line_id: a.source_bill_line_id,
  };
}
/** 36 months → "3", 30 → "2.5". */
export const yearsText = (months: number) => (months % 12 === 0 ? String(months / 12) : String(Math.round((months / 12) * 100) / 100));
/** 2000 bp → "20", 1250 → "12.5". */
export const pctText = (bp: number) => (bp % 100 === 0 ? String(bp / 100) : `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, "0").replace(/0$/, "")}`);

/** "2.5" years → 30 months (whole months only); "" → null. */
export function yearsToMonths(text: string): number | null {
  const m = text.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if ((hundredths * 12) % 100 !== 0) return null;
  return (hundredths * 12) / 100;
}
/** "20" → 2000 bp, "12.5" → 1250; at most 2 decimals, 0 < x ≤ 100. */
export function pctToBp(text: string): number | null {
  const m = text.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp > 0 && bp <= 10000 ? bp : null;
}

/** Problems with the form, or the database payload. */
export function assetPayload(d: AssetDraft, fromBill: boolean): { problems: string[]; payload: Record<string, unknown> } {
  const problems: string[] = [];
  const cost = fromBill ? 1 : parseAedToFils(d.cost), residual = parseAedToFils(d.residual || "0");
  const life = d.life_years.trim() ? yearsToMonths(d.life_years) : null, rate = d.rate_pct.trim() ? pctToBp(d.rate_pct) : null;
  if (!d.name.trim()) problems.push("Enter the asset's name.");
  if (!fromBill && !/^\d{4}-\d{2}-\d{2}$/.test(d.purchase_date)) problems.push("Enter the purchase date.");
  if (cost === null || cost <= 0) problems.push("Enter the cost in AED.");
  if (residual === null || residual < 0) problems.push("The residual value must be an AED amount (0 if none).");
  else if (!fromBill && cost !== null && residual >= cost) problems.push("The residual value must be below the cost.");
  if (d.life_years.trim() && life === null) problems.push("Enter the useful life in years (e.g. 5 or 2.5 — whole months).");
  if (d.rate_pct.trim() && rate === null) problems.push("Enter the yearly rate as a % between 0 and 100.");
  if (d.method === "straight_line" && !life) problems.push("Straight line needs a useful life.");
  if (d.method === "sum_of_years" && (!life || life % 12 !== 0)) problems.push("Sum-of-years' digits needs a useful life in whole years.");
  if (d.method === "reducing_balance" && !rate) problems.push("Reducing balance needs a yearly rate (%).");
  const unitsTotal = d.method === "units" ? Number(d.units_total) : null;
  if (d.method === "units" && (!/^\d+$/.test(d.units_total) || !unitsTotal || !d.units_name.trim())) problems.push("Units of production needs the total units over the life and what a unit is (e.g. km).");
  let openingAccum = 0, openingUnits = 0;
  if (d.has_history) {
    const oa = parseAedToFils(d.opening_accum || "0");
    if (oa === null || oa < 0) problems.push("Accumulated depreciation before the app must be an AED amount.");
    else openingAccum = oa;
    if (d.method === "units") { openingUnits = /^\d+$/.test(d.opening_units || "0") ? Number(d.opening_units || "0") : -1; if (openingUnits < 0) problems.push("Units used before the app must be a whole number."); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.opening_as_at)) problems.push("Enter the date the accumulated depreciation is as at.");
    else if (d.purchase_date && d.opening_as_at < d.purchase_date) problems.push("The 'as at' date cannot be before the purchase date.");
    if (openingAccum === 0 && openingUnits === 0) problems.push("Enter the accumulated depreciation before the app (or untick 'owned before').");
  }
  const payload: Record<string, unknown> = {
    name: d.name.trim(), description: d.description.trim(), category_code: d.category_code, location: d.location.trim(), tag_no: d.tag_no.trim(),
    residual: residual ?? 0, method: d.method, life_months: life ?? "", rate_bp: d.method === "reducing_balance" ? rate ?? "" : "",
    units_total: d.method === "units" ? unitsTotal ?? "" : "", units_name: d.method === "units" ? d.units_name.trim() : "",
    opening_accum: d.has_history ? openingAccum : 0, opening_units: d.has_history ? Math.max(openingUnits, 0) : 0, opening_as_at: d.has_history ? d.opening_as_at : "",
    accum_account_id: d.accum_account_id, expense_account_id: d.expense_account_id,
    ...(fromBill ? { source_bill_line_id: d.source_bill_line_id } : { purchase_date: d.purchase_date, cost: cost ?? 0, asset_account_id: d.asset_account_id }),
  };
  return { problems, payload };
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const listCategories = async () => ok(await db().from("asset_categories").select("code, name, default_method, default_life_months, default_rate_bp").order("sort")) as AssetCategory[];
export const assetRegister = async (orgId: string, asAt: string) => ok(await db().rpc("asset_register", { p_organization_id: orgId, p_as_at: asAt })) as unknown as Register;
export const assetSchedule = async (assetId: string) => ok(await db().rpc("asset_schedule_view", { p_asset_id: assetId })) as unknown as ScheduleRow[];
export const saveAsset = async (id: string | null, orgId: string, payload: Record<string, unknown>) =>
  ok(await db().rpc("save_fixed_asset", { p_id: id as string, p_organization_id: orgId, p_asset: payload as never })) as string;
export const setUsage = async (assetId: string, month: string, units: number) => { ok(await db().rpc("set_asset_usage", { p_asset_id: assetId, p_month: month, p_units: units })); };
export const runDepreciation = async (orgId: string, month: string) => ok(await db().rpc("run_depreciation", { p_organization_id: orgId, p_month: month })) as string;
export const cancelRun = async (runId: string) => { ok(await db().rpc("cancel_depreciation_run", { p_run_id: runId })); };
export const disposeAsset = async (assetId: string, date: string, kind: "sold" | "scrapped", invoiceLineId: string | null) =>
  ok(await db().rpc("dispose_asset", { p_asset_id: assetId, p_date: date, p_kind: kind, p_invoice_line_id: invoiceLineId ?? undefined })) as string;
export const cancelDisposal = async (assetId: string) => { ok(await db().rpc("cancel_disposal", { p_asset_id: assetId })); };
