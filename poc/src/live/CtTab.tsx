/** Corporate Tax return for one client (P5-01 · F-08 → F-11, D-66, D-67): the computation from the posted books with
 *  drill-down, automatic add-backs, manual adjustments with legal references, approval by someone else (frozen) → filed. */
import { useCallback, useState } from "react";
import { Calculator, CheckCircle2, FileCheck2, FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import type { Client, TaxPeriod } from "../lib/clients";
import { downloadXlsx, xlsxRow, type Cell } from "../lib/financial";
import { addCtAdjustment, approveCtReturn, CT_STATUS_LABEL, ctLines, ctPreview, deleteCtAdjustment, fileCtReturn, startCtReturn, type CtComputation } from "../lib/live-ct";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const REGIME: Record<string, string> = { standard: "Standard", sbr: "Small Business Relief elected", qfzp: "Qualifying Free Zone Person" };

export function CtTab({ client, taxPeriods, perms }: { client: Client; taxPeriods: TaxPeriod[]; perms: string[] }) {
  const today = useToday();
  const periods = taxPeriods.filter((t) => t.kind === "ct").sort((a, b) => b.start_date.localeCompare(a.start_date));
  // The year to work on: the oldest ended year whose return is not yet due, else the current one.
  const due = [...periods].reverse().find((p) => p.end_date < today && p.due_date >= today);
  const current = periods.find((p) => p.start_date <= today) ?? periods[periods.length - 1];
  const [periodId, setPeriodId] = useState<string | null>(null);
  const chosen = periods.find((p) => p.id === periodId) ?? due ?? current;
  if (!chosen) return <Card title="Corporate Tax"><p className="text-sm text-slate-600">This client has no Corporate Tax periods.</p></Card>;
  return <CtReturnView key={chosen.id} client={client} periods={periods} period={chosen} perms={perms} onPick={setPeriodId} />;
}

function CtReturnView({ client, periods, period, perms, onPick }: { client: Client; periods: TaxPeriod[]; period: TaxPeriod; perms: string[]; onPick: (id: string) => void }) {
  const auth = useAuth()!;
  const toast = useToast();
  const today = useToday();
  const fetchPreview = useCallback(() => ctPreview(period.id), [period.id]);
  const { data: c, reload } = useLoad<CtComputation>(fetchPreview);
  const [drill, setDrill] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filing, setFiling] = useState(false);
  const r = c?.return ?? null;
  const status = r?.status ?? "none";
  const frozen = status === "approved" || status === "filed";
  const canPrepare = perms.includes("prepare_ct"), canApprove = perms.includes("approve_ct"), canFile = perms.includes("file_ct");
  const mine = r?.prepared_by === auth.userId;
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); reload(); } catch (e) { toast(friendlyDbError(e), "err"); } };
  const ensureReturn = async () => r?.id ?? await startCtReturn(period.id);
  const ended = period.end_date < today;
  const lines = c ? ctLines(c) : [];

  const excel = () => downloadXlsx(`${client.legal_name} - Corporate Tax ${period.start_date} to ${period.end_date}.xlsx`, "CT computation", [
    xlsxRow([client.legal_name]), xlsxRow([`CT TRN ${client.ct_trn ?? ""} · ${REGIME[client.ct_regime]}`]),
    xlsxRow([`Corporate Tax · ${shortDate(period.start_date)} – ${shortDate(period.end_date)} · due ${shortDate(period.due_date)} (AED)`]),
    xlsxRow([`Status: ${CT_STATUS_LABEL[status][0]}${c?.config_version ? ` · tax rules ${c.config_version}` : ""}${r?.snapshot_sha256 ? ` · snapshot ${r.snapshot_sha256}` : ""}`]), [],
    xlsxRow(["Line", "Amount", "Basis"]),
    ...lines.map((l) => xlsxRow([l.label, l.amount === null ? null : { fils: l.kind === "less" ? -l.amount : l.amount }, l.basis])),
    [], xlsxRow(["Losses brought forward", { fils: c?.losses_bf ?? 0 }]), xlsxRow(["Losses carried forward", { fils: c?.losses_cf ?? 0 }]),
    [], xlsxRow(["Profit before tax by account"]), ...(c?.profit_lines ?? []).map((p) => xlsxRow([`${p.account_code} ${p.account_name}`, { fils: p.type === "revenue" ? p.amount : -p.amount }, p.type])),
  ] as Cell[][]);

  return (
    <>
      <Card title="Corporate Tax return" icon={<Calculator size={16} />} pad={false}
        actions={<div className="flex flex-wrap items-end gap-2 no-print">
          <label><span className="block text-xs font-medium text-slate-600 mb-1">Tax period</span>
            <select aria-label="Tax period" className={`${cls} !w-auto`} value={period.id} onChange={(e) => onPick(e.target.value)}>
              {periods.map((t) => <option key={t.id} value={t.id}>{shortDate(t.start_date)} – {shortDate(t.end_date)}</option>)}</select></label>
          <button className="btn-ghost" onClick={() => void excel().catch(() => toast("The Excel file could not be created", "err"))}><FileSpreadsheet size={15} />Excel</button>
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} />Print / PDF</button>
        </div>}
        sub="Calculated from the posted books of the financial year and the tax rules in force at its end. Click the profit line to see the accounts behind it.">
        <div className="print-area">
          <div className="px-5 pt-1 pb-3 flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-lg font-semibold text-slate-900">{client.legal_name}</div>
              <div className="text-xs text-slate-600">CT TRN {client.ct_trn ?? "—"} · {REGIME[client.ct_regime]} · {shortDate(period.start_date)} – {shortDate(period.end_date)}</div>
              <div className="text-xs text-slate-600">Return and payment due {shortDate(period.due_date)}</div></div>
            <div className="text-end"><Badge tone={CT_STATUS_LABEL[status][1]} dot>{CT_STATUS_LABEL[status][0]}</Badge>
              {r?.fta_reference && <div className="mt-1 text-xs text-slate-600">FTA ref {r.fta_reference} · filed {shortDate(r.filed_on!)}</div>}
              {c?.config_version && <div className="mt-1 text-xs text-slate-600">Tax rules {c.config_version}</div>}
              {r?.snapshot_sha256 && <div className="mt-1 text-[10px] text-slate-500 font-mono break-all max-w-72">Snapshot {r.snapshot_sha256}</div>}</div>
          </div>
          {!ended && !frozen && <p className="mx-5 mb-3 rounded-xl bg-sky-50 ring-1 ring-sky-200 text-sky-900 px-4 py-2 text-sm">The financial year has not ended yet — figures so far.</p>}
          {c && c.warnings.length > 0 && <ul className="mx-5 mb-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-4 py-2 text-sm list-disc ps-8">{c.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Computation</th><th className="th text-end">AED</th><th className="th">Basis</th></tr></thead>
            <tbody>
              {!c && <tr><td className="td text-slate-500" colSpan={3}>Calculating…</td></tr>}
              {lines.map((l, i) => (
                <tr key={i} className={`${l.kind === "total" ? "bg-slate-50 font-semibold" : ""} ${l.drill ? "hover:bg-slate-50/70 cursor-pointer" : ""}`} onClick={l.drill ? () => setDrill(true) : undefined}>
                  <td className={`td text-sm ${l.kind === "add" || l.kind === "less" || l.kind === "note" ? "ps-8" : ""}`}>{l.kind === "add" ? "Add: " : l.kind === "less" ? "Less: " : ""}{l.label}</td>
                  <td className="td text-end num">{l.amount === null ? "" : l.kind === "less" ? `(${fmt(l.amount)})` : fmt(l.amount)}</td>
                  <td className="td text-xs text-slate-500">{l.basis}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {c && <dl className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">Revenue (SBR test)</dt><dd className="num">{fmt(c.revenue)}</dd></div>
            <div><dt className="text-xs text-slate-500">Losses brought forward</dt><dd className="num">{fmt(c.losses_bf)}</dd></div>
            <div><dt className="text-xs text-slate-500">Losses carried forward</dt><dd className="num">{fmt(c.losses_cf)}</dd></div>
            <div><dt className="text-xs text-slate-500">Corporate Tax payable</dt><dd className="num font-semibold">AED {fmt(c.ct_payable)}</dd></div>
          </dl>}
        </div>
      </Card>

      {c && (c.adjustments.length > 0 || (!frozen && canPrepare)) && (
        <Card title="Manual adjustments (D-66)" className="mt-4" pad={false}
          actions={!frozen && canPrepare && <button className="btn-ghost no-print" onClick={() => setAdding(true)}><Plus size={15} />Add adjustment</button>}
          sub="Anything not covered by the CT tags on the chart of accounts — e.g. exempt income, transfer pricing, interest limitation. Each needs a description and a legal reference; the approver sees every one.">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Add / deduct</th><th className="th">Description</th><th className="th text-end">AED</th><th className="th"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {c.adjustments.length === 0 && <tr><td className="td text-slate-500" colSpan={4}>None.</td></tr>}
              {c.adjustments.map((a) => (
                <tr key={a.id}><td className="td">{a.direction === "add" ? "Add" : "Deduct"}</td>
                  <td className="td text-sm">{a.description}{a.legal_reference && <span className="block text-xs text-slate-500">{a.legal_reference}</span>}</td>
                  <td className="td text-end num">{fmt(a.amount)}</td>
                  <td className="td text-end">{!frozen && canPrepare && <button aria-label="Remove adjustment" className="text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => void act(() => deleteCtAdjustment(a.id), "Adjustment removed")}><Trash2 size={15} /></button>}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      {c && (
        <div className="mt-4 flex flex-wrap items-center gap-2 no-print">
          {status === "none" && canPrepare && <button className="btn-primary bg-emerald-600" onClick={() => void act(() => startCtReturn(period.id), "CT return started — you are the preparer")}><FileCheck2 size={15} />Start the return</button>}
          {status === "draft" && canApprove && !mine && <button className="btn-primary bg-emerald-600" disabled={!ended} title={ended ? undefined : "The financial year has not ended yet"}
            onClick={() => void act(() => approveCtReturn(r!.id), "Approved — the computation is frozen")}><CheckCircle2 size={15} />Approve and freeze</button>}
          {status === "draft" && mine && <span className="text-xs text-slate-500">You prepared this return, so someone else must approve it.</span>}
          {status === "approved" && canFile && <button className="btn-primary bg-indigo-600" onClick={() => setFiling(true)}><FileCheck2 size={15} />Record FTA filing</button>}
          {frozen && <span className="text-xs text-slate-500">Approved returns are frozen: later postings to this year do not change them.</span>}
        </div>
      )}

      {drill && c && <ProfitDrill c={c} onClose={() => setDrill(false)} />}
      {adding && <AddAdjustment onClose={() => setAdding(false)} onSave={async (dir, amount, why, ref) => {
        await addCtAdjustment(await ensureReturn(), dir, amount, why, ref); setAdding(false); toast("Adjustment added"); reload();
      }} />}
      {filing && r && <RecordFiling onClose={() => setFiling(false)} onSave={async (ref, on) => { await fileCtReturn(r.id, on, ref); setFiling(false); toast("Filing recorded"); reload(); }} />}
    </>
  );
}

function ProfitDrill({ c, onClose }: { c: CtComputation; onClose: () => void }) {
  const rows = (t: "revenue" | "expense") => c.profit_lines.filter((p) => p.type === t);
  const block = (t: "revenue" | "expense", title: string, total: number) => <>
    <tr className="bg-slate-50"><td className="td font-semibold" colSpan={2}>{title}</td></tr>
    {rows(t).map((p) => <tr key={p.account_id}><td className="td text-sm ps-8"><span className="font-mono text-xs">{p.account_code}</span> {p.account_name}</td><td className="td text-end num">{fmt(p.amount)}</td></tr>)}
    <tr className="font-semibold"><td className="td">Total {title.toLowerCase()}</td><td className="td text-end num">{fmt(total)}</td></tr>
  </>;
  return (
    <Modal open wide onClose={onClose} title="Accounting profit before tax — by account" footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <p className="text-sm text-slate-600 mb-3">Posted journals dated in the financial year. The Corporate Tax expense account is left out. Open <b>Reports → General ledger</b> for the entries behind an account.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><tbody>
        {block("revenue", "Revenue", c.revenue)}
        {block("expense", "Expenses", c.expenses)}
        <tr className="bg-slate-50 font-semibold"><td className="td">Accounting profit before tax</td><td className="td text-end num">{fmt(c.accounting_profit)}</td></tr>
      </tbody></table></div>
    </Modal>
  );
}

function AddAdjustment({ onClose, onSave }: { onClose: () => void; onSave: (dir: "add" | "deduct", amount: number, why: string, ref: string) => Promise<void> }) {
  const [dir, setDir] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState(""); const [why, setWhy] = useState(""); const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    const f = parseAedToFils(amount);
    if (f === null || f <= 0) { setError("Enter a positive amount in AED with at most 2 decimals — choose Add or Deduct for the direction."); return; }
    if (!why.trim() || !ref.trim()) { setError("A description and a legal reference are both required (D-66)."); return; }
    try { await onSave(dir, f, why.trim(), ref.trim()); } catch (e) { setError(friendlyDbError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Add a Corporate Tax adjustment"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" onClick={() => void save()}>Add</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="dir" checked={dir === "add"} onChange={() => setDir("add")} />Add to taxable income</label>
          <label className="flex items-center gap-2"><input type="radio" name="dir" checked={dir === "deduct"} onChange={() => setDir("deduct")} />Deduct from taxable income</label>
        </div>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Amount (AED)</span><input aria-label="Amount" className={`${cls} text-end`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Description (kept with the return)</span><textarea aria-label="Description" className={cls} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Dividend received from a UAE company — exempt" /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Legal reference</span><input aria-label="Legal reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FDL 47/2022 Art 22" /></label>
      </div>
    </Modal>
  );
}

function RecordFiling({ onClose, onSave }: { onClose: () => void; onSave: (ref: string, on: string) => Promise<void> }) {
  const today = useToday();
  const [ref, setRef] = useState(""); const [on, setOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Record the FTA filing"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-indigo-600" onClick={() => void onSave(ref, on).catch((e) => setError(friendlyDbError(e)))}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">After submitting the Corporate Tax return on EmaraTax, record its reference here. The return itself stays frozen.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">FTA reference</span><input aria-label="FTA reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Filed on</span><input aria-label="Filed on" type="date" className={cls} value={on} onChange={(e) => setOn(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
