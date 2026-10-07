/** Trial balance → general ledger → journal, all live from the database (P1-15 · Principle 10 drill-down). */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Scale, ScrollText } from "lucide-react";
import { Badge, Card } from "../components/ui";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import type { Account } from "../lib/clients";
import { drCr, fyStart, generalLedger, tbTotals, trialBalance, type GlRow, type TbRow } from "../lib/live-reports";
import { getJournal, SOURCE_LABEL, type Journal } from "../lib/journals";
import { JournalView } from "./JournalsTab";
import { useLoad, useToday } from "./hooks";

const money = (f: number) => (f ? fmt(f) : "");

export function ReportsTab({ orgId, accounts, fyStartMonth }: { orgId: string; accounts: Account[]; fyStartMonth: number }) {
  const today = useToday();
  const [from, setFrom] = useState(fyStart(today, fyStartMonth));
  const [to, setTo] = useState(today);
  const [ledgerAccount, setLedgerAccount] = useState<string | null>(null);
  const fetchTb = useCallback((): Promise<TbRow[] | null> => (from && to && from <= to ? trialBalance(orgId, from, to) : Promise.resolve(null)), [orgId, from, to]);
  const { data, error: loadError } = useLoad(fetchTb);
  const rows = data ?? null;
  const error = loadError ? "Could not load the trial balance." : null;
  const totals = useMemo(() => tbTotals(rows ?? []), [rows]);

  const range = (
    <div className="flex flex-wrap items-end gap-3">
      <label><span className="block text-xs font-medium text-slate-600 mb-1">From</span><input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label><span className="block text-xs font-medium text-slate-600 mb-1">To</span><input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
  );

  if (ledgerAccount) return <LedgerView orgId={orgId} accounts={accounts} accountId={ledgerAccount} from={from} to={to} range={range} onBack={() => setLedgerAccount(null)} onPick={setLedgerAccount} />;

  return (
    <Card title="Trial balance" icon={<Scale size={16} />} pad={false} actions={range}
      sub="Posted journals only, calculated by the database each time. Click an account to see every posting behind its figures.">
      {error && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">{error}</p>}
      {from > to && <p className="px-5 pb-3 text-sm text-rose-700">“From” must be on or before “To”.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
        <thead>
          <tr><th className="th" rowSpan={2}>Account</th><th className="th text-center" colSpan={2}>Opening {shortDate(from)}</th><th className="th text-center" colSpan={2}>Movement</th><th className="th text-center" colSpan={2}>Closing {shortDate(to)}</th></tr>
          <tr><th className="th text-end">Debit</th><th className="th text-end">Credit</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th></tr>
        </thead>
        <tbody>
          {rows === null && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
          {rows?.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No posted journals up to {shortDate(to)}.</td></tr>}
          {rows?.map((r) => {
            const o = drCr(r.opening), c = drCr(r.closing);
            return (
              <tr key={r.account_id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setLedgerAccount(r.account_id)}>
                <td className="td"><span className="font-mono text-xs text-slate-500 me-2">{r.code}</span>{r.name}</td>
                <td className="td text-end num">{money(o.dr)}</td><td className="td text-end num">{money(o.cr)}</td>
                <td className="td text-end num">{money(r.debit)}</td><td className="td text-end num">{money(r.credit)}</td>
                <td className="td text-end num font-medium">{money(c.dr)}</td><td className="td text-end num font-medium">{money(c.cr)}</td>
              </tr>
            );
          })}
          {rows && rows.length > 0 && (
            <tr className="font-semibold bg-slate-50">
              <td className="td">Total {totals.balanced ? <Badge tone="emerald" dot className="ms-2">Balanced</Badge> : <Badge tone="rose" dot className="ms-2">Out of balance</Badge>}</td>
              <td className="td text-end num">{fmt(totals.openingDr)}</td><td className="td text-end num">{fmt(totals.openingCr)}</td>
              <td className="td text-end num">{fmt(totals.debit)}</td><td className="td text-end num">{fmt(totals.credit)}</td>
              <td className="td text-end num">{fmt(totals.closingDr)}</td><td className="td text-end num">{fmt(totals.closingCr)}</td>
            </tr>
          )}
        </tbody>
      </table></div>
      <p className="px-5 py-3 text-xs text-slate-500">Year-end closing is not built yet (Phase 5): income and expense balances from earlier years still show in their own accounts.</p>
    </Card>
  );
}

function LedgerView({ orgId, accounts, accountId, from, to, range, onBack, onPick }: {
  orgId: string; accounts: Account[]; accountId: string; from: string; to: string; range: ReactNode; onBack: () => void; onPick: (id: string) => void;
}) {
  const [rows, setRows] = useState<GlRow[] | null>(null);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === accountId);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`])), [accounts]);

  useEffect(() => {
    if (from > to) return;
    let live = true;
    generalLedger(orgId, accountId, from, to).then((r) => { if (live) { setRows(r); setError(null); } }).catch(() => { if (live) setError("Could not load the ledger."); });
    return () => { live = false; };
  }, [orgId, accountId, from, to]);

  const balance = (b: number) => { const { dr, cr } = drCr(b); return dr ? `${fmt(dr)} Dr` : cr ? `${fmt(cr)} Cr` : "0.00"; };

  return (
    <>
      <Card title={`General ledger — ${account ? `${account.code} · ${account.name}` : ""}`} icon={<ScrollText size={16} />} pad={false}
        actions={<div className="flex flex-wrap items-end gap-3">
          <button className="btn-ghost" onClick={onBack}><ArrowLeft size={15} />Trial balance</button>
          <label><span className="block text-xs font-medium text-slate-600 mb-1">Account</span>
            <select className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm bg-white max-w-64" value={accountId} onChange={(e) => onPick(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select></label>
          {range}
        </div>}
        sub="Every posting to this account with a running balance. Click a line to open its journal.">
        {error && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">{error}</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Date</th><th className="th">Journal</th><th className="th">Type</th><th className="th">Description</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th><th className="th text-end">Balance</th></tr></thead>
          <tbody>
            {rows === null && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {rows?.map((r, i) => r.row_kind === "opening" ? (
              <tr key="bf" className="bg-slate-50"><td className="td">{shortDate(r.entry_date)}</td><td className="td" colSpan={5}>Balance brought forward</td><td className="td text-end num font-medium">{balance(r.balance)}</td></tr>
            ) : (
              <tr key={i} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => r.journal_id && void getJournal(r.journal_id).then(setJournal)}>
                <td className="td">{shortDate(r.entry_date)}</td>
                <td className="td font-mono text-xs text-emerald-700 underline decoration-dotted">{r.journal_no}</td>
                <td className="td">{r.source ? SOURCE_LABEL[r.source] : ""}</td>
                <td className="td max-w-xs truncate">{r.description ?? r.memo}</td>
                <td className="td text-end num">{money(r.debit ?? 0)}</td><td className="td text-end num">{money(r.credit ?? 0)}</td>
                <td className="td text-end num font-medium">{balance(r.balance)}</td>
              </tr>
            ))}
            {rows && rows.length === 1 && <tr><td className="td text-slate-500" colSpan={7}>No postings in this range.</td></tr>}
          </tbody>
        </table></div>
      </Card>
      {journal && <JournalView journal={journal} accountName={accountName} actions={[]} onClose={() => setJournal(null)} onAction={async () => {}} />}
    </>
  );
}
