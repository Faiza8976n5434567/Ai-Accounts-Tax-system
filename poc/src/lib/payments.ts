/** Receipts, supplier payments, refunds, Customer Credits and Supplier advances (P2-04 · D-11, D-34 → D-37).
 *  The database allocates, values and posts; the helpers below mirror its rules so the screen previews match. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";
import { lineAmounts } from "./invoices";
import { vatInGross } from "./vat";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Allocation = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type OpenDocument = Database["public"]["Views"]["open_documents"]["Row"];
export type CreditBalance = Database["public"]["Views"]["credit_balances"]["Row"];
export type PaymentKind = Database["public"]["Enums"]["payment_kind"];
export type PaymentWithDetails = Payment & { allocations: Allocation[]; contact: string; preparer: string | null; approver: string | null; reversed: boolean };

export const KIND: Record<PaymentKind, { label: string; customer: boolean; moneyIn: boolean; refund: boolean }> = {
  customer_receipt: { label: "Customer receipt", customer: true, moneyIn: true, refund: false },
  supplier_payment: { label: "Supplier payment", customer: false, moneyIn: false, refund: false },
  customer_refund: { label: "Refund to customer", customer: true, moneyIn: false, refund: true },
  supplier_refund: { label: "Refund from supplier", customer: false, moneyIn: true, refund: true },
};

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

// ── Pure helpers (unit-tested; mirror app.post_payment) ─────────────────────────────────
type Open = { id: string; doc_date: string; doc_no: string; open_fcy: number };
/** Exact half-up AED value of an amount in the payment currency (rate as text, e.g. "3.6725"). */
const aed = (fcy: number, rate: string) => (fcy <= 0 ? 0 : lineAmounts(10000n, fcy, 0, rate).net);

/** Oldest first; a small amount left on the last document is settled too (D-34). */
export function suggestAllocations(docs: Open[], amount: number, limitAed: number, rate = "1"): { id: string; amount: number }[] {
  const out: { id: string; amount: number }[] = [];
  let left = amount;
  for (const d of [...docs].filter((x) => x.open_fcy > 0).sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.doc_no.localeCompare(b.doc_no))) {
    if (left <= 0) break;
    let take = Math.min(left, d.open_fcy);
    left -= take;
    if (left === 0 && d.open_fcy - take > 0 && aed(d.open_fcy - take, rate) <= limitAed) take = d.open_fcy;
    out.push({ id: d.id, amount: take });
  }
  return out;
}

/** What happens to the difference between the amount and the allocations (D-34, D-11, D-36). */
export function settlement(amount: number, allocated: number, limitAed: number, rate = "1"): { writeoff: number; credit: number; error: string | null } {
  const diff = allocated - amount;
  if (diff > 0) {
    return aed(diff, rate) <= limitAed ? { writeoff: diff, credit: 0, error: null }
      : { writeoff: 0, credit: 0, error: "The allocations are more than the amount — reduce them, or record a credit note first." };
  }
  if (diff < 0 && allocated > 0 && aed(-diff, rate) <= limitAed) return { writeoff: diff, credit: 0, error: null };
  return { writeoff: 0, credit: -diff, error: null };
}

/** Days past the due date (0 or less = not yet due), for ageing (ARAP-01). */
export const daysOverdue = (dueDate: string, today: string) => Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);

// ── Data access ─────────────────────────────────────────────────────────────────────────
export async function listPayments(orgId: string): Promise<PaymentWithDetails[]> {
  const r = await db().from("payments")
    .select("*, payment_allocations!payment_allocations_payment_id_organization_id_fkey(*), contacts!payments_contact_id_organization_id_fkey(name), preparer:profiles!payments_prepared_by_fkey(full_name), approver:profiles!payments_approved_by_fkey(full_name), journal:journals!payments_journal_id_organization_id_fkey(status)")
    .eq("organization_id", orgId).order("payment_date", { ascending: false }).order("created_at", { ascending: false });
  if (r.error) throw r.error;
  type Row = Payment & { payment_allocations: Allocation[] | null; contacts: { name: string } | null; preparer: { full_name: string } | null; approver: { full_name: string } | null; journal: { status: string } | null };
  return ((r.data ?? []) as unknown as Row[]).map(({ payment_allocations, contacts, preparer, approver, journal, ...p }) => ({
    ...p, allocations: payment_allocations ?? [], contact: contacts?.name ?? "", preparer: preparer?.full_name ?? null, approver: approver?.full_name ?? null,
    reversed: journal?.status === "reversed",
  }));
}
export async function listOpenDocuments(orgId: string): Promise<OpenDocument[]> {
  const r = await db().from("open_documents").select("*").eq("organization_id", orgId).order("doc_date");
  if (r.error) throw r.error;
  return r.data ?? [];
}
export async function listCredits(orgId: string): Promise<CreditBalance[]> {
  const r = await db().from("credit_balances").select("*").eq("organization_id", orgId).order("payment_date");
  if (r.error) throw r.error;
  return r.data ?? [];
}

export interface PaymentDraft {
  kind: PaymentKind; contact_id: string; bank_account_id: string; payment_date: string; currency: "AED" | "USD";
  amount: number; bank_charges: number; reference: string; notes: string; allocations: { document_id: string; amount: number }[] | null;
  vat_advance?: boolean; advance_emirate?: string | null;   // D-58 (customer receipts only)
}

/** D-58 · VAT due on an advance for a specific supply: amount (AED, incl. VAT) × rate ÷ (10,000 + rate), half-up (F-02;
 *  mirrors app.post_payment). Unit-tested. */
export const advanceVat = (amountAed: number, rateBp: number): number => vatInGross(amountAed, rateBp);
export async function savePayment(orgId: string, id: string | null, doc: PaymentDraft): Promise<string> {
  const r = await db().rpc("save_payment", { p_id: id as unknown as string /* null = new */, p_organization_id: orgId, p_doc: doc as never });
  if (r.error) throw r.error;
  return r.data as string;
}
const call = async (fn: "submit_payment" | "delete_payment", id: string) => { const r = await db().rpc(fn, { p_id: id }); if (r.error) throw r.error; };
export const submitPayment = (id: string) => call("submit_payment", id);
export const deletePayment = (id: string) => call("delete_payment", id);
export async function postPayment(id: string): Promise<string> { const r = await db().rpc("post_payment", { p_id: id }); if (r.error) throw r.error; return r.data as string; }
export async function sendBackPayment(id: string, reason: string) { const r = await db().rpc("reject_payment", { p_id: id, p_reason: reason }); if (r.error) throw r.error; }
/** The firm's write-off limit in fils (D-34); AED 1.00 when not set. */
/** D-40: asks for the receipt/payment to be reversed; a second Firm Admin approves it under Approvals. */
export async function requestPaymentReversal(journalId: string, reason: string, date: string) {
  const r = await db().rpc("reverse_journal", { p_journal_id: journalId, p_reason: reason, p_date: date });
  if (r.error) throw r.error;
}

export async function smallDifferenceLimit(firmId: string): Promise<number> {
  const r = await db().from("firm_settings").select("value").eq("firm_id", firmId).eq("key", "small_difference_limit").maybeSingle();
  return r.data ? Number(r.data.value) : 100;
}
