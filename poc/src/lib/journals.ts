/** Journals, approvals, reversals, period locks and chart-of-accounts changes (P1-14).
 *  Every change goes through a database function or an RLS-protected write; the rules below only
 *  decide what the screens offer — the database re-checks everything (Spec 02 §3). */
import { supabase } from "./supabase";
import { parseAedToFils, type Fils } from "./money";
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
export type JournalStatus = Database["public"]["Enums"]["journal_status"];
export type JournalSource = Database["public"]["Enums"]["journal_source"];
export interface JournalLine { id: string; line_no: number; account_id: string; debit: Fils; credit: Fils; description: string | null }
export interface Journal {
  id: string; journal_no: string | null; entry_date: string; source: JournalSource; memo: string | null; status: JournalStatus;
  reversal_of: string | null; prepared_by: string | null; approved_by: string | null; posted_at: string | null; created_at: string;
  preparer: string | null; approver: string | null; lines: JournalLine[];
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = (r: { error: { message: string } | null }) => { if (r.error) throw r.error; };

// ── Pure rules (unit-tested) ────────────────────────────────────────────────────────────

export const lineTotals = (lines: { debit: Fils; credit: Fils }[]) => {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  return { debit, credit, difference: debit - credit };
};

export interface EditorLine { accountId: string; description: string; debit: string; credit: string }
export interface AccountInfo { id: string; code: string; is_control: boolean; is_active: boolean }

/** Turns what was typed into fils and lists every problem (empty list = ready to submit). */
export function checkDraft(lines: EditorLine[], source: JournalSource, accounts: Map<string, AccountInfo>) {
  const problems: string[] = [];
  const parsed: { account_id: string; debit: Fils; credit: Fils; description: string }[] = [];
  lines.forEach((l, i) => {
    const blank = !l.accountId && !l.debit.trim() && !l.credit.trim() && !l.description.trim();
    if (blank) return;
    const n = i + 1;
    const debit = l.debit.trim() ? parseAedToFils(l.debit) : 0;
    const credit = l.credit.trim() ? parseAedToFils(l.credit) : 0;
    if (!l.accountId) problems.push(`Line ${n}: choose an account.`);
    if (debit === null || credit === null) { problems.push(`Line ${n}: amounts must be in AED with at most 2 decimals.`); return; }
    if (debit < 0 || credit < 0) problems.push(`Line ${n}: amounts cannot be negative.`);
    if (debit > 0 && credit > 0) problems.push(`Line ${n}: enter either a debit or a credit, not both.`);
    if (debit === 0 && credit === 0) problems.push(`Line ${n}: enter an amount.`);
    const acc = accounts.get(l.accountId);
    if (acc && !acc.is_active) problems.push(`Line ${n}: account ${acc.code} is inactive.`);
    if (acc && acc.is_control && source === "manual") problems.push(`Line ${n}: ${acc.code} is a control account — it is posted by its own documents (or the opening journal), not by a manual journal.`);
    parsed.push({ account_id: l.accountId, debit, credit, description: l.description.trim() });
  });
  if (parsed.length < 2) problems.push("A journal needs at least two lines.");
  const t = lineTotals(parsed);
  if (problems.length === 0 && t.difference !== 0) problems.push("Debits and credits must be equal.");
  return { lines: parsed, totals: t, problems };
}

export type JournalAction = "edit" | "submit" | "withdraw" | "delete" | "approve" | "send_back" | "request_reversal" | "cancel_reversal";
/**
 * What the screens offer on a journal (maker-checker R1: the preparer never sees "Approve").
 * `perms` comes from my_permissions(); `hasPendingReversal` = a reversal request already waits.
 */
export function journalActions(j: Pick<Journal, "status" | "source" | "prepared_by">, me: string, perms: string[], hasPendingReversal = false): JournalAction[] {
  const can = (p: string) => perms.includes(p);
  const mine = j.prepared_by === me;
  const a: JournalAction[] = [];
  if (j.status === "draft" && can("prepare") && j.source !== "reversal") a.push("edit", "submit", "delete");
  if (j.status === "pending") {
    if (j.source === "reversal") {
      if (can("post_journal") && !mine) a.push("approve");
      if (can("post_journal")) a.push("cancel_reversal");
    } else {
      if (can("post_journal") && !mine) a.push("approve", "send_back");
      if (can("prepare")) a.push("edit");
      if (mine) a.push("withdraw");
    }
  }
  if (j.status === "posted" && j.source !== "reversal" && can("reverse_journal") && !hasPendingReversal) a.push("request_reversal");
  return a;
}

export const SOURCE_LABEL: Record<JournalSource, string> = {
  manual: "Manual", opening: "Opening balances", reversal: "Reversal", sale: "Sales", purchase: "Purchases",
  receipt: "Receipt", payment: "Payment", bank: "Bank", vat: "VAT", ct: "Corporate Tax",
};
export const STATUS_LABEL: Record<JournalStatus, string> = { draft: "Draft", pending: "Waiting for approval", posted: "Posted", reversed: "Reversed" };

// ── Data access ─────────────────────────────────────────────────────────────────────────

const JOURNAL_COLUMNS = "id, journal_no, entry_date, source, memo, status, reversal_of, prepared_by, approved_by, posted_at, created_at, preparer:profiles!journals_prepared_by_fkey(full_name), approver:profiles!journals_approved_by_fkey(full_name), journal_lines(id, line_no, account_id, debit, credit, description)";
type JournalQueryRow = { preparer: { full_name: string } | null; approver: { full_name: string } | null; journal_lines: JournalLine[] | null } & Omit<Journal, "preparer" | "approver" | "lines">;
const toJournal = (j: JournalQueryRow): Journal => ({
  ...j, preparer: j.preparer?.full_name ?? null, approver: j.approver?.full_name ?? null,
  lines: [...(j.journal_lines ?? [])].sort((a, b) => a.line_no - b.line_no),
});

export async function listJournals(orgId: string): Promise<Journal[]> {
  const r = await db().from("journals").select(JOURNAL_COLUMNS).eq("organization_id", orgId)
    .order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  ok(r);
  return ((r.data ?? []) as unknown as JournalQueryRow[]).map(toJournal);
}

/** One journal with its lines (drill-down from the general ledger). */
export async function getJournal(id: string): Promise<Journal | null> {
  const r = await db().from("journals").select(JOURNAL_COLUMNS).eq("id", id).maybeSingle();
  ok(r);
  return r.data ? toJournal(r.data as unknown as JournalQueryRow) : null;
}

export async function myPermissions(orgId: string): Promise<string[]> {
  const r = await db().rpc("my_permissions", { p_organization_id: orgId }); ok(r); return r.data ?? [];
}

export async function saveDraft(orgId: string, journalId: string | null, source: JournalSource, entryDate: string, memo: string,
  lines: { account_id: string; debit: Fils; credit: Fils; description: string }[]): Promise<string> {
  const r = await db().rpc("save_journal_draft", { p_journal_id: journalId as unknown as string /* null = new draft */, p_organization_id: orgId, p_entry_date: entryDate,
    p_memo: memo, p_source: source, p_lines: lines });
  ok(r); return r.data as string;
}

export const submitJournal = async (id: string) => ok(await db().from("journals").update({ status: "pending" }).eq("id", id));
export const withdrawJournal = async (id: string) => ok(await db().from("journals").update({ status: "draft" }).eq("id", id));
export const deleteDraft = async (id: string) => ok(await db().from("journals").delete().eq("id", id));
export async function approveJournal(id: string): Promise<string> { const r = await db().rpc("post_journal", { p_journal_id: id }); ok(r); return r.data as string; }
export const sendBack = async (id: string, reason: string) => ok(await db().rpc("reject_journal", { p_journal_id: id, p_reason: reason }));
export const requestReversal = async (id: string, reason: string, date: string) => ok(await db().rpc("reverse_journal", { p_journal_id: id, p_reason: reason, p_date: date }));
export const lockPeriod = async (id: string, reason: string) => ok(await db().rpc("lock_period", { p_period_id: id, p_reason: reason }));
export const reopenPeriod = async (id: string, reason: string) => ok(await db().rpc("reopen_period", { p_period_id: id, p_reason: reason }));

export async function addAccount(orgId: string, a: { code: string; name: string; type: Tables["accounts"]["Row"]["type"]; report_group: string; ct_tag: string | null }) {
  ok(await db().from("accounts").insert({ organization_id: orgId, code: a.code.trim(), name: a.name.trim(), type: a.type, report_group: a.report_group.trim() || null, ct_tag: a.ct_tag }));
}
export async function updateAccount(id: string, a: { name: string; report_group: string; ct_tag: string | null; is_active: boolean }) {
  ok(await db().from("accounts").update({ name: a.name.trim(), report_group: a.report_group.trim() || null, ct_tag: a.ct_tag, is_active: a.is_active }).eq("id", id));
}

/** Database messages are plain language for our own rules; anything else stays generic. */
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23505") {
    const m = err.message ?? "";
    if (m && !m.startsWith("duplicate key value")) return m;                       // our own message, e.g. BANK-01
    if (m.includes("purchase_bills_no_duplicates")) return "This supplier invoice number is already entered for this supplier (ARAP-06).";
    if (m.includes("attachments_organization_id_sha256")) return "This exact file is already attached to a document of this client.";
    if (m.includes("payment_allocations_once")) return "The same document is listed twice in this payment.";
    if (m.includes("accounts_organization_id_code")) return "That code is already used in this client's chart of accounts.";
    return "This already exists.";
  }
  if (err?.code === "22P02") return "An amount is not valid — use AED with at most 2 decimals.";
  if (["P0001", "P0002", "23514", "42501"].includes(err?.code ?? "") && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
