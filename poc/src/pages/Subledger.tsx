import { useMemo, useState } from "react";
import { HandCoins, Wallet, AlertTriangle, Clock, Timer, CheckCircle2, Scale, Download, BellRing, ArrowRight, Users, FileText } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, USERS } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { useOrgData, daysBetween, TODAY } from "../lib/derive";
import { BUCKETS, type OpenItem, type PartyRow } from "../lib/subledger";
import { fmt, compact } from "../lib/money";
import { withVat } from "../lib/vat";
import { Badge, Card, DataTable, KpiGrid, Modal, Num, PageHeader, Stat, Tabs, cx } from "../components/ui";
import { axis, tipStyle, aedK } from "../components/charts";
import { JournalModal } from "./Ledger";
import type { Org } from "../lib/types";
import type { Page } from "../components/Layout";

type Kind = "ar" | "ap";
const CFG = {
  ar: { control: "1100" as const, title: "Accounts receivable", sub: "Customer balances from the general ledger · control account 1100 Trade receivables", party: "Customer", parties: "Customers", doc: "Invoice", docs: "Open invoices", settle: "Receive", settled: "Received", total: "Total receivable", tone: "sky", icon: <HandCoins size={16} />, bar: ["#5b9be6", "#2a78d6"] },
  ap: { control: "2000" as const, title: "Accounts payable", sub: "Supplier balances from the general ledger · control account 2000 Trade payables", party: "Supplier", parties: "Suppliers", doc: "Bill", docs: "Open bills", settle: "Pay", settled: "Paid", total: "Total payable", tone: "amber", icon: <Wallet size={16} />, bar: ["#f6a97f", "#eb6834"] },
};
const BUCKET_COLORS = ["#1baf7a", "#eda100", "#eb6834", "#e34948", "#9f1239"];

export const Receivables = (p: { org: Org; go: (p: Page) => void }) => <Subledger kind="ar" {...p} />;
export const Payables = (p: { org: Org; go: (p: Page) => void }) => <Subledger kind="ap" {...p} />;

function Subledger({ kind, org, go }: { kind: Kind; org: Org; go: (p: Page) => void }) {
  const store = useStore();
  const { t, xDir, yDir } = useI18n();
  const c = CFG[kind];
  const d = useOrgData(org)!;
  const L = kind === "ar" ? d.arL : d.apL;
  const gl = d.tb.find((r) => r.code === c.control)?.balance ?? 0;
  const diff = gl - L.total;
  const overdue = L.items.filter((i) => i.overdueDays > 0);
  const overdueAmt = overdue.reduce((s, i) => s + i.open, 0);
  // Days outstanding = balance ÷ average daily (VAT-inclusive) turnover so far this financial year.
  const elapsed = Math.max(1, daysBetween(d.fy.from, TODAY));
  const days = kind === "ar" ? Math.round(L.total / Math.max(1, withVat(d.pl.revenue) / elapsed)) : Math.round(L.total / Math.max(1, withVat(d.pl.cogs + d.pl.opex) / elapsed));
  const [tab, setTab] = useState<"parties" | "items">("parties");
  const [stmt, setStmt] = useState<PartyRow | null>(null);
  const [jid, setJid] = useState<string | null>(null);
  const [run, setRun] = useState(false);
  const canSettle = USERS[store.state.session.role].canApprove;
  const runItems = useMemo(() => L.items.filter((i) => daysBetween(TODAY, i.due) <= 7), [L.items]);
  const settle = (items: OpenItem[]) => store.settle(org.id, c.control, items.map((i) => ({ jid: i.jid, ref: i.ref, party: i.party, open: i.open })));
  const statusBadge = (i: OpenItem) => i.overdueDays > 0 ? <Badge tone={i.overdueDays > 60 ? "rose" : "amber"} dot>{t("{n}d overdue", { n: i.overdueDays })}</Badge> : <Badge tone="emerald" dot>{t("Due {date}", { date: i.due })}</Badge>;
  const top = L.parties.filter((p) => p.balance > 0).slice(0, 6).map((p) => ({ name: p.party.length > 22 ? p.party.slice(0, 21) + "…" : p.party, v: p.balance / 100 }));

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t(c.title)} sub={t(c.sub)}
        actions={<>
          <Tabs value={tab} onChange={setTab} items={[{ id: "parties", label: t(c.parties) }, { id: "items", label: t(c.docs) }]} />
          {kind === "ap" ? <button className="btn-primary" disabled={!runItems.length} onClick={() => setRun(true)}><Wallet size={15} />{t("Payment run")}</button>
            : <button className="btn-primary" disabled={!overdue.length} onClick={() => store.toast(t("Reminders queued for {n} overdue invoice(s) (demo — nothing is sent)", { n: overdue.length }), "info")}><BellRing size={15} />{t("Send reminders")}</button>}
        </>} />

      <KpiGrid>
        <Stat label={t(c.total)} value={<Num v={L.total} f={compact} />} icon={c.icon} tone={c.tone} hint={t("{n} open · {p} {parties}", { n: L.items.length, p: L.parties.filter((p) => p.balance > 0).length, parties: t(c.parties).toLowerCase() })} />
        <Stat label={t("Overdue")} value={<Num v={overdueAmt} f={compact} />} icon={<AlertTriangle size={16} />} tone="rose" hint={t("{n} items · {p}% of balance", { n: overdue.length, p: L.total ? Math.round((overdueAmt / L.total) * 100) : 0 })} onClick={() => setTab("items")} />
        <Stat label={t(kind === "ar" ? "Days sales outstanding" : "Days payable outstanding")} value={t("{n} days", { n: days })} icon={<Timer size={16} />} tone="violet" hint={t("Terms: 30 days")} />
        <Stat label={t(kind === "ar" ? "Collected · last 30 days" : "Paid · last 30 days")} value={<Num v={L.settledLast30} f={compact} />} icon={<CheckCircle2 size={16} />} tone="emerald" hint={kind === "ap" ? t("Due next 7 days: {amt}", { amt: compact(L.dueNext7) }) : undefined} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title={t("Ageing")} sub={t("Open balance by days past due")} icon={<Clock size={16} />} hover>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-4">
            {L.buckets.map((b, i) => b.v > 0 && <div key={b.label} className="h-full grow-x transition-all" title={`${t(b.label)}: ${fmt(b.v, { aed: true })}`} style={{ width: `${(b.v / Math.max(1, L.total)) * 100}%`, background: BUCKET_COLORS[i], animationDelay: `${i * 0.08}s` }} />)}
          </div>
          <ul className="space-y-2">
            {L.buckets.map((b, i) => (
              <li key={b.label} className="flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 hover:bg-slate-50 transition">
                <i className="size-2.5 rounded-full shrink-0" style={{ background: BUCKET_COLORS[i] }} />
                <span className="flex-1 text-slate-600">{t(b.label)} <span className="text-xs text-slate-400">({b.n})</span></span>
                <span className="num font-medium">{fmt(b.v, { dp0: true })}</span>
                <span className="w-10 text-end text-xs text-slate-400 num">{L.total ? Math.round((b.v / L.total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t(kind === "ar" ? "Top customers by balance" : "Top suppliers by balance")} sub={t("Open balance, AED")} icon={<Users size={16} />} hover>
          <div className="h-56" dir="ltr"><ResponsiveContainer>
            <BarChart data={top} layout="vertical" margin={{ left: 0, right: 12 }} barSize={16}>
              <defs><linearGradient id={`tp-${kind}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={c.bar[0]} /><stop offset="1" stopColor={c.bar[1]} /></linearGradient></defs>
              <CartesianGrid stroke="#eef2f7" horizontal={false} strokeDasharray="3 4" />
              <XAxis type="number" {...axis} tickFormatter={aedK} {...xDir} />
              <YAxis type="category" dataKey="name" {...axis} width={130} tick={{ fontSize: 10.5, fill: "#64748b" }} {...yDir} />
              <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)" }} formatter={(v) => `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
              <Bar dataKey="v" name={t("Balance")} fill={`url(#tp-${kind})`} radius={[0, 6, 6, 0]} animationDuration={1100}>{top.map((x) => <Cell key={x.name} />)}</Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title={t("General ledger reconciliation")} sub={t("Sub-ledger vs control account {c}", { c: c.control })} icon={<Scale size={16} />} hover>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{t(kind === "ar" ? "Sum of customer balances" : "Sum of supplier balances")}</span><span className="num font-medium">{fmt(L.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t("GL account {c} balance", { c: c.control })}</span><span className="num font-medium">{fmt(gl)}</span></div>
            <div className={cx("flex justify-between rounded-xl px-3 py-2.5 ring-1 font-semibold", diff === 0 ? "bg-emerald-50 ring-emerald-100 text-emerald-800" : "bg-rose-50 ring-rose-100 text-rose-800")}>
              <span className="flex items-center gap-1.5">{diff === 0 ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{t(diff === 0 ? "Reconciled to the fils" : "Difference")}</span><span className="num">{fmt(diff)}</span>
            </div>
            <p className="text-xs text-slate-400">{t("Every balance here is computed from posted journals — receipts and payments are applied oldest-first.")}</p>
            <button className="btn-ghost w-full justify-center" onClick={() => go("ledger")}>{t("Open in Accounts")} <ArrowRight size={14} className="rtl:rotate-180" /></button>
          </div>
        </Card>
      </div>

      {tab === "parties" ? (
        <DataTable title={t(c.parties)} rows={L.parties} rowKey={(p) => p.party} onRowClick={setStmt} initialSort={{ key: "bal", dir: "desc" }}
          search={(p) => p.party}
          filters={[{ key: "st", label: t("Status"), options: [{ value: "od", label: t("Overdue") }, { value: "cur", label: t("Current") }, { value: "zero", label: t("Settled") }], get: (p) => (p.balance === 0 ? "zero" : p.overdue > 0 ? "od" : "cur") }]}
          cols={[
            { key: "p", header: t(c.party), sort: (p) => p.party, cell: (p) => <div className="flex items-center gap-3 min-w-0"><span className={cx("size-8 shrink-0 rounded-lg grid place-items-center text-xs font-semibold text-white bg-gradient-to-br", kind === "ar" ? "from-sky-400 to-blue-600" : "from-amber-300 to-orange-500")}>{p.party[0]}</span><span className="truncate max-w-60 font-medium text-slate-800">{p.party}</span></div> },
            { key: "n", header: t(kind === "ar" ? "Invoices" : "Bills"), align: "end", hide: "md", sort: (p) => p.docs, cell: (p) => p.docs },
            { key: "inv", header: t(kind === "ar" ? "Invoiced" : "Billed"), align: "end", hide: "lg", sort: (p) => p.invoiced, cell: (p) => fmt(p.invoiced) },
            { key: "set", header: t(c.settled), align: "end", hide: "lg", sort: (p) => p.settled, cell: (p) => fmt(p.settled) },
            { key: "bal", header: t("Balance"), align: "end", sort: (p) => p.balance, cell: (p) => <span className="font-semibold">{fmt(p.balance)}</span> },
            { key: "od", header: t("Overdue"), align: "end", hide: "sm", sort: (p) => p.overdue, cell: (p) => (p.overdue ? <span className="text-rose-600">{fmt(p.overdue)}</span> : <span className="text-slate-300">—</span>) },
            { key: "age", header: t("Oldest"), sort: (p) => p.oldestDays, cell: (p) => (p.balance === 0 ? <Badge tone="slate">{t("Settled")}</Badge> : p.oldestDays ? <Badge tone={p.oldestDays > 60 ? "rose" : "amber"} dot>{t("{n}d overdue", { n: p.oldestDays })}</Badge> : <Badge tone="emerald" dot>{t("Current")}</Badge>) },
            { key: "last", header: t("Last activity"), hide: "lg", sort: (p) => p.lastDate, cell: (p) => <span className="num text-slate-500">{p.lastDate}</span> },
          ]}
          actions={(p) => <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setStmt(p)}><FileText size={13} />{t("Statement")}</button>} />
      ) : (
        <DataTable title={t(c.docs)} rows={L.items} rowKey={(i) => i.jid} onRowClick={(i) => setJid(i.jid)} initialSort={{ key: "due", dir: "asc" }}
          search={(i) => `${i.ref} ${i.party} ${i.memo}`}
          filters={[
            { key: "b", label: t("Ageing"), options: BUCKETS.map((b, i) => ({ value: String(i), label: t(b) })), get: (i) => String(i.overdueDays <= 0 ? 0 : i.overdueDays <= 30 ? 1 : i.overdueDays <= 60 ? 2 : i.overdueDays <= 90 ? 3 : 4) },
            { key: "p", label: t(c.party), options: L.parties.filter((p) => p.balance > 0).map((p) => ({ value: p.party, label: p.party })), get: (i) => i.party },
          ]}
          cols={[
            { key: "ref", header: t(c.doc), sort: (i) => i.ref, cell: (i) => <span className="font-mono text-xs font-medium" dir="ltr">{i.ref}</span> },
            { key: "p", header: t(c.party), sort: (i) => i.party, cell: (i) => <span className="truncate block max-w-56">{i.party}</span> },
            { key: "date", header: t("Date"), hide: "md", sort: (i) => i.date, cell: (i) => <span className="num text-slate-600">{i.date}</span> },
            { key: "due", header: t("Due"), sort: (i) => i.due, cell: (i) => <span className="num text-slate-600">{i.due}</span> },
            { key: "orig", header: t("Original"), align: "end", hide: "lg", sort: (i) => i.original, cell: (i) => fmt(i.original) },
            { key: "open", header: t("Open"), align: "end", sort: (i) => i.open, cell: (i) => <span className="font-semibold">{fmt(i.open)}</span> },
            { key: "st", header: t("Status"), sort: (i) => i.overdueDays, cell: statusBadge },
          ]}
          actions={(i) => <button className="btn-ghost !py-1 !px-2 !text-xs" disabled={!canSettle} title={canSettle ? undefined : t("Your role cannot approve.")} onClick={() => settle([i])}>{kind === "ar" ? <HandCoins size={13} /> : <Wallet size={13} />}{t(c.settle)}</button>} />
      )}

      {stmt && <Statement kind={kind} row={L.parties.find((p) => p.party === stmt.party) ?? stmt} onClose={() => setStmt(null)} onOpenJournal={setJid} onSettle={settle} canSettle={canSettle} />}
      {jid && <JournalModal j={store.state.journals.find((x) => x.id === jid)!} onClose={() => setJid(null)} />}
      <Modal open={run} onClose={() => setRun(false)} title={t("Payment run")}
        footer={<><span className="me-auto text-sm font-semibold num">{t("Total")}: {fmt(runItems.reduce((s, i) => s + i.open, 0), { aed: true })}</span><button className="btn-ghost" onClick={() => setRun(false)}>{t("Cancel")}</button><button className="btn-primary" disabled={!canSettle} onClick={() => { settle(runItems); setRun(false); }}>{t("Pay {n} bills", { n: runItems.length })}</button></>}>
        <p className="text-sm text-slate-500 mb-3">{t("Bills overdue or due within 7 days. Posting records Dr Trade payables / Cr Bank — no money is moved.")}</p>
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">{runItems.map((i) => <li key={i.jid} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="font-mono text-xs" dir="ltr">{i.ref}</span><span className="flex-1 truncate text-slate-600">{i.party}</span>{statusBadge(i)}<span className="num font-medium">{fmt(i.open)}</span></li>)}</ul>
        {!canSettle && <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t("Your role cannot approve — switch role in the sidebar.")}</p>}
      </Modal>
    </>
  );
}

function Statement({ kind, row, onClose, onOpenJournal, onSettle, canSettle }: { kind: Kind; row: PartyRow; onClose: () => void; onOpenJournal: (id: string) => void; onSettle: (i: OpenItem[]) => void; canSettle: boolean }) {
  const { t } = useI18n();
  const c = CFG[kind];
  let run = 0;
  const lines = row.moves.map((m) => { run += m.kind === "doc" ? m.amount : -m.amount; return { ...m, running: run }; });
  const open = row.items.filter((i) => i.open > 0);
  const csv = () => {
    const rows = [["Date", "Ref", "Memo", kind === "ar" ? "Invoice" : "Bill", kind === "ar" ? "Receipt" : "Payment", "Balance"], ...lines.map((l) => [l.date, l.ref, l.memo, l.kind === "doc" ? (l.amount / 100).toFixed(2) : "", l.kind === "settlement" ? (l.amount / 100).toFixed(2) : "", (l.running / 100).toFixed(2)])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `statement-${row.party.replace(/\W+/g, "-")}.csv`; a.click();
  };
  return (
    <Modal open onClose={onClose} title={t("Statement of account — {p}", { p: row.party })} wide
      footer={<><button className="btn-ghost" onClick={csv}><Download size={15} />{t("Export CSV")}</button>{open.length > 0 && <button className="btn-primary" disabled={!canSettle} onClick={() => { onSettle(open); onClose(); }}>{t(kind === "ar" ? "Receive full balance" : "Pay full balance")} · {fmt(row.balance)}</button>}</>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {([[kind === "ar" ? "Invoiced" : "Billed", row.invoiced], [c.settled, row.settled], ["Balance", row.balance], ["Overdue", row.overdue]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-2.5"><div className="text-[11px] text-slate-500">{t(l)}</div><div className={cx("font-semibold num", l === "Overdue" && v > 0 && "text-rose-600")}>{fmt(v)}</div></div>
        ))}
      </div>
      <DataTable rows={[...lines].reverse()} rowKey={(l) => l.jid + l.kind} onRowClick={(l) => onOpenJournal(l.jid)} pageSize={10}
        cols={[
          { key: "d", header: t("Date"), cell: (l) => <span className="num text-slate-600">{l.date}</span> },
          { key: "r", header: t("Ref"), cell: (l) => <span className="font-mono text-xs" dir="ltr">{l.ref}</span> },
          { key: "k", header: t("Type"), hide: "sm", cell: (l) => <Badge tone={l.kind === "doc" ? (kind === "ar" ? "sky" : "amber") : "emerald"}>{t(l.kind === "doc" ? c.doc : kind === "ar" ? "Receipt" : "Payment")}</Badge> },
          { key: "dr", header: t(kind === "ar" ? "Invoice" : "Bill"), align: "end", cell: (l) => (l.kind === "doc" ? fmt(l.amount) : "") },
          { key: "cr", header: t(kind === "ar" ? "Receipt" : "Payment"), align: "end", cell: (l) => (l.kind === "settlement" ? fmt(l.amount) : "") },
          { key: "b", header: t("Balance"), align: "end", cell: (l) => <span className="font-medium">{fmt(l.running)}</span> },
        ]} />
      <p className="text-xs text-slate-400 mt-3">{t("Click a line to open the journal entry in the general ledger.")}</p>
    </Modal>
  );
}
