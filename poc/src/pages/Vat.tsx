import { useMemo, useState } from "react";
import { ChevronRight, AlertTriangle, BarChart3, MapPin, Landmark, ShieldOff, Receipt } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { posted } from "../lib/ledger";
import { buildVat201, quarters, BOX_LABEL, type BoxVal } from "../lib/vat";
import { fmt } from "../lib/money";
import { daysBetween, TODAY } from "../lib/derive";
import { Badge, Card, DataTable, KpiGrid, Modal, Num, PageHeader, Select, Stat } from "../components/ui";
import { C, axis, tipStyle, aedK } from "../components/charts";
import type { Org } from "../lib/types";

export function Vat({ org }: { org: Org }) {
  const store = useStore();
  const { t, em, xDir, yDir } = useI18n();
  const qs = quarters(2026).slice(0, 3);
  const [qk, setQk] = useState(qs[2].key);
  const q = qs.find((x) => x.key === qk)!;
  const v = useMemo(() => buildVat201(posted(store.state.journals, org.id, q.from, q.to)), [store.state.journals, org.id, q]);
  const trend = useMemo(() => qs.map((x) => { const r = buildVat201(posted(store.state.journals, org.id, x.from, x.to)); return { q: x.label.split(" ")[0], output: r.box12 / 100, input: r.box13 / 100, net: r.box14 / 100 }; }), [store.state.journals, org.id, qs]);
  const EK = { "1a": "AUH", "1b": "DXB", "1c": "SHJ", "1d": "AJM", "1e": "UAQ", "1f": "RAK", "1g": "FUJ" } as const;
  const em7 = (Object.keys(EK) as (keyof typeof EK)[]).map((k) => ({ k, name: em(EK[k]), v: v.boxes[k].amount })).filter((x) => x.v > 0);
  const emMax = Math.max(1, ...em7.map((x) => x.v));
  const [drill, setDrill] = useState<{ title: string; b: BoxVal } | null>(null);
  const boxLabel = (k: string) => (k in EK ? t("Standard rated supplies — {e}", { e: em(EK[k as keyof typeof EK]) }) : t(BOX_LABEL[k]));
  const R = ({ box, b, vatCol = true }: { box: string; b: BoxVal; vatCol?: boolean }) => (
    <tr tabIndex={0} className="hover:bg-emerald-50/40 focus-visible:bg-emerald-50/60 outline-none cursor-pointer group transition-colors" onClick={() => setDrill({ title: `${t("Box")} ${box} — ${boxLabel(box)}`, b })} onKeyDown={(e) => e.key === "Enter" && setDrill({ title: `${t("Box")} ${box} — ${boxLabel(box)}`, b })}>
      <td className="td w-14"><Badge tone="indigo">{box}</Badge></td><td className="td">{boxLabel(box)} <span className="text-xs text-slate-400 num">({b.refs.length})</span></td>
      <td className="td text-end num">{fmt(b.amount)}</td><td className="td text-end num">{fmt(vatCol ? b.vat : 0)}</td><td className="td w-8"><ChevronRight size={15} className="text-slate-300 rtl:rotate-180 group-hover:text-emerald-600 transition" /></td>
    </tr>
  );
  const Head = ({ c4 }: { c4: string }) => <thead><tr><th className="th">{t("Box")}</th><th className="th">{t("Description")}</th><th className="th !text-end">{t("Amount")}</th><th className="th !text-end">{c4}</th><th className="th" /></tr></thead>;
  return (
    <>
      <PageHeader eyebrow={t("Tax")} title={t("VAT 201 return")} sub={t("Generated from posted journals only · config {v} · FDL 8/2017", { v: v.configVersion })}
        actions={<Select aria-label={t("Tax period")} className="w-64" value={qk} onChange={(e) => setQk(e.target.value)}>{qs.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.from} → {x.to})</option>)}</Select>} />
      <KpiGrid>
        <Stat label={t("Box 12 · Total due tax")} value={<Num v={v.box12} f={(n) => fmt(n, { aed: true })} />} tone="sky" icon={<Receipt size={16} />} />
        <Stat label={t("Box 13 · Recoverable tax")} value={<Num v={v.box13} f={(n) => fmt(n, { aed: true })} />} tone="violet" icon={<Landmark size={16} />} />
        <Stat label={t(v.box14 >= 0 ? "Box 14 · Payable" : "Box 14 · Refundable")} value={<Num v={Math.abs(v.box14)} f={(n) => fmt(n, { aed: true })} />} tone="amber" icon={<Landmark size={16} />} hint={t("Due {date} · {n} days", { date: q.due, n: daysBetween(TODAY, q.due) })} />
        <Stat label={t("Blocked input VAT (not claimed)")} value={<Num v={v.blocked.vat} f={(n) => fmt(n, { aed: true })} />} tone="rose" icon={<ShieldOff size={16} />} hint={t("Entertainment / personal — Art 53")} onClick={() => setDrill({ title: t("Blocked input VAT (not claimed)"), b: v.blocked })} />
      </KpiGrid>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title={t("VAT by quarter")} sub={t("Output vs recoverable input, AED")} className="xl:col-span-2" icon={<BarChart3 size={16} />} hover>
          <div className="h-56" dir="ltr"><ResponsiveContainer>
            <BarChart data={trend} margin={{ left: -6, top: 8 }} barGap={4}>
              <defs>
                <linearGradient id="vo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b9be6" /><stop offset="1" stopColor={C.revenue} /></linearGradient>
                <linearGradient id="vi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6a97f" /><stop offset="1" stopColor={C.expenses} /></linearGradient>
                <linearGradient id="vn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd3a6" /><stop offset="1" stopColor={C.profit} /></linearGradient>
              </defs>
              <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="q" {...axis} {...xDir} /><YAxis {...axis} {...yDir} tickFormatter={aedK} />
              <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)", radius: 8 }} formatter={(x) => `AED ${Number(x).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="output" name={t("Output VAT")} fill="url(#vo)" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={1100} />
              <Bar dataKey="input" name={t("Input VAT")} fill="url(#vi)" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={1100} animationBegin={150} />
              <Bar dataKey="net" name={t("Net payable")} fill="url(#vn)" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={1100} animationBegin={300} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title={t("Standard-rated sales by emirate")} sub={`${q.label} · ${t("Box 1a–1g")}`} icon={<MapPin size={16} />} hover>
          <ul className="space-y-3 mt-1">{em7.map((x, i) => (
            <li key={x.k}><button className="w-full text-start group cursor-pointer" onClick={() => setDrill({ title: `${t("Box")} ${x.k} — ${boxLabel(x.k)}`, b: v.boxes[x.k] })}>
              <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 group-hover:text-slate-900 transition"><Badge tone="indigo">{x.k}</Badge> {x.name}</span><span className="num font-medium">{aedK(x.v / 100)}</span></div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full grow-x bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-400 to-blue-600" style={{ width: `${(x.v / emMax) * 100}%`, animationDelay: `${i * 0.08}s` }} /></div>
            </button></li>))}
            {!em7.length && <li className="text-sm text-slate-400">{t("No standard-rated sales this quarter.")}</li>}
          </ul>
        </Card>
      </div>
      {v.warnings.map((w) => <div key={w} className="mb-2 text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-2 flex gap-2"><AlertTriangle size={16} />{w}</div>)}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={t("VAT on sales and all other outputs")} pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><Head c4={t("VAT")} />
            <tbody>{(["1a", "1b", "1c", "1d", "1e", "1f", "1g", "3", "4", "5"] as const).map((k) => <R key={k} box={k} b={v.boxes[k]} vatCol={!["4", "5"].includes(k)} />)}
              <tr className="font-semibold bg-slate-50/70"><td className="td"><Badge tone="indigo">8</Badge></td><td className="td">{t("Totals")}</td><td className="td text-end num">{fmt(v.box8.amount)}</td><td className="td text-end num">{fmt(v.box8.vat)}</td><td /></tr></tbody></table></div>
        </Card>
        <div className="space-y-4">
          <Card title={t("VAT on expenses and all other inputs")} pad={false}>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><Head c4={t("Recoverable VAT")} />
              <tbody><R box="9" b={v.boxes["9"]} /><R box="10" b={v.boxes["10"]} />
                <tr className="font-semibold bg-slate-50/70"><td className="td"><Badge tone="indigo">11</Badge></td><td className="td">{t("Totals")}</td><td className="td text-end num">{fmt(v.box11.amount)}</td><td className="td text-end num">{fmt(v.box11.vat)}</td><td /></tr></tbody></table></div>
          </Card>
          <Card title={t("Net VAT due")} hover>
            <div className="space-y-2">
              {([["12", "Total value of due tax", v.box12], ["13", "Total value of recoverable tax", v.box13]] as const).map(([b, l, x]) => <div key={b} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Badge tone="indigo">{b}</Badge>{t(l)}</span><span className="num">{fmt(x)}</span></div>)}
              <div className="flex items-center justify-between font-semibold text-base rounded-xl bg-gradient-to-r rtl:bg-gradient-to-l from-amber-50 to-transparent px-3 py-2.5 ring-1 ring-amber-100"><span className="flex items-center gap-2"><Badge tone="amber">14</Badge>{t("Payable / (refundable) tax")}</span><span className="num">{fmt(v.box14)}</span></div>
            </div>
            <p className="text-xs text-slate-400 mt-3">{t("Box mapping must be re-verified against the live EmaraTax VAT 201 form before filing — VERIFY. Filing is done by the tax agent on EmaraTax after partner review.")}</p>
          </Card>
        </div>
      </div>
      {drill && <Modal open onClose={() => setDrill(null)} title={drill.title} wide>
        <DataTable rows={drill.b.refs} rowKey={(r) => r.jid + r.ref + r.amount} search={(r) => `${r.ref} ${r.memo}`} initialSort={{ key: "d", dir: "asc" }}
          empty={<p className="text-sm text-slate-400 text-center py-8">{t("No transactions in this box.")}</p>}
          cols={[
            { key: "d", header: t("Date"), sort: (r) => r.date, cell: (r) => <span className="num">{r.date}</span> },
            { key: "r", header: t("Ref"), cell: (r) => <span className="font-mono text-xs" dir="ltr">{r.ref}</span> },
            { key: "m", header: t("Memo"), hide: "sm", cell: (r) => <span className="truncate block max-w-72">{r.memo}</span> },
            { key: "a", header: t("Amount"), align: "end", sort: (r) => r.amount, cell: (r) => fmt(r.amount) },
            { key: "v", header: t("VAT"), align: "end", sort: (r) => r.vat, cell: (r) => fmt(r.vat) },
          ]} />
      </Modal>}
    </>
  );
}
