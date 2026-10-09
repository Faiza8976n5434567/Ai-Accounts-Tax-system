/** Bank accounts, statements, matching and reconciliation (P2-05 · D-38 → D-41). Everything is decided in the
 *  database; this file only reads and calls it. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";
import type { ColumnMapping, StatementRow } from "./bankImport";

type T = Database["public"]["Tables"];
export type BankAccount = T["bank_accounts"]["Row"];
export type BankStatement = T["bank_statements"]["Row"];
export type BankTxn = T["bank_transactions"]["Row"];
export type BankReconciliation = T["bank_reconciliations"]["Row"];
export type BookLine = Database["public"]["Views"]["bank_book_lines"]["Row"];
export interface RecItem { side: "bank" | "book"; id: string; item_date: string; description: string; amount: number }
export interface RecPreview { book_balance: number; statement_balance: number | null; unreconciled_bank: number; unreconciled_book: number; items: RecItem[]; reconciled_to: string | null }

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const listBankAccounts = async (orgId: string) => ok(await db().from("bank_accounts").select("*").eq("organization_id", orgId).order("name")) ?? [];
export const listStatements = async (bankAccountId: string) =>
  ok(await db().from("bank_statements").select("*").eq("bank_account_id", bankAccountId).order("created_at", { ascending: false })) ?? [];
export const listBankTxns = async (bankAccountId: string) =>
  ok(await db().from("bank_transactions").select("*").eq("bank_account_id", bankAccountId).order("txn_date", { ascending: false }).order("created_at")) ?? [];
export const listBookLines = async (bankAccountId: string) =>
  ok(await db().from("bank_book_lines").select("*").eq("bank_account_id", bankAccountId).order("entry_date", { ascending: false })) ?? [];
export const listReconciliations = async (bankAccountId: string) =>
  ok(await db().from("bank_reconciliations").select("*").eq("bank_account_id", bankAccountId).order("period_end", { ascending: false })) ?? [];

export async function saveBankAccount(orgId: string, id: string | null, doc: { name: string; bank_name: string; iban_last4: string; currency: string; account_id: string | null }) {
  return ok(await db().rpc("save_bank_account", { p_id: id as unknown as string, p_organization_id: orgId, p_doc: doc as never })) as string;
}
export async function saveMapping(bankAccountId: string, mapping: ColumnMapping) {
  ok(await db().rpc("save_bank_mapping", { p_bank_account_id: bankAccountId, p_mapping: mapping as never }));
}
export async function importStatement(bankAccountId: string, fileName: string, sha256: string, rows: StatementRow[]) {
  return ok(await db().rpc("import_bank_statement", { p_bank_account_id: bankAccountId, p_file_name: fileName, p_file_sha256: sha256, p_rows: rows as never })) as
    { lines: number; imported: number; duplicates: number };
}
export const autoMatch = async (bankAccountId: string) => ok(await db().rpc("auto_match_bank", { p_bank_account_id: bankAccountId })) as number;
export const matchTxn = async (txnId: string, lineId: string) => { ok(await db().rpc("match_bank_transaction", { p_txn_id: txnId, p_line_id: lineId })); };
export const unmatchTxn = async (txnId: string) => { ok(await db().rpc("unmatch_bank_transaction", { p_txn_id: txnId })); };
export const postBankLine = async (txnId: string, accountId: string, memo: string) =>
  ok(await db().rpc("post_bank_line", { p_txn_id: txnId, p_account_id: accountId, p_memo: memo })) as string;
export const linkPaymentToBankLine = async (paymentId: string, txnId: string) => { ok(await db().rpc("set_payment_bank_line", { p_payment_id: paymentId, p_txn_id: txnId })); };
export const reconciliationPreview = async (bankAccountId: string, end: string) =>
  ok(await db().rpc("bank_reconciliation_preview", { p_bank_account_id: bankAccountId, p_end: end })) as unknown as RecPreview;
export const saveReconciliation = async (bankAccountId: string, end: string, statementBalance: number) =>
  ok(await db().rpc("save_bank_reconciliation", { p_bank_account_id: bankAccountId, p_end: end, p_statement_balance: statementBalance })) as string;
export const approveReconciliation = async (id: string) => { ok(await db().rpc("approve_bank_reconciliation", { p_id: id })); };
export const deleteReconciliation = async (id: string) => { ok(await db().rpc("delete_bank_reconciliation", { p_id: id })); };

/** Unmatched ledger lines with the bank line's amount, closest date first — the choices offered by "Match…". */
export function matchCandidates(txn: Pick<BankTxn, "amount" | "txn_date">, book: BookLine[]): BookLine[] {
  const days = (d: string) => Math.abs(Date.parse(d) - Date.parse(txn.txn_date)) / 86_400_000;
  return book.filter((b) => !b.matched_txn && b.amount === txn.amount).sort((a, b) => days(a.entry_date!) - days(b.entry_date!));
}

/** The last day of the month before `today` (the usual reconciliation date). */
export function previousMonthEnd(today: string): string {
  const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, 0));
  return d.toISOString().slice(0, 10);
}
