/** VAT 201 return (P3-01, P3-02 · D-12, D-42 → D-44). The database calculates every box, freezes approved returns
 *  and locks the quarter; this file only reads and calls it, and shapes the boxes for the FTA layout. */
import { supabase } from "./supabase";

export interface VatBox { box_code: string; label: string; sort: number; amount: number; vat: number; adjustment: number }
export interface VatAdjustment { id: string; box_code: string; amount: number; vat: number; adjustment: number; reason: string; legal_reference: string | null; created_at: string }
export interface PriorItem { entry_date: string; journal_id: string; journal_no: string; memo: string | null; tax_code: string; amount: number; vat: number; period_end: string }
export type VatStatus = "draft" | "in_review" | "approved" | "filed";
export interface VatPreview {
  period: { id: string; start_date: string; end_date: string; due_date: string };
  return: { id: string; status: VatStatus; prepared_by: string | null; approved_by: string | null; approved_at: string | null; snapshot_sha256: string | null;
            filed_on: string | null; fta_reference: string | null } | null;
  frozen: boolean; boxes: VatBox[]; adjustments: VatAdjustment[]; prior_period_items: PriorItem[];
}
export interface RecRow { group: string; account: string; return: number; ledger: number }
export interface VatRec {
  rows: RecRow[]; box14: number; ledger_net: number;
  adjustments: { box_code: string; amount: number; vat: number; adjustment: number; reason: string }[];
  other_postings: { entry_date: string; journal_no: string; source: string; memo: string | null; account: string; amount: number }[];
  clearing_journal: { id: string; journal_no: string; entry_date: string; amount: number } | null;
}
export interface BoxLine { entry_date: string; journal_id: string; journal_no: string; source: string; memo: string | null; description: string | null; tax_code: string; amount: number; vat: number }

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const vatPreview = async (taxPeriodId: string) => ok(await db().rpc("vat_return_preview", { p_tax_period_id: taxPeriodId })) as unknown as VatPreview;
export const vatReconciliation = async (taxPeriodId: string) => ok(await db().rpc("vat_reconciliation", { p_tax_period_id: taxPeriodId })) as unknown as VatRec;
/** Total of manual adjustments' effect on box 14 (D-43): output adjustments raise it, input adjustments lower it. */
export function adjustmentsEffect(adj: VatRec["adjustments"]): number {
  return adj.reduce((s, a) => s + (["9"].includes(a.box_code) ? -(a.vat + a.adjustment) : a.vat + a.adjustment), 0);
}
export const vatBoxLines = async (taxPeriodId: string, box: string) => (ok(await db().rpc("vat_box_lines", { p_tax_period_id: taxPeriodId, p_box: box })) ?? []) as BoxLine[];
export const startVatReturn = async (taxPeriodId: string) => ok(await db().rpc("start_vat_return", { p_tax_period_id: taxPeriodId })) as string;
export async function addVatAdjustment(returnId: string, box: string, values: { amount: number; vat: number; adjustment: number }, reason: string, legalReference: string) {
  ok(await db().rpc("add_vat_adjustment", { p_return_id: returnId, p_box: box, p_amount: values.amount, p_vat: values.vat, p_adjustment: values.adjustment,
    p_reason: reason, p_legal_reference: legalReference || undefined }));
}
export const deleteVatAdjustment = async (id: string) => { ok(await db().rpc("delete_vat_adjustment", { p_id: id })); };
export const submitVatReturn = async (id: string) => { ok(await db().rpc("submit_vat_return", { p_return_id: id })); };
export const rejectVatReturn = async (id: string, reason: string) => { ok(await db().rpc("reject_vat_return", { p_return_id: id, p_reason: reason })); };
export const approveVatReturn = async (id: string) => ok(await db().rpc("approve_vat_return", { p_return_id: id })) as string;
export const markVatFiled = async (id: string, reference: string, filedOn: string) => {
  ok(await db().rpc("mark_vat_return_filed", { p_return_id: id, p_fta_reference: reference, p_filed_on: filedOn }));
};

// ── FTA layout ──────────────────────────────────────────────────────────────────────────
/** Boxes that may be adjusted by hand (D-43): the adjustment column of 1a–1g and 9; amount and VAT of 2 and 7. */
export const ADJUSTABLE: Record<string, "adjustment" | "amount_vat"> = {
  "1a": "adjustment", "1b": "adjustment", "1c": "adjustment", "1d": "adjustment", "1e": "adjustment", "1f": "adjustment", "1g": "adjustment",
  "9": "adjustment", "2": "amount_vat", "7": "amount_vat",
};
/** Which columns the FTA form shows for a box (others are blank on the form, not 0.00). */
export function columns(box: string): { amount: boolean; vat: boolean; adjustment: boolean } {
  if (["12", "13", "14"].includes(box)) return { amount: false, vat: true, adjustment: false };
  if (["4", "5"].includes(box)) return { amount: true, vat: false, adjustment: false };
  if (/^1[a-g]$/.test(box) || ["8", "9", "11"].includes(box)) return { amount: true, vat: true, adjustment: true };
  return { amount: true, vat: true, adjustment: false };
}
/** VAT-11: payable when box 14 is positive, refundable when negative. */
export function netPosition(boxes: VatBox[]): { label: string; amount: number } {
  const v = boxes.find((b) => b.box_code === "14")?.vat ?? 0;
  return v >= 0 ? { label: "Payable to the FTA", amount: v } : { label: "Refundable by the FTA", amount: -v };
}
/** Checks the totals add up exactly as the FTA form requires (used as a safety check on screen). */
export function totalsAgree(boxes: VatBox[]): boolean {
  const get = (c: string) => boxes.find((b) => b.box_code === c) ?? { amount: 0, vat: 0, adjustment: 0 };
  const out = boxes.filter((b) => /^(1[a-g]|[2-7])$/.test(b.box_code)), inp = boxes.filter((b) => ["9", "10"].includes(b.box_code));
  const s = (list: VatBox[], k: "amount" | "vat" | "adjustment") => list.reduce((t, b) => t + b[k], 0);
  return get("8").amount === s(out, "amount") && get("8").vat === s(out, "vat") && get("8").adjustment === s(out, "adjustment")
    && get("11").amount === s(inp, "amount") && get("11").vat === s(inp, "vat") && get("11").adjustment === s(inp, "adjustment")
    && get("12").vat === get("8").vat + get("8").adjustment && get("13").vat === get("11").vat + get("11").adjustment
    && get("14").vat === get("12").vat - get("13").vat;
}
export const STATUS_LABEL: Record<VatStatus | "none", [string, "slate" | "amber" | "emerald" | "indigo"]> = {
  none: ["Not started", "slate"], draft: ["Draft", "slate"], in_review: ["Waiting for approval", "amber"], approved: ["Approved — frozen", "emerald"], filed: ["Filed with the FTA", "indigo"],
};
