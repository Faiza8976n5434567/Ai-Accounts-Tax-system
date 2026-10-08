/** Bank accounts, statement upload with column mapping, matching, bank-line postings and month-end
 *  reconciliation (P2-05 · D-38 → D-41 · BANK-01 → 03). */
import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Link2, Plus, Scale, Send, Trash2, Unlink, Upload, Wand2 } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt, fmtPlain, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { listContacts } from "../lib/contacts";
import type { Account, Client } from "../lib/clients";
import { sha256Hex } from "../lib/bills";
import { guessMapping, mapStatement, readStatementFile, type ColumnMapping, type DateFormat } from "../lib/bankImport";
import {
  approveReconciliation, autoMatch, deleteReconciliation, importStatement, linkPaymentToBankLine, listBankAccounts, listBankTxns, listBookLines,
  listReconciliations, listStatements, matchCandidates, matchTxn, postBankLine, previousMonthEnd, reconciliationPreview, saveBankAccount,
  saveMapping, saveReconciliation, unmatchTxn, type BankAccount, type BankTxn, type BookLine, type RecPreview,
} from "../lib/bank";
import { KIND, savePayment, submitPayment, type PaymentKind } from "../lib/payments";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

type View = "lines" | "reconcile" | "statements";
const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function BankTab({ client, accounts, perms }: { client: Client; accounts: Account[]; perms: string[] }) {
  const toast = useToast();
  const fetchAccounts = useCallback(() => listBankAccounts(client.id), [client.id]);
  const { data: banks, reload: reloadBanks } = useLoad(fetchAccounts);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const bank = banks?.find((b) => b.id === chosen) ?? banks?.[0] ?? null;
  const canSetup = perms.includes("manage_coa");

  if (!banks) return <Card><p className="text-sm text-slate-500">Loading…</p></Card>;
  return (
    <>
      {banks.length === 0 ? (
        <Card title="Bank" icon={<Scale size={16} />}>
          <p className="text-sm text-slate-600">No bank account is set up for this client yet. A bank account links a ledger account (e.g. 1010) to the bank's statements.</p>
          {canSetup ? <button className="btn-primary bg-emerald-600 mt-4" onClick={() => setAdding(true)}><Plus size={15} />Set up bank account</button>
            : <p className="mt-2 text-xs text-slate-500">A Firm Admin sets up bank accounts.</p>}
        </Card>
      ) : bank && <BankAccountView key={bank.id} client={client} bank={bank} banks={banks} accounts={accounts} perms={perms}
        onChoose={setChosen} onAdd={canSetup ? () => setAdding(true) : undefined} onBankChanged={reloadBanks} />}
      {adding && <AddBankAccount orgId={client.id} accounts={accounts} banks={banks} onClose={() => setAdding(false)}
        onSaved={(id) => { setAdding(false); reloadBanks(); setChosen(id); toast("Bank account set up"); }} />}
    </>
  );
}

function BankAccountView({ client, bank, banks, accounts, perms, onChoose, onAdd, onBankChanged }: {
  client: Client; bank: BankAccount; banks: BankAccount[]; accounts: Account[]; perms: string[];
  onChoose: (id: string) => void; onAdd?: () => void; onBankChanged: () => void;
}) {
  const toast = useToast();
  const fetchTxns = useCallback(() => listBankTxns(bank.id), [bank.id]);
  const fetchBook = useCallback(() => listBookLines(bank.id), [bank.id]);
  const fetchStatements = useCallback(() => listStatements(bank.id), [bank.id]);
  const { data: txns, reload: reloadTxns } = useLoad(fetchTxns);
  const { data: book, reload: reloadBook } = useLoad(fetchBook);
  const { data: statements, reload: reloadStatements } = useLoad(fetchStatements);
  const [view, setView] = useState<View>("lines");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [action, setAction] = useState<{ kind: "match" | "post" | "pay"; txn: BankTxn } | null>(null);
  const canPrepare = perms.includes("prepare");
  const refresh = () => { reloadTxns(); reloadBook(); reloadStatements(); };
  const glName = accounts.find((a) => a.id === bank.account_id);
  const unmatched = (txns ?? []).filter((t) => t.status === "unmatched").length;
  const shown = (txns ?? []).filter((t) => !onlyOpen || t.status === "unmatched");
  const lineOf = new Map((book ?? []).map((b) => [b.line_id, b]));

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); refresh(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };

  return (
    <>
      <Card title="Bank" icon={<Scale size={16} />} pad={false}
        sub={`${glName ? `${glName.code} · ${glName.name}` : ""}${bank.bank_name ? ` · ${bank.bank_name}` : ""}${bank.iban_last4 ? ` · ••${bank.iban_last4}` : ""} · ${bank.currency}`}
        actions={<div className="flex flex-wrap gap-2">
          {banks.length > 1 && <select aria-label="Bank account" className={`${cls} !w-auto`} value={bank.id} onChange={(e) => onChoose(e.target.value)}>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          {onAdd && <button className="btn-ghost" onClick={onAdd}><Plus size={15} />Bank account</button>}
          {canPrepare && <button className="btn-ghost" onClick={() => run(async () => toast(`${await autoMatch(bank.id)} line(s) matched`), "Auto-match finished")}><Wand2 size={15} />Auto-match</button>}
          {canPrepare && <button className="btn-primary bg-emerald-600" onClick={() => setUploading(true)}><Upload size={15} />Upload statement</button>}
        </div>}>
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {([["lines", `Statement lines${unmatched ? ` (${unmatched} to match)` : ""}`], ["reconcile", "Reconcile"], ["statements", "Uploaded statements"]] as [View, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${view === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{l}</button>
          ))}
        </div>

        {view === "lines" && <>
          <label className="px-5 pb-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />Only lines still to match</label>
          <div className="overflow-x-auto"><table className="w-full min-w-[860px]">
            <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th text-end">Money in</th><th className="th text-end">Money out</th><th className="th">In the books</th><th className="th w-[260px]"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {!txns && <tr><td className="td text-slate-500" colSpan={6}>Loading…</td></tr>}
              {txns && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>{txns.length === 0 ? "No statement uploaded yet." : "Every line is matched."}</td></tr>}
              {shown.map((t) => {
                const l = t.journal_line_id ? lineOf.get(t.journal_line_id) : undefined;
                return (
                  <tr key={t.id}>
                    <td className="td whitespace-nowrap">{shortDate(t.txn_date)}</td>
                    <td className="td text-sm">{t.description}{t.reference && <span className="block text-xs text-slate-500">{t.reference}</span>}</td>
                    <td className="td text-end num">{t.amount > 0 ? fmt(t.amount) : ""}</td>
                    <td className="td text-end num">{t.amount < 0 ? fmt(-t.amount) : ""}</td>
                    <td className="td text-xs">{t.status === "matched" ? <Badge tone="emerald" dot>{l?.journal_no ?? "Matched"}</Badge> : <Badge tone="amber" dot>Not matched</Badge>}</td>
                    <td className="td text-end whitespace-nowrap">{canPrepare && (t.status === "matched"
                      ? <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => run(() => unmatchTxn(t.id), "Unmatched")}><Unlink size={13} />Unmatch</button>
                      : <span className="inline-flex gap-1">
                          <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setAction({ kind: "match", txn: t })}><Link2 size={13} />Match…</button>
                          <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setAction({ kind: "pay", txn: t })}>{t.amount > 0 ? "Receipt…" : "Payment…"}</button>
                          <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setAction({ kind: "post", txn: t })}>Other…</button>
                        </span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </>}

        {view === "reconcile" && <ReconcileView bank={bank} perms={perms} onChanged={refresh} />}

        {view === "statements" && <div className="overflow-x-auto"><table className="w-full min-w-[700px]">
          <thead><tr><th className="th">File</th><th className="th">Period</th><th className="th text-end">Lines</th><th className="th text-end">Imported</th><th className="th text-end">Already there</th><th className="th">Uploaded</th></tr></thead>
          <tbody>
            {statements && statements.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No statements uploaded yet.</td></tr>}
            {(statements ?? []).map((s) => (
              <tr key={s.id}><td className="td">{s.file_name}</td><td className="td">{s.period_start ? `${shortDate(s.period_start)} – ${shortDate(s.period_end!)}` : ""}</td>
                <td className="td text-end num">{s.line_count}</td><td className="td text-end num">{s.imported_count}</td><td className="td text-end num">{s.duplicate_count}</td><td className="td">{shortDate(s.created_at.slice(0, 10))}</td></tr>
            ))}
          </tbody>
        </table></div>}
      </Card>

      {uploading && <UploadStatement bank={bank} onClose={() => setUploading(false)} onDone={(msg) => { setUploading(false); toast(msg); refresh(); onBankChanged(); }} />}
      {action?.kind === "match" && book && <MatchLine txn={action.txn} book={book} onClose={() => setAction(null)}
        onMatch={(lineId) => { const id = action.txn.id; setAction(null); void run(() => matchTxn(id, lineId), "Matched"); }} />}
      {action?.kind === "post" && <PostToAccount txn={action.txn} bank={bank} accounts={accounts} onClose={() => setAction(null)}
        onDone={() => { setAction(null); toast("Sent for approval — it is matched once a second person approves it (Approvals)"); refresh(); }} />}
      {action?.kind === "pay" && <PaymentFromLine client={client} txn={action.txn} bank={bank} onClose={() => setAction(null)}
        onDone={() => { setAction(null); toast("Sent for approval — it is matched to this bank line once approved"); refresh(); }} />}
    </>
  );
}

// ── Set up a bank account ───────────────────────────────────────────────────────────────
function AddBankAccount({ orgId, accounts, banks, onClose, onSaved }: { orgId: string; accounts: Account[]; banks: BankAccount[]; onClose: () => void; onSaved: (id: string) => void }) {
  const free = accounts.filter((a) => (a.subtype === "bank" || a.subtype === "cash") && a.is_active && !banks.some((b) => b.account_id === a.id));
  const [f, setF] = useState({ name: "", bank_name: "", iban_last4: "", currency: "AED", account_id: free[0]?.id ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setError(null);
    if (!f.name.trim()) { setError("Enter a name, e.g. Current account."); return; }
    if (f.iban_last4 && !/^\d{4}$/.test(f.iban_last4)) { setError("Enter only the last 4 digits of the IBAN."); return; }
    setBusy(true);
    try { onSaved(await saveBankAccount(orgId, null, { ...f, account_id: f.account_id || null })); } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Set up bank account"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Name</span><input aria-label="Name" className={cls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Current account" /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Bank</span><input aria-label="Bank" className={cls} value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Emirates NBD" /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">IBAN — last 4 digits only</span><input aria-label="IBAN last 4" className={cls} inputMode="numeric" maxLength={4} value={f.iban_last4} onChange={(e) => set("iban_last4", e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Currency</span><select aria-label="Currency" className={cls} value={f.currency} onChange={(e) => set("currency", e.target.value)}><option>AED</option><option>USD</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Ledger account</span>
          <select aria-label="Ledger account" className={cls} value={f.account_id} onChange={(e) => set("account_id", e.target.value)}>
            {free.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}<option value="">Create a new bank account (1011–1099)</option></select></label>
      </div>
    </Modal>
  );
}

// ── Upload with column mapping (D-38) ───────────────────────────────────────────────────
function UploadStatement({ bank, onClose, onDone }: { bank: BankAccount; onClose: () => void; onDone: (msg: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setFile(f);
    try {
      const r = await readStatementFile(f);
      setRows(r);
      const saved = bank.column_mapping as ColumnMapping | null;
      const headerOk = saved && (r[saved.header_row] ?? []).includes(saved.date);
      setMapping(headerOk ? saved : guessMapping(r));
    } catch { setError("This file could not be read. Use the bank's CSV or Excel (.xlsx) export."); }
  };
  const result = useMemo(() => (rows && mapping ? mapStatement(rows, mapping) : null), [rows, mapping]);
  const header = rows && mapping ? (rows[mapping.header_row] ?? []).filter((c) => c.trim()) : [];
  const set = (k: keyof ColumnMapping, v: string | number | undefined) => setMapping((m) => (m ? { ...m, [k]: v === "" ? undefined : v } : m));
  const mode = mapping?.amount !== undefined ? "amount" : "inout";

  const go = async () => {
    if (!file || !rows || !mapping || !result || result.errors.length || result.rows.length === 0) return;
    setBusy(true); setError(null);
    try {
      await saveMapping(bank.id, mapping);
      const r = await importStatement(bank.id, file.name, await sha256Hex(await file.arrayBuffer()), result.rows);
      onDone(`${r.imported} new line(s) imported${r.duplicates ? `, ${r.duplicates} already there (skipped)` : ""}`);
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };
  const sel = (label: string, k: "date" | "description" | "reference" | "amount" | "in" | "out" | "balance", optional = false) => (
    <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <select aria-label={label} className={cls} value={(mapping?.[k] as string | undefined) ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{optional ? "— none —" : "Choose…"}</option>{header.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
  );
  return (
    <Modal open wide onClose={onClose} title="Upload bank statement"
      footer={<><span className="me-auto text-sm text-slate-700">{result && !result.errors.length && `${result.rows.length} line(s) ready${result.skipped ? ` · ${result.skipped} title/balance row(s) skipped` : ""}`}</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={busy || !result || result.errors.length > 0 || result.rows.length === 0} onClick={() => void go()}><Upload size={15} />{busy ? "Importing…" : "Import"}</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <label className="block mb-4"><span className="block text-xs font-medium text-slate-600 mb-1.5">The bank's CSV or Excel statement for {bank.name}</span>
        <input aria-label="Statement file" type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => void pick(e.target.files?.[0])} /></label>
      {rows && mapping && <>
        <p className="text-xs text-slate-500 mb-2">{bank.column_mapping ? "Using the columns remembered for this account — change them if the bank's layout changed." : "First upload for this account: check the columns once; they are remembered for next time (D-38)."}</p>
        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Row with the column titles</span>
            <select aria-label="Title row" className={cls} value={mapping.header_row} onChange={(e) => set("header_row", Number(e.target.value))}>
              {rows.slice(0, 30).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(" | ").slice(0, 60)}</option>)}</select></label>
          {sel("Date column", "date")}
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Date format</span>
            <select aria-label="Date format" className={cls} value={mapping.date_format} onChange={(e) => set("date_format", e.target.value as DateFormat)}>
              <option value="dd/mm/yyyy">31/10/2026 (day first)</option><option value="dd-mmm-yyyy">31-Oct-2026</option><option value="yyyy-mm-dd">2026-10-31</option><option value="mm/dd/yyyy">10/31/2026 (month first)</option></select></label>
          {sel("Description column", "description")}
          {sel("Reference column", "reference", true)}
          {sel("Balance column", "balance", true)}
          <label className="sm:col-span-3 flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5"><input type="radio" checked={mode === "inout"} onChange={() => setMapping((m) => m && { ...m, amount: undefined, in: m.in ?? "", out: m.out ?? "" })} />Separate money-in and money-out columns</span>
            <span className="flex items-center gap-1.5"><input type="radio" checked={mode === "amount"} onChange={() => setMapping((m) => m && { ...m, amount: m.amount ?? "", in: undefined, out: undefined })} />One amount column (minus = money out)</span>
          </label>
          {mode === "inout" ? <>{sel("Money in (credit) column", "in")}{sel("Money out (debit) column", "out")}</> : sel("Amount column", "amount")}
        </div>
        {result && result.errors.length > 0 && <ul className="mb-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 text-rose-800 px-4 py-2 text-xs list-disc ps-8">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {result && result.rows.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
          <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th text-end">Amount</th><th className="th text-end">Balance</th></tr></thead>
          <tbody>{result.rows.slice(0, 8).map((r, i) => (
            <tr key={i}><td className="td">{shortDate(r.date)}</td><td className="td text-xs">{r.description}</td><td className={`td text-end num ${r.amount < 0 ? "text-rose-700" : ""}`}>{fmt(r.amount)}</td><td className="td text-end num">{r.balance === null ? "" : fmt(r.balance)}</td></tr>
          ))}</tbody>
        </table>{result.rows.length > 8 && <p className="px-3 py-1 text-xs text-slate-500">… and {result.rows.length - 8} more</p>}</div>}
        <p className="mt-2 text-xs text-slate-500">Lines already imported (overlapping statements) are skipped automatically; the same file twice is refused (BANK-01).</p>
      </>}
    </Modal>
  );
}

// ── Match a line to the books ───────────────────────────────────────────────────────────
function MatchLine({ txn, book, onClose, onMatch }: { txn: BankTxn; book: BookLine[]; onClose: () => void; onMatch: (lineId: string) => void }) {
  const choices = matchCandidates(txn, book);
  return (
    <Modal open wide onClose={onClose} title={`Match ${fmt(txn.amount)} on ${shortDate(txn.txn_date)}`}
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <p className="text-sm text-slate-600 mb-3">{txn.description}</p>
      {choices.length === 0 ? <p className="text-sm text-slate-500">No unmatched entry in the books has exactly this amount. Record it as a receipt/payment, or post it to an account.</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
          <thead><tr><th className="th">Date</th><th className="th">Journal</th><th className="th">Description</th><th className="th text-end">Amount</th><th className="th"><span className="sr-only">Match</span></th></tr></thead>
          <tbody>{choices.map((b) => (
            <tr key={b.line_id}><td className="td">{shortDate(b.entry_date!)}</td><td className="td font-mono text-xs">{b.journal_no}</td><td className="td text-xs">{b.description ?? b.memo}</td>
              <td className="td text-end num">{fmt(b.amount!)}</td><td className="td text-end"><button className="btn-primary bg-emerald-600 !py-1 !px-2 text-xs" onClick={() => onMatch(b.line_id!)}><Link2 size={13} />Match</button></td></tr>
          ))}</tbody>
        </table></div>}
    </Modal>
  );
}

// ── D-39: post a line to an account (no VAT) ────────────────────────────────────────────
function PostToAccount({ txn, bank, accounts, onClose, onDone }: { txn: BankTxn; bank: BankAccount; accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const choices = accounts.filter((a) => a.is_active && a.id !== bank.account_id && (!a.is_control || a.subtype === "bank" || a.subtype === "cash"));
  const [accountId, setAccountId] = useState("");
  const [memo, setMemo] = useState(txn.description);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!accountId) { setError("Choose the account."); return; }
    try { await postBankLine(txn.id, accountId, memo); onDone(); } catch (e) { setError(friendlyDbError(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`Post ${fmt(txn.amount)} to an account`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" onClick={() => void save()}><Send size={15} />Send for approval</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">{shortDate(txn.txn_date)} · {txn.description}</p>
      <label className="block mb-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Account</span>
        <select aria-label="Account" className={cls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose…</option>{choices.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
      <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1.5">Description</span><input aria-label="Description" className={cls} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <p className="mt-3 text-xs text-slate-500">No VAT is claimed from a bank line (D-39). If this payment has a tax invoice with VAT (e.g. the bank's monthly VAT invoice), enter it as a purchase bill instead. Customers and suppliers go through Receipt…/Payment….</p>
    </Modal>
  );
}

// ── A receipt / payment from a bank line ────────────────────────────────────────────────
function PaymentFromLine({ client, txn, bank, onClose, onDone }: { client: Client; txn: BankTxn; bank: BankAccount; onClose: () => void; onDone: () => void }) {
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data: contacts } = useLoad(fetchContacts);
  const kinds: PaymentKind[] = txn.amount > 0 ? ["customer_receipt", "supplier_refund"] : ["supplier_payment", "customer_refund"];
  const [kind, setKind] = useState<PaymentKind>(kinds[0]);
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const k = KIND[kind];
  const people = (contacts ?? []).filter((c) => c.is_active && (k.customer ? c.kind !== "supplier" : c.kind !== "customer"));
  const save = async () => {
    if (!contactId) { setError(`Choose the ${k.customer ? "customer" : "supplier"}.`); return; }
    setBusy(true); setError(null);
    try {
      const id = await savePayment(client.id, null, { kind, contact_id: contactId, bank_account_id: bank.account_id, payment_date: txn.txn_date,
        currency: bank.currency as "AED" | "USD", amount: Math.abs(txn.amount), bank_charges: 0, reference: (txn.reference ?? txn.description).slice(0, 80), notes: "", allocations: null });
      await linkPaymentToBankLine(id, txn.id);
      await submitPayment(id);
      onDone();
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${k.label} from the bank`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}><Send size={15} />Send for approval</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">{shortDate(txn.txn_date)} · {txn.description} · <b>{bank.currency} {fmt(Math.abs(txn.amount))}</b></p>
      <div className="grid gap-3">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Type</span>
          <select aria-label="Type" className={cls} value={kind} onChange={(e) => { setKind(e.target.value as PaymentKind); setContactId(""); }}>{kinds.map((x) => <option key={x} value={x}>{KIND[x].label}</option>)}</select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{k.customer ? "Customer" : "Supplier"}</span>
          <select aria-label="Contact" className={cls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Choose…</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <p className="mt-3 text-xs text-slate-500">{k.refund ? "Uses the oldest credits first." : `Settles the oldest open ${k.customer ? "invoices" : "bills"} first; anything left becomes a ${k.customer ? "Customer Credit" : "Supplier advance"}. To choose documents or add bank charges, use Receipts & payments instead.`}</p>
    </Modal>
  );
}

// ── Reconciliation (D-41 · BANK-03) ─────────────────────────────────────────────────────
function ReconcileView({ bank, perms, onChanged }: { bank: BankAccount; perms: string[]; onChanged: () => void }) {
  const auth = useAuth()!;
  const toast = useToast();
  const today = useToday();
  const [end, setEnd] = useState(previousMonthEnd(today));
  const [typed, setTyped] = useState<string | null>(null);            // null = the balance from the statement file
  const fetchRecs = useCallback(() => listReconciliations(bank.id), [bank.id]);
  const { data: recs, reload: reloadRecs } = useLoad(fetchRecs);
  const fetchPreview = useCallback(() => reconciliationPreview(bank.id, end), [bank.id, end]);
  const { data: preview, reload: reloadPreview } = useLoad<RecPreview>(fetchPreview);
  const stmt = typed ?? (preview?.statement_balance == null ? "" : fmtPlain(preview.statement_balance));
  const setStmt = setTyped;
  const stmtFils = parseAedToFils(stmt || "0");
  const calc = preview ? preview.book_balance + preview.unreconciled_bank - preview.unreconciled_book : 0;
  const diff = stmtFils === null ? null : stmtFils - calc;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); reloadRecs(); reloadPreview(); onChanged(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };

  return (
    <div className="px-5 pb-5">
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Reconcile up to</span><input aria-label="Reconcile up to" type="date" className={cls} value={end} onChange={(e) => { setEnd(e.target.value); setTyped(null); }} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Statement balance on that date</span>
          <input aria-label="Statement balance" inputMode="decimal" className={`${cls} text-end`} value={stmt} onChange={(e) => setStmt(e.target.value)} /></label>
        {preview?.reconciled_to && <p className="text-xs text-emerald-700 self-end pb-2">Reconciled and approved to {shortDate(preview.reconciled_to)}</p>}
      </div>
      {preview && <>
        <table className="w-full max-w-lg text-sm mb-4"><tbody>
          <tr><td className="py-1">Balance in the books</td><td className="py-1 text-end num">{fmt(preview.book_balance)}</td></tr>
          <tr><td className="py-1">+ On the statement, not yet in the books</td><td className="py-1 text-end num">{fmt(preview.unreconciled_bank)}</td></tr>
          <tr><td className="py-1">− In the books, not yet on the statement</td><td className="py-1 text-end num">{fmt(preview.unreconciled_book)}</td></tr>
          <tr className="font-semibold border-t border-slate-200"><td className="py-1">= Expected statement balance</td><td className="py-1 text-end num">{fmt(calc)}</td></tr>
          <tr className={diff === 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}><td className="py-1">Difference</td><td className="py-1 text-end num">{diff === null ? "—" : fmt(diff)}</td></tr>
        </tbody></table>
        {preview.items.length > 0 && <div className="overflow-x-auto mb-4"><table className="w-full min-w-[560px]">
          <thead><tr><th className="th">Reconciling item</th><th className="th">Date</th><th className="th">Description</th><th className="th text-end">Amount</th></tr></thead>
          <tbody>{preview.items.map((i) => (
            <tr key={i.side + i.id}><td className="td text-xs">{i.side === "bank" ? "On statement only" : "In books only"}</td><td className="td">{shortDate(i.item_date)}</td><td className="td text-xs">{i.description}</td><td className="td text-end num">{fmt(i.amount)}</td></tr>
          ))}</tbody>
        </table></div>}
        {perms.includes("prepare") && <button className="btn-primary bg-emerald-600" disabled={diff !== 0 || stmtFils === null}
          onClick={() => run(() => saveReconciliation(bank.id, end, stmtFils!), "Reconciliation saved — a second person approves it")}><CheckCircle2 size={15} />Save reconciliation</button>}
        {diff !== 0 && <p className="mt-2 text-xs text-slate-500">Match the remaining lines, record missing receipts/payments, or check the statement balance until the difference is zero.</p>}
      </>}

      <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Saved reconciliations</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px]">
        <thead><tr><th className="th">Up to</th><th className="th text-end">Statement</th><th className="th text-end">Books</th><th className="th">Status</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {recs && recs.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>None yet.</td></tr>}
          {(recs ?? []).map((r) => (
            <tr key={r.id}><td className="td">{shortDate(r.period_end)}</td><td className="td text-end num">{fmt(r.statement_balance)}</td><td className="td text-end num">{fmt(r.book_balance)}</td>
              <td className="td">{r.status === "posted" ? <Badge tone="emerald" dot>Approved</Badge> : <Badge tone="amber" dot>Waiting for approval</Badge>}</td>
              <td className="td text-end whitespace-nowrap">{r.status === "pending" && <span className="inline-flex gap-1">
                {perms.includes("approve_document") && r.prepared_by !== auth.userId && <button className="btn-primary bg-emerald-600 !py-1 !px-2 text-xs" onClick={() => run(() => approveReconciliation(r.id), "Reconciliation approved and frozen")}><CheckCircle2 size={13} />Approve</button>}
                {perms.includes("prepare") && <button className="btn-danger !py-1 !px-2 text-xs" onClick={() => run(() => deleteReconciliation(r.id), "Deleted")}><Trash2 size={13} />Delete</button>}
              </span>}</td></tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
