/** Create / edit a manual or opening journal (P1-14). Checks run as you type; the database checks again. */
import { useMemo, useState } from "react";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { Modal } from "../components/ui";
import { fmt, fmtPlain } from "../lib/money";
import { checkDraft, friendlyDbError, saveDraft, submitJournal, type EditorLine, type Journal, type JournalSource } from "../lib/journals";
import type { Account } from "../lib/clients";
import { useToast } from "./toast";

const blankLine = (): EditorLine => ({ accountId: "", description: "", debit: "", credit: "" });
const filsText = (f: number) => (f ? fmtPlain(f) : "");

export function JournalEditor({ orgId, accounts, journal, source, defaultDate, onClose, onSaved }: {
  orgId: string; accounts: Account[]; journal: Journal | null; source: JournalSource; defaultDate: string;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(journal?.entry_date ?? defaultDate);
  const [memo, setMemo] = useState(journal?.memo ?? (source === "opening" ? "Opening balances" : ""));
  const [lines, setLines] = useState<EditorLine[]>(() => {
    const existing = journal?.lines.map((l) => ({ accountId: l.account_id, description: l.description ?? "", debit: filsText(l.debit), credit: filsText(l.credit) })) ?? [];
    return [...existing, ...Array.from({ length: Math.max(0, (source === "opening" ? 6 : 3) - existing.length) }, blankLine)];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const usable = accounts.filter((a) => a.is_active && (source === "opening" || !a.is_control));
  const check = checkDraft(lines, source, accountMap);
  const setLine = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const save = async (submit: boolean) => {
    setError(null);
    if (submit && check.problems.length) { setError(check.problems[0]); return; }
    if (!date) { setError("Enter the journal date."); return; }
    setBusy(true);
    try {
      const id = await saveDraft(orgId, journal?.id ?? null, source, date, memo, check.lines);
      if (submit) await submitJournal(id);
      toast(submit ? "Sent for approval — someone else must approve it" : "Draft saved");
      onSaved();
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open wide onClose={onClose} title={`${journal ? "Edit" : "New"} ${source === "opening" ? "opening balances journal" : "journal"}`}
      footer={<>
        <span className={`me-auto text-sm ${check.totals.difference === 0 ? "text-emerald-700" : "text-rose-700"}`}>
          Debits {fmt(check.totals.debit)} · Credits {fmt(check.totals.credit)}{check.totals.difference !== 0 && ` · Difference ${fmt(Math.abs(check.totals.difference))}`}
        </span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-ghost" disabled={busy} onClick={() => void save(false)}><Save size={15} />Save draft</button>
        <button className="btn-primary bg-emerald-600" disabled={busy || check.problems.length > 0} onClick={() => void save(true)}><Send size={15} />Submit for approval</button>
      </>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {source === "opening" && <p className="mb-3 text-sm text-slate-600">Enter the balances at the start of the books (from the last trial balance), dated the cut-off. Bank and VAT accounts are allowed here. Put customer and supplier balances on 3999 Opening balance clearing — then enter each unpaid invoice/bill under Opening balances (D-52). Totals must balance.</p>}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr] mb-4">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Date</span>
          <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Description</span>
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this journal for?" /></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
        <thead><tr><th className="th w-[34%]">Account</th><th className="th">Line description</th><th className="th text-end w-32">Debit (AED)</th><th className="th text-end w-32">Credit (AED)</th><th className="th w-10"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={i}>
            <td className="td"><select aria-label={`Line ${i + 1} account`} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white" value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
              <option value="">Choose account…</option>
              {usable.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select></td>
            <td className="td"><input aria-label={`Line ${i + 1} description`} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} debit`} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-end num" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} credit`} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-end num" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} /></td>
            <td className="td"><button aria-label={`Remove line ${i + 1}`} className="text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => setLines((ls) => ls.length > 2 ? ls.filter((_, k) => k !== i) : ls)}><Trash2 size={15} /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="btn-ghost mt-3 !py-1.5" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus size={14} />Add line</button>
      {check.problems.length > 0 && <ul className="mt-3 text-xs text-slate-500 list-disc ps-5">{check.problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul>}
    </Modal>
  );
}
