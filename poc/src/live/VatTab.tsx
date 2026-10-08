/** VAT 201 return for one client (P3-01, P3-02 · D-12, D-42 → D-44): every box from the books, drill-down to the
 *  journal lines, manual adjustments with reasons, review → approval (frozen, quarter locked) → filed. */
import { useCallback, useState } from "react";
import { CheckCircle2, FileCheck2, FileSpreadsheet, Plus, Printer, Send, Trash2, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import type { Client, TaxPeriod } from "../lib/clients";
import { downloadXlsx, xlsxRow, type Cell } from "../lib/financial";
import {
  addVatAdjustment, ADJUSTABLE, approveVatReturn, columns, deleteVatAdjustment, markVatFiled, netPosition, rejectVatReturn, startVatReturn,
  STATUS_LABEL, submitVatReturn, totalsAgree, vatBoxLines, vatPreview, vatReconciliation, adjustmentsEffect, type VatBox, type VatPreview,
} from "../lib/live-vat";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const money = (f: number) => fmt(f);                                  // D-12: 0 shows as 0.00, never blank

export function VatTab({ client, taxPeriods, perms }: { client: Client; taxPeriods: TaxPeriod[]; perms: string[] }) {
  const today = useToday();
  const periods = taxPeriods.filter((t) => t.kind === "vat").sort((a, b) => b.start_date.localeCompare(a.start_date));
  // The return to work on now: the oldest started period whose filing deadline has not passed, else the latest started one.
  const due = [...periods].reverse().find((p) => p.start_date <= today && p.due_date >= today);
  const started = periods.find((p) => p.start_date <= today) ?? periods[periods.length - 1];
  const [periodId, setPeriodId] = useState<string | null>(null);
  const chosen = periods.find((p) => p.id === periodId) ?? due ?? started;
  if (!client.vat_registered || periods.length === 0) {
    return <Card title="VAT return"><p className="text-sm text-slate-600">This client is not VAT registered, so there are no VAT periods.</p></Card>;
  }
  return <VatReturnView key={chosen.id} client={client} periods={periods} period={chosen} perms={perms} onPick={setPeriodId} />;
}

function VatReturnView({ client, periods, period, perms, onPick }: { client: Client; periods: TaxPeriod[]; period: TaxPeriod; perms: string[]; onPick: (id: string) => void }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetchPreview = useCallback(() => vatPreview(period.id), [period.id]);
  const { data: p, reload } = useLoad<VatPreview>(fetchPreview);
  const [drill, setDrill] = useState<VatBox | null>(null);
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const r = p?.return ?? null;
  const status = r?.status ?? "none";
  const canPrepare = perms.includes("prepare_vat"), canApprove = perms.includes("approve_vat"), canFile = perms.includes("file_vat");
  const mine = r?.prepared_by === auth.userId;
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); setReason(null); reload(); } catch (e) { toast(friendlyDbError(e), "err"); } };
  const ensureReturn = async () => r?.id ?? await startVatReturn(period.id);
  const net = p ? netPosition(p.boxes) : null;

  const excel = () => downloadXlsx(`${client.legal_name} - VAT 201 ${period.start_date} to ${period.end_date}.xlsx`, "VAT 201", [
    xlsxRow([client.legal_name]), xlsxRow([`TRN ${client.trn ?? ""}`]), xlsxRow([`VAT 201 · ${shortDate(period.start_date)} – ${shortDate(period.end_date)} · due ${shortDate(period.due_date)} (AED)`]),
    xlsxRow([`Status: ${STATUS_LABEL[status][0]}${r?.snapshot_sha256 ? ` · snapshot ${r.snapshot_sha256}` : ""}`]), [],
    xlsxRow(["Box", "Description", "Amount", "VAT", "Adjustment"]),
    ...(p?.boxes ?? []).map((b) => { const c = columns(b.box_code); return xlsxRow([b.box_code, b.label, c.amount ? { fils: b.amount } : null, c.vat ? { fils: b.vat } : null, c.adjustment ? { fils: b.adjustment } : null]); }),
    [], ...(p?.adjustments ?? []).map((a) => xlsxRow([`Adjustment ${a.box_code}`, a.reason + (a.legal_reference ? ` (${a.legal_reference})` : ""), { fils: a.amount }, { fils: a.vat }, { fils: a.adjustment }])),
  ] as Cell[][]);

  return (
    <>
      <Card title="VAT return (VAT 201)" icon={<FileCheck2 size={16} />} pad={false}
        actions={<div className="flex flex-wrap items-end gap-2 no-print">
          <label><span className="block text-xs font-medium text-slate-600 mb-1">VAT period</span>
            <select aria-label="VAT period" className={`${cls} !w-auto`} value={period.id} onChange={(e) => onPick(e.target.value)}>
              {periods.map((t) => <option key={t.id} value={t.id}>{shortDate(t.start_date)} – {shortDate(t.end_date)}</option>)}</select></label>
          <button className="btn-ghost" onClick={() => void excel().catch(() => toast("The Excel file could not be created", "err"))}><FileSpreadsheet size={15} />Excel</button>
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} />Print / PDF</button>
        </div>}
        sub="Calculated from posted invoices, bills and credit/debit notes of the period by their tax codes. Click a box to see the documents behind it.">
        <div className="print-area">
          <div className="px-5 pt-1 pb-3 flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-lg font-semibold text-slate-900">{client.legal_name}</div><div className="text-xs text-slate-600">TRN {client.trn ?? "—"} · VAT 201 · {shortDate(period.start_date)} – {shortDate(period.end_date)}</div>
              <div className="text-xs text-slate-600">Due {shortDate(period.due_date)}</div></div>
            <div className="text-end"><Badge tone={STATUS_LABEL[status][1]} dot>{STATUS_LABEL[status][0]}</Badge>
              {r?.fta_reference && <div className="mt-1 text-xs text-slate-600">FTA ref {r.fta_reference} · filed {shortDate(r.filed_on!)}</div>}
              {r?.snapshot_sha256 && <div className="mt-1 text-[10px] text-slate-500 font-mono break-all max-w-72">Snapshot {r.snapshot_sha256}</div>}</div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
            <thead><tr><th className="th w-12">Box</th><th className="th">Description</th><th className="th text-end">Amount (AED)</th><th className="th text-end">VAT (AED)</th><th className="th text-end">Adjustment (AED)</th></tr></thead>
            <tbody>
              {!p && <tr><td className="td text-slate-500" colSpan={5}>Calculating…</td></tr>}
              {p?.boxes.map((b) => {
                const c = columns(b.box_code), total = ["8", "11", "12", "13", "14"].includes(b.box_code);
                const drillable = !total && b.box_code !== "2" && b.box_code !== "7";
                return (
                  <tr key={b.box_code} className={`${total ? "bg-slate-50 font-semibold" : ""} ${drillable ? "hover:bg-slate-50/70 cursor-pointer" : ""}`} onClick={drillable ? () => setDrill(b) : undefined}>
                    <td className="td font-mono text-xs">{b.box_code}</td><td className="td text-sm">{b.label}</td>
                    <td className="td text-end num">{c.amount ? money(b.amount) : ""}</td><td className="td text-end num">{c.vat ? money(b.vat) : ""}</td>
                    <td className="td text-end num">{c.adjustment ? money(b.adjustment) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {net && <p className="px-5 py-3 text-sm"><b>{net.label}: AED {fmt(net.amount)}</b>{p && !totalsAgree(p.boxes) && <span className="ms-3 text-rose-700">Totals do not agree — tell the platform team.</span>}</p>}
        </div>
      </Card>

      {p && (p.adjustments.length > 0 || (!p.frozen && canPrepare)) && (
        <Card title="Manual entries (D-43)" className="mt-4" pad={false}
          actions={!p.frozen && status !== "in_review" && canPrepare && <button className="btn-ghost no-print" onClick={() => setAdding(true)}><Plus size={15} />Add adjustment</button>}
          sub="Only the adjustment column of boxes 1a–1g and 9, and boxes 2 and 7 — each with a reason. The approver sees every one.">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Box</th><th className="th">Reason</th><th className="th text-end">Amount</th><th className="th text-end">VAT</th><th className="th text-end">Adjustment</th><th className="th"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {p.adjustments.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>None.</td></tr>}
              {p.adjustments.map((a) => (
                <tr key={a.id}><td className="td font-mono text-xs">{a.box_code}</td><td className="td text-sm">{a.reason}{a.legal_reference && <span className="block text-xs text-slate-500">{a.legal_reference}</span>}</td>
                  <td className="td text-end num">{fmt(a.amount)}</td><td className="td text-end num">{fmt(a.vat)}</td><td className="td text-end num">{fmt(a.adjustment)}</td>
                  <td className="td text-end">{status === "draft" && canPrepare && <button aria-label="Remove adjustment" className="text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => void act(() => deleteVatAdjustment(a.id), "Adjustment removed")}><Trash2 size={15} /></button>}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      {p && <Reconciliation key={`${period.id}-${status}-${p.adjustments.length}`} periodId={period.id} />}

      {p && p.prior_period_items.length > 0 && (
        <Card title="From earlier, already approved quarters (D-44)" className="mt-4" pad={false}
          sub="These VAT documents were posted after their quarter's return was approved (the period was reopened). They are NOT in the boxes above — decide whether to adjust this return or make a voluntary disclosure.">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Date</th><th className="th">Journal</th><th className="th">Details</th><th className="th">Tax</th><th className="th text-end">Amount</th><th className="th text-end">VAT</th></tr></thead>
            <tbody>{p.prior_period_items.map((x, i) => (
              <tr key={i}><td className="td">{shortDate(x.entry_date)}</td><td className="td font-mono text-xs">{x.journal_no}</td><td className="td text-sm">{x.memo}</td><td className="td">{x.tax_code}</td>
                <td className="td text-end num">{fmt(x.amount)}</td><td className="td text-end num">{fmt(x.vat)}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {p && (
        <div className="mt-4 flex flex-wrap items-center gap-2 no-print">
          {(status === "none" || status === "draft") && canPrepare && <button className="btn-primary bg-emerald-600" onClick={() => void act(async () => submitVatReturn(await ensureReturn()), "Sent for approval")}><Send size={15} />Submit for approval</button>}
          {status === "in_review" && canApprove && <>
            {!mine && <button className="btn-primary bg-emerald-600" onClick={() => void act(() => approveVatReturn(r!.id), "Approved — the return is frozen and the quarter is locked")}><CheckCircle2 size={15} />Approve and freeze</button>}
            <button className="btn-danger" disabled={reason !== null && !reason.trim()} onClick={() => (reason === null ? setReason("") : void act(() => rejectVatReturn(r!.id, reason.trim()), "Sent back to the preparer"))}><XCircle size={15} />Send back</button>
          </>}
          {status === "in_review" && mine && <span className="text-xs text-slate-500">You prepared this return, so someone else must approve it.</span>}
          {status === "approved" && canFile && <button className="btn-primary bg-indigo-600" onClick={() => setFiling(true)}><FileCheck2 size={15} />Record FTA filing</button>}
          {status === "approved" && <span className="text-xs text-slate-500">Approved returns are frozen; the quarter's periods are locked (D-44).</span>}
        </div>
      )}
      {reason !== null && <label className="block mt-3 max-w-xl"><span className="block text-xs font-medium text-slate-600 mb-1.5">Why is it being sent back? Then click “Send back” again.</span>
        <textarea className={cls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}

      {drill && <BoxDrill periodId={period.id} box={drill} onClose={() => setDrill(null)} />}
      {adding && <AddAdjustment onClose={() => setAdding(false)} onSave={async (box, values, why, ref) => {
        await addVatAdjustment(await ensureReturn(), box, values, why, ref); setAdding(false); toast("Adjustment added"); reload();
      }} />}
      {filing && r && <RecordFiling onClose={() => setFiling(false)} onSave={async (ref, on) => { await markVatFiled(r.id, ref, on); setFiling(false); toast("Filing recorded"); reload(); }} />}
    </>
  );
}

function BoxDrill({ periodId, box, onClose }: { periodId: string; box: VatBox; onClose: () => void }) {
  const fetch = useCallback(() => vatBoxLines(periodId, box.box_code), [periodId, box.box_code]);
  const { data } = useLoad(fetch);
  const sum = (k: "amount" | "vat") => (data ?? []).reduce((s, l) => s + l[k], 0);
  return (
    <Modal open wide onClose={onClose} title={`Box ${box.box_code} — ${box.label}`} footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
        <thead><tr><th className="th">Date</th><th className="th">Journal</th><th className="th">Document</th><th className="th">Tax</th><th className="th text-end">Amount</th><th className="th text-end">VAT</th></tr></thead>
        <tbody>
          {!data && <tr><td className="td text-slate-500" colSpan={6}>Loading…</td></tr>}
          {data?.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Nothing in this box for the period.</td></tr>}
          {data?.map((l, i) => <tr key={i}><td className="td">{shortDate(l.entry_date)}</td><td className="td font-mono text-xs">{l.journal_no}</td><td className="td text-sm">{l.memo}{l.description && <span className="block text-xs text-slate-500">{l.description}</span>}</td>
            <td className="td">{l.tax_code}</td><td className="td text-end num">{fmt(l.amount)}</td><td className="td text-end num">{fmt(l.vat)}</td></tr>)}
          {data && data.length > 0 && <tr className="font-semibold bg-slate-50"><td className="td" colSpan={4}>Total (before manual entries)</td><td className="td text-end num">{fmt(sum("amount"))}</td><td className="td text-end num">{fmt(sum("vat"))}</td></tr>}
        </tbody>
      </table></div>
    </Modal>
  );
}

function AddAdjustment({ onClose, onSave }: { onClose: () => void; onSave: (box: string, v: { amount: number; vat: number; adjustment: number }, reason: string, ref: string) => Promise<void> }) {
  const [box, setBox] = useState("1a");
  const [amount, setAmount] = useState(""); const [vat, setVat] = useState(""); const [adj, setAdj] = useState("");
  const [why, setWhy] = useState(""); const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const kind = ADJUSTABLE[box];
  const save = async () => {
    setError(null);
    const f = (s: string) => parseAedToFils(s || "0");
    const v = { amount: kind === "amount_vat" ? f(amount) : 0, vat: kind === "amount_vat" ? f(vat) : 0, adjustment: kind === "adjustment" ? f(adj) : 0 };
    if (v.amount === null || v.vat === null || v.adjustment === null) { setError("Enter amounts in AED with at most 2 decimals (minus for a reduction)."); return; }
    if (!why.trim()) { setError("A reason is required (D-43)."); return; }
    try { await onSave(box, v as { amount: number; vat: number; adjustment: number }, why.trim(), ref.trim()); } catch (e) { setError(friendlyDbError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Add a manual VAT entry"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" onClick={() => void save()}>Add</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Box</span>
          <select aria-label="Box" className={cls} value={box} onChange={(e) => setBox(e.target.value)}>
            {Object.keys(ADJUSTABLE).map((b) => <option key={b} value={b}>{b} — {ADJUSTABLE[b] === "adjustment" ? "adjustment column" : "amount and VAT"}</option>)}</select></label>
        {kind === "adjustment"
          ? <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Adjustment (AED, minus to reduce — e.g. bad-debt relief)</span><input aria-label="Adjustment" className={`${cls} text-end`} value={adj} onChange={(e) => setAdj(e.target.value)} /></label>
          : <div className="grid grid-cols-2 gap-3">
              <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Amount (AED)</span><input aria-label="Amount" className={`${cls} text-end`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label><span className="block text-xs font-medium text-slate-600 mb-1.5">VAT (AED)</span><input aria-label="VAT" className={`${cls} text-end`} value={vat} onChange={(e) => setVat(e.target.value)} /></label></div>}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Reason (kept with the return)</span><textarea aria-label="Reason" className={cls} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Legal reference (optional)</span><input aria-label="Legal reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FDL 8/2017 Art 64" /></label>
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
      <p className="text-sm text-slate-600 mb-3">After submitting the return on EmaraTax, record its reference here. The return itself stays frozen.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">FTA reference</span><input aria-label="FTA reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Filed on</span><input aria-label="Filed on" type="date" className={cls} value={on} onChange={(e) => setOn(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

// ── P3-03 · reconciliation with the ledger (VAT-14) and the clearing journal (D-47) ────────
function Reconciliation({ periodId }: { periodId: string }) {
  const fetch = useCallback(() => vatReconciliation(periodId), [periodId]);
  const { data: rec } = useLoad(fetch);
  if (!rec) return null;
  const adj = adjustmentsEffect(rec.adjustments);
  const other = rec.other_postings.reduce((s, o) => s - o.amount, 0);
  const unexplained = rec.box14 - rec.ledger_net - adj + other;
  return (
    <Card title="Reconciliation with the ledger (VAT-14)" className="mt-4" pad={false}
      sub="Each group of boxes against the movement on its VAT account in the quarter. Any difference must be explained below.">
      <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
        <thead><tr><th className="th">Return</th><th className="th">Account</th><th className="th text-end">Return (AED)</th><th className="th text-end">Ledger (AED)</th><th className="th text-end">Difference</th></tr></thead>
        <tbody>
          {rec.rows.map((r) => (
            <tr key={r.account}><td className="td text-sm">{r.group}</td><td className="td font-mono text-xs">{r.account}</td><td className="td text-end num">{fmt(r.return)}</td>
              <td className="td text-end num">{fmt(r.ledger)}</td><td className={`td text-end num ${r.return === r.ledger ? "text-emerald-700" : "text-amber-700 font-medium"}`}>{fmt(r.return - r.ledger)}</td></tr>
          ))}
          <tr className="font-semibold bg-slate-50"><td className="td" colSpan={2}>Net VAT (box 14 vs ledger)</td><td className="td text-end num">{fmt(rec.box14)}</td><td className="td text-end num">{fmt(rec.ledger_net)}</td><td className="td text-end num">{fmt(rec.box14 - rec.ledger_net)}</td></tr>
        </tbody>
      </table></div>
      <div className="px-5 py-3 text-sm space-y-2">
        {rec.adjustments.length > 0 && <div><b>Manual entries on the return</b> ({fmt(adj)}) — not in the ledger: post their accounting entry by journal against 2120 (e.g. bad-debt relief).
          <ul className="list-disc ps-6 text-xs text-slate-600">{rec.adjustments.map((a, i) => <li key={i}>Box {a.box_code}: {fmt(a.vat + a.adjustment)} — {a.reason}</li>)}</ul></div>}
        {rec.other_postings.length > 0 && <div><b>Postings to the VAT accounts not from invoices or bills</b> ({fmt(other)}) — e.g. opening balances; they are in the ledger but not in the return.
          <ul className="list-disc ps-6 text-xs text-slate-600">{rec.other_postings.map((o, i) => <li key={i}>{shortDate(o.entry_date)} {o.journal_no} ({o.source}) on {o.account}: {fmt(o.amount)} — {o.memo}</li>)}</ul></div>}
        <p className={unexplained === 0 ? "text-emerald-700" : "text-rose-700 font-medium"}>{unexplained === 0 ? "Every difference is explained." : `Unexplained difference ${fmt(unexplained)} — investigate before approving.`}</p>
        {rec.clearing_journal && <p className="text-slate-700">Cleared on approval by <span className="font-mono text-xs">{rec.clearing_journal.journal_no}</span> ({shortDate(rec.clearing_journal.entry_date)}): AED {fmt(Math.abs(rec.clearing_journal.amount))} {rec.clearing_journal.amount >= 0 ? "payable to" : "refundable by"} the FTA on account 2120. Record the payment from the bank line (Bank → Other… → 2120).</p>}
      </div>
    </Card>
  );
}
