/** Firm dashboard (P3-07): every client at a glance, the ones needing attention first. Live from the database. */
import { AlertTriangle, CheckSquare, FileCheck2, Landmark, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { Badge, Card, KpiGrid, Stat } from "../components/ui";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import { approvalsWaiting, attention, dso, firmDashboard, firmTotals, sortByAttention, type DashRow } from "../lib/dashboard";
import type { ClientTab } from "./routes";
import { useLoad } from "./hooks";

const LEVEL: Record<number, ["rose" | "amber" | "slate" | "emerald", string]> = { 3: ["rose", "Urgent"], 2: ["amber", "To do"], 1: ["slate", "Housekeeping"], 0: ["emerald", "Up to date"] };

export function DashboardPage({ openClient }: { openClient: (id: string, tab: ClientTab) => void }) {
  const { data, error } = useLoad(firmDashboard);
  const rows = sortByAttention(data ?? []);
  const t = firmTotals(rows);
  return (
    <>
      <div className="mb-5 flex items-center gap-2"><LayoutDashboard size={20} className="text-slate-500" /><h1 className="text-xl font-semibold text-slate-900">Dashboard</h1></div>
      <KpiGrid>
        <Stat label="VAT returns overdue" value={t.vatOverdue} icon={<FileCheck2 size={16} />} tone={t.vatOverdue ? "rose" : "emerald"} hint={`${t.vatToPrepare} quarter(s) ended and not yet approved`} />
        <Stat label="Waiting for approval" value={t.approvals} icon={<CheckSquare size={16} />} tone={t.approvals ? "amber" : "emerald"} hint="Journals, invoices, bills, payments, returns, reconciliations" />
        <Stat label="Customers overdue (AED)" value={fmt(t.arOverdue)} icon={<Users size={16} />} tone={t.arOverdue ? "amber" : "emerald"} hint={`of ${fmt(t.arOpen)} receivable`} />
        <Stat label="Integrity problems" value={t.integrityProblems} icon={<ShieldCheck size={16} />} tone={t.integrityProblems ? "rose" : "emerald"} hint={`${t.bankUnmatched} bank line(s) to match`} />
      </KpiGrid>
      {error !== null && <p role="alert" className="mt-4 text-sm text-rose-700">The dashboard could not be loaded.</p>}
      <Card title="Clients" className="mt-5" pad={false} sub="Sorted by what needs attention. Click a figure to open that part of the client.">
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px]">
          <thead><tr><th className="th">Client</th><th className="th">Status</th><th className="th">VAT return</th><th className="th text-end">Approvals</th>
            <th className="th text-end">Receivable (overdue)</th><th className="th text-end">Payable</th><th className="th text-end">Revenue YTD</th><th className="th text-end">DSO</th><th className="th">Bank</th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={9}>Loading…</td></tr>}
            {data?.length === 0 && <tr><td className="td text-slate-500" colSpan={9}>No clients yet.</td></tr>}
            {rows.map((r) => <Row key={r.organization_id} r={r} open={(tab) => openClient(r.organization_id, tab)} />)}
          </tbody>
        </table></div>
      </Card>
      <p className="mt-3 text-xs text-slate-500">DSO (days sales outstanding) = open receivables ÷ revenue of the last 12 months × 365 (F-23). Figures are calculated live; nothing is stored.</p>
    </>
  );
}

function Row({ r, open }: { r: DashRow; open: (tab: ClientTab) => void }) {
  const a = attention(r);
  const days = dso(r.ar_open, r.revenue_365);
  const link = "cursor-pointer hover:underline decoration-dotted";
  return (
    <tr className="align-top">
      <td className="td font-medium"><button className={`text-start ${link}`} onClick={() => open("overview")}>{r.legal_name}</button></td>
      <td className="td"><Badge tone={LEVEL[a.level][0]} dot>{LEVEL[a.level][1]}</Badge>
        {a.reasons.length > 0 && <ul className="mt-1 text-xs text-slate-600">{a.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
        {r.integrity_status === "error" && <span className="mt-1 flex items-center gap-1 text-xs text-rose-700"><AlertTriangle size={12} />See Integrity</span>}</td>
      <td className="td text-sm">{!r.vat_registered ? <span className="text-slate-400">Not registered</span> : r.vat_open_returns === 0 ? <span className="text-slate-500">Nothing due</span>
        : <button className={link} onClick={() => open("vat")}>{r.vat_overdue_returns > 0 ? <span className="text-rose-700 font-medium">Overdue since {shortDate(r.vat_next_due!)}</span> : <>Due {shortDate(r.vat_next_due!)}</>}
            <span className="block text-xs text-slate-500">period to {shortDate(r.vat_next_period_end!)}</span></button>}</td>
      <td className="td text-end num">{approvalsWaiting(r) > 0 ? <button className={link} onClick={() => open("approvals")}>{approvalsWaiting(r)}</button> : <span className="text-slate-400">0</span>}</td>
      <td className="td text-end num"><button className={link} onClick={() => open("reports")}>{fmt(r.ar_open)}</button>{r.ar_overdue > 0 && <span className="block text-xs text-amber-700">({fmt(r.ar_overdue)} overdue)</span>}</td>
      <td className="td text-end num">{fmt(r.ap_open)}</td>
      <td className="td text-end num">{fmt(r.revenue_ytd)}</td>
      <td className="td text-end num">{days === null ? "—" : `${days} d`}</td>
      <td className="td text-sm"><button className={link} onClick={() => open("bank")}><Landmark size={12} className="inline me-1 text-slate-400" />{r.bank_unmatched > 0 ? `${r.bank_unmatched} to match` : "Matched"}</button>
        <span className="block text-xs text-slate-500">{r.bank_reconciled_to ? `Reconciled to ${shortDate(r.bank_reconciled_to)}` : "Not reconciled yet"}</span></td>
    </tr>
  );
}
