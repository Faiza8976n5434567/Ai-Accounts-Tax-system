import { useState } from "react";
import { Plus, Trash2, RotateCcw, Sparkles, CheckCircle2, BookOpen, Cpu, Clock, Scale } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, USERS } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { COA, ACC } from "../lib/coa";
import { accountLedger, posted, trialBalance } from "../lib/ledger";
import { fmt, toFils, compact } from "../lib/money";
import { Badge, Card, DataTable, Field, IconButton, Input, KpiGrid, Modal, Num, PageHeader, Select, Stat, Tabs } from "../components/ui";
import { C, axis, tipStyle, aedK } from "../components/charts";
import { StatusBadge } from "./Capture";
import type { Journal, Org } from "../lib/types";

const total = (j: Journal) => j.lines.reduce((s, l) => s + l.debit, 0);

export function Ledger({ org }: { org: Org }) {
  const store = useStore();
  const { t, accFull, xDir, yDir } = useI18n();
  const [tab, setTab] = useState<"journals" | "account">("journals");
  const [acc, setAcc] = useState("1010");
  const [openId, setOpenId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const js = store.state.journals.filter((j) => j.orgId === org.id);
  const al = accountLedger(posted(store.state.journals, org.id), acc);
  const tb = trialBalance(posted(store.state.journals, org.id));
  const balance = tb.find((r) => r.code === acc)?.balance ?? 0;
  const aiCount = js.filter((j) => j.ai).length;

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("General ledger")} sub={t("Single source of truth. Posted journals are immutable — corrections by reversal only.")}
        actions={<><Tabs value={tab} onChange={setTab} items={[{ id: "journals", label: t("Journals") }, { id: "account", label: t("Account ledger") }]} /><button className="btn-primary" onClick={() => setManual(true)}><Plus size={15} />{t("Manual journal")}</button></>} />
      <KpiGrid>
        <Stat label={t("Journals")} value={<Num v={js.length} f={String} />} icon={<BookOpen size={16} />} tone="sky" hint={t("{n} posted", { n: js.filter((j) => j.status === "POSTED").length })} />
        <Stat label={t("AI-prepared")} value={`${js.length ? Math.round((aiCount / js.length) * 100) : 0}%`} icon={<Cpu size={16} />} tone="violet" hint={t("{n} journals", { n: aiCount })} />
        <Stat label={t("Pending approval")} value={<Num v={js.filter((j) => j.status === "PENDING").length} f={String} />} icon={<Clock size={16} />} tone="amber" hint={t("Maker-checker")} />
        <Stat label={t("Trial balance")} value={t("Balanced")} icon={<Scale size={16} />} tone="emerald" hint={`Dr = Cr = ${compact(tb.reduce((s, r) => s + r.debit, 0))}`} />
      </KpiGrid>

      {tab === "journals" ? (
        <DataTable title={t("Journal entries")} rows={js} rowKey={(j) => j.id} onRowClick={(j) => setOpenId(j.id)} initialSort={{ key: "date", dir: "desc" }} pageSize={15}
          search={(j) => `${j.ref} ${j.memo} ${j.preparedBy}`}
          filters={[
            { key: "src", label: t("Source"), options: ["PURCHASE", "SALE", "BANK", "MANUAL", "OPENING", "REVERSAL"].map((x) => ({ value: x, label: t(x) })), get: (j) => j.source },
            { key: "st", label: t("Status"), options: ["POSTED", "PENDING", "REVERSED"].map((x) => ({ value: x, label: t(x) })), get: (j) => j.status },
            { key: "ai", label: t("AI"), options: [{ value: "y", label: t("AI-prepared") }, { value: "n", label: t("Human") }], get: (j) => (j.ai ? "y" : "n") },
          ]}
          cols={[
            { key: "date", header: t("Date"), sort: (j) => j.date + j.id, cell: (j) => <span className="num text-slate-600 whitespace-nowrap">{j.date}</span> },
            { key: "ref", header: t("Ref"), sort: (j) => j.ref, cell: (j) => <span className="font-medium font-mono text-xs whitespace-nowrap" dir="ltr">{j.ref}</span> },
            { key: "memo", header: t("Memo"), cell: (j) => <span className="flex items-center gap-1.5 max-w-80"><span className="truncate">{j.memo}</span>{j.ai && <Badge tone="violet"><Sparkles size={10} />{t("AI")}</Badge>}</span> },
            { key: "src", header: t("Source"), hide: "md", sort: (j) => j.source, cell: (j) => <Badge>{t(j.source)}</Badge> },
            { key: "amt", header: t("Amount"), align: "end", sort: total, cell: (j) => fmt(total(j)) },
            { key: "st", header: t("Status"), sort: (j) => j.status, cell: (j) => <StatusBadge s={j.status} /> },
            { key: "by", header: t("Prepared / approved"), hide: "lg", cell: (j) => <span className="text-xs text-slate-500 leading-tight block">{j.preparedBy}<br />{j.approvedBy ?? "—"}</span> },
          ]} />
      ) : (
        <div className="space-y-4">
          <Card title={accFull(acc)} sub={t("Running balance, posted journals")} actions={<Select aria-label={t("Account")} className="w-56 sm:w-80" value={acc} onChange={(e) => setAcc(e.target.value)}>{COA.map((a) => <option key={a.code} value={a.code}>{accFull(a.code)}</option>)}</Select>} hover>
            <div className="flex flex-wrap items-end gap-6 mb-3">
              <div><div className="text-xs text-slate-500">{t("Closing balance")}</div><div className="text-2xl font-semibold num"><Num v={balance} f={(n) => fmt(n, { aed: true })} /></div></div>
              <div><div className="text-xs text-slate-500">{t("Entries")}</div><div className="text-lg font-semibold num">{al.length}</div></div>
              <Badge tone="indigo">{t(ACC[acc]?.type ?? "")}</Badge>
            </div>
            <div className="h-48" dir="ltr"><ResponsiveContainer>
              <AreaChart data={al.map((r) => ({ d: r.j.date, v: r.running / 100 }))} margin={{ left: -6, top: 4 }}>
                <defs><linearGradient id="ab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.profit} stopOpacity={0.35} /><stop offset="1" stopColor={C.profit} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="d" {...axis} {...xDir} minTickGap={40} /><YAxis {...axis} {...yDir} tickFormatter={aedK} />
                <Tooltip {...tipStyle} formatter={(v) => `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
                <Area type="stepAfter" dataKey="v" name={t("Balance")} stroke={C.profit} strokeWidth={2} fill="url(#ab)" animationDuration={1100} />
              </AreaChart>
            </ResponsiveContainer></div>
          </Card>
          <DataTable rows={[...al].reverse()} rowKey={(r) => r.j.id + r.running} onRowClick={(r) => setOpenId(r.j.id)} search={(r) => `${r.j.ref} ${r.j.memo}`} pageSize={15}
            cols={[
              { key: "d", header: t("Date"), sort: (r) => r.j.date, cell: (r) => <span className="num text-slate-600">{r.j.date}</span> },
              { key: "r", header: t("Ref"), cell: (r) => <span className="font-mono text-xs" dir="ltr">{r.j.ref}</span> },
              { key: "m", header: t("Memo"), hide: "sm", cell: (r) => <span className="truncate block max-w-80">{r.j.memo}</span> },
              { key: "dr", header: t("Debit"), align: "end", sort: (r) => r.l.debit, cell: (r) => (r.l.debit ? fmt(r.l.debit) : "") },
              { key: "cr", header: t("Credit"), align: "end", sort: (r) => r.l.credit, cell: (r) => (r.l.credit ? fmt(r.l.credit) : "") },
              { key: "b", header: t("Balance"), align: "end", cell: (r) => <span className="font-medium">{fmt(r.running)}</span> },
            ]} />
        </div>
      )}
      {openId && <JournalModal j={store.state.journals.find((x) => x.id === openId)!} onClose={() => setOpenId(null)} />}
      {manual && <ManualJournal org={org} onClose={() => setManual(false)} />}
    </>
  );
}

export function JournalModal({ j, onClose }: { j: Journal; onClose: () => void }) {
  const store = useStore();
  const { t, tx, accFull } = useI18n();
  const doc = store.state.purchases.find((p) => p.id === j.docId);
  const canReverse = j.status === "POSTED" && j.source !== "REVERSAL" && USERS[store.state.session.role].firm;
  return (
    <Modal open onClose={onClose} title={`${j.ref} · ${j.date}`} wide
      footer={<>
        {j.status === "PENDING" && <button className="btn-primary" onClick={() => store.approveJournal(j.id)}><CheckCircle2 size={15} />{t("Approve & post")}</button>}
        {canReverse && <button className="btn-danger" onClick={() => { store.reverseJournal(j.id); onClose(); }}><RotateCcw size={15} />{t("Reverse")}</button>}
        <button className="btn-ghost" onClick={onClose}>{t("Close")}</button>
      </>}>
      <div className="flex flex-wrap gap-2 mb-3"><StatusBadge s={j.status} /><Badge>{t(j.source)}</Badge>{j.reversalOf && <Badge tone="slate">{t("Reverses {id}", { id: j.reversalOf })}</Badge>}</div>
      <p className="text-sm text-slate-700 mb-4">{j.memo}</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100"><table className="w-full min-w-[520px]"><thead><tr><th className="th">{t("Account")}</th><th className="th">{t("Tax")}</th><th className="th !text-end">{t("Debit")}</th><th className="th !text-end">{t("Credit")}</th></tr></thead>
        <tbody>{j.lines.map((l, i) => <tr key={i}><td className="td">{accFull(l.account)}</td><td className="td">{l.taxCode && <Badge tone="sky">{l.taxCode}{l.emirate ? ` · ${l.emirate}` : ""}{l.vat ? ` · ${t("VAT")} ${fmt(l.vat)}` : ""}</Badge>}</td><td className="td text-end num">{l.debit ? fmt(l.debit) : ""}</td><td className="td text-end num">{l.credit ? fmt(l.credit) : ""}</td></tr>)}
          <tr className="font-semibold bg-slate-50/60"><td className="td" colSpan={2}>{t("Total")}</td><td className="td text-end num">{fmt(total(j))}</td><td className="td text-end num">{fmt(j.lines.reduce((s, l) => s + l.credit, 0))}</td></tr></tbody></table></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="label">{t("Audit")}</div>{t("Prepared by")} <b>{j.preparedBy}</b><br />{t("Approved by")} <b>{j.approvedBy ?? "—"}</b>{j.postedAt && <><br />{t("Posted")} <span className="num">{j.postedAt.slice(0, 16).replace("T", " ")}</span></>}</div>
        {j.ai && <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50/40 p-3 text-violet-900 ring-1 ring-violet-100"><div className="label !text-violet-500">{t("AI involvement · {n}%", { n: Math.round(j.ai.confidence * 100) })}</div>{tx(j.ai.reasoning)}{doc && <div className="mt-1 text-xs">{t("Source")}: {doc.fileName} · {t(`${doc.risk} risk`)}</div>}</div>}
      </div>
      {j.status === "POSTED" && !canReverse && j.source !== "REVERSAL" && <p className="text-xs text-slate-400 mt-3">{t("Only firm users can reverse posted journals.")}</p>}
    </Modal>
  );
}

function ManualJournal({ org, onClose }: { org: Org; onClose: () => void }) {
  const store = useStore();
  const { t, accFull } = useI18n();
  const [date, setDate] = useState("2026-09-30");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ account: "6010", dr: "", cr: "" }, { account: "2500", dr: "", cr: "" }]);
  const dr = lines.reduce((s, l) => s + toFils(l.dr || 0), 0), cr = lines.reduce((s, l) => s + toFils(l.cr || 0), 0);
  const set = (i: number, p: Partial<(typeof lines)[0]>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const ok = !!memo && dr === cr && dr > 0;
  return (
    <Modal open onClose={onClose} title={t("Manual journal")} wide
      footer={<><span className="me-auto text-xs text-slate-500">{t(USERS[store.state.session.role].canApprove ? "You can approve — will post immediately." : "Will be saved as PENDING for maker-checker approval.")}</span>
        <button className="btn-ghost" onClick={onClose}>{t("Cancel")}</button>
        <button className="btn-primary" disabled={!ok} onClick={() => { if (store.postManual(org.id, date, memo, lines.map((l) => ({ account: l.account, debit: toFils(l.dr || 0), credit: toFils(l.cr || 0) })))) onClose(); }}>{t("Save journal")}</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label={t("Date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("Narration")} className="sm:col-span-2"><Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t("e.g. Accrual for audit fee")} /></Field>
      </div>
      <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">{t("Account")}</th><th className="th w-40">{t("Debit")}</th><th className="th w-40">{t("Credit")}</th><th className="th w-10" /></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={i}><td className="p-2"><Select aria-label={t("Account")} value={l.account} onChange={(e) => set(i, { account: e.target.value })}>{COA.map((a) => <option key={a.code} value={a.code}>{accFull(a.code)}</option>)}</Select></td>
            <td className="p-2"><Input aria-label={t("Debit")} inputMode="decimal" value={l.dr} onChange={(e) => set(i, { dr: e.target.value, cr: "" })} placeholder="0.00" /></td>
            <td className="p-2"><Input aria-label={t("Credit")} inputMode="decimal" value={l.cr} onChange={(e) => set(i, { cr: e.target.value, dr: "" })} placeholder="0.00" /></td>
            <td className="p-2">{lines.length > 2 && <IconButton label={t("Remove line")} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="hover:!text-rose-600 hover:!bg-rose-50"><Trash2 size={15} /></IconButton>}</td></tr>))}
          <tr className="font-semibold text-sm bg-slate-50/70"><td className="p-3">{t("Totals")} {dr === cr && dr > 0 ? <Badge tone="emerald" dot>{t("Balanced")}</Badge> : <Badge tone="rose" dot>{t("Out by {amt}", { amt: fmt(Math.abs(dr - cr)) })}</Badge>}</td><td className="p-3 num">{fmt(dr)}</td><td className="p-3 num">{fmt(cr)}</td><td /></tr></tbody></table></div>
        <div className="px-3 py-2 border-t border-slate-100"><button className="btn-ghost !text-xs !py-1" onClick={() => setLines([...lines, { account: "6130", dr: "", cr: "" }])}><Plus size={13} />{t("Add line")}</button></div>
      </div>
    </Modal>
  );
}
