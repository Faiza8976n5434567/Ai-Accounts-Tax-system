import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { TrendingUp, Wallet, ArrowDownRight, ArrowUpRight, Landmark, Calculator, AlertTriangle, Sparkles, FileWarning, ShieldAlert, CalendarClock, Banknote, ScanLine, Receipt, Cpu, ShieldCheck, BookOpen, FileBarChart, ChevronRight, Workflow } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { useOrgData, deadlines, daysBetween, TODAY } from "../lib/derive";
import { fmt, compact } from "../lib/money";
import { ask } from "../lib/ai";
import { Badge, Card, Gauge, Num, Stat, cx } from "../components/ui";
import { FlowDiagram, curve } from "../components/FlowDiagram";
import { C, SERIES, axis, tipStyle, aedK } from "../components/charts";
import type { Org } from "../lib/types";
import type { Page } from "../components/Layout";

export function Dashboard({ org, go }: { org: Org; go: (p: Page) => void }) {
  const { state } = useStore();
  const { t, acc, mon, orgName, xDir, yDir, rtl } = useI18n();
  const d = useOrgData(org)!;
  const monData = d.mon.map((m) => ({ ...m, label: mon(m.month) }));
  const last = d.mon[8].pl, prev = d.mon[7].pl;
  const pct = (a: number, b: number) => (b ? `${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(1)}%` : "—");
  const insight = useMemo(() => ask("why did profit change", { journals: d.ytd, monthly: d.mon, ageing: d.ageing, vatNet: d.vat.box14 }, t, acc, mon), [d, t]);
  const dl = deadlines(state).filter((x) => x.orgId === org.id && x.date >= TODAY).slice(0, 5);
  const opex = d.pl.opexLines.slice(0, 6);
  const opexOther = d.pl.opexLines.slice(6).reduce((s, [, v]) => s + v, 0);
  const pie = [...opex.map(([n, v]) => ({ n: acc(n), v: v / 100 })), ...(opexOther ? [{ n: t("Other"), v: opexOther / 100 }] : [])];
  const pieTotal = pie.reduce((s, p) => s + p.v, 0);
  const [activePie, setActivePie] = useState(0);
  const grossM = (d.pl.gross / d.pl.revenue) * 100, netM = (d.pl.net / d.pl.revenue) * 100;
  const recovery = d.vat.box12 ? (d.vat.box13 / d.vat.box12) * 100 : 0;
  const collected = (() => { const tot = d.ageing.reduce((s, a) => s + a.amount, 0); return d.pl.revenue ? 100 - (tot / (d.pl.revenue * 1.05)) * 100 : 100; })();
  const hour = 9;

  const flowNodes = [
    { id: "docs", x: 85, y: 55, title: t("Purchase invoices"), metric: <Num v={d.counts.docs} f={String} />, sub: t("PDF · image · XML · WhatsApp"), icon: <ScanLine size={15} />, tone: "sky", onClick: () => go("capture"), detail: t("Supplier invoices uploaded or forwarded — read by Document AI") },
    { id: "sales", x: 85, y: 150, title: t("Sales invoices"), metric: <Num v={d.counts.sales} f={String} />, sub: t("Tax invoices issued"), icon: <Receipt size={15} />, tone: "sky", onClick: () => go("sales"), detail: t("Bilingual tax invoices; PINT AE e-invoices via ASP") },
    { id: "bank", x: 85, y: 245, title: t("Bank feed"), metric: <Num v={d.counts.bank} f={String} />, sub: t("{n} unreconciled", { n: d.unmatched }), icon: <Banknote size={15} />, tone: "sky", onClick: () => go("bank"), detail: t("Statement lines auto-matched to ledger entries") },
    { id: "ai", x: 300, y: 150, title: t("AI extraction & coding"), metric: <><Num v={d.counts.aiJournals} f={String} /> {t("AI-coded")}</>, sub: t("Classify · VAT · CT tags"), icon: <Cpu size={15} />, tone: "violet", onClick: () => go("capture"), detail: t("AI proposes the account, VAT code and CT treatment with a confidence score") },
    { id: "rules", x: 500, y: 150, title: t("Rules & approval"), metric: <>{t("{n} pending", { n: d.counts.pending })}</>, sub: t("Art 59 · maker-checker"), icon: <ShieldCheck size={15} />, tone: "amber", onClick: () => go("capture"), detail: t("Deterministic checks + human approval above tenant thresholds") },
    { id: "gl", x: 700, y: 150, title: t("General ledger"), metric: <><Num v={d.counts.journals} f={String} /> {t("journals")}</>, sub: t("Dr = Cr · immutable"), icon: <BookOpen size={15} />, tone: "emerald", onClick: () => go("ledger"), detail: t("Single source of truth — every report reads only posted journals") },
    { id: "vat", x: 915, y: 55, title: t("VAT 201 · Q3"), metric: <Num v={d.vat.box14} f={compact} />, sub: t("Due {date}", { date: d.curQ.due }), icon: <Landmark size={15} />, tone: "indigo", onClick: () => go("vat"), detail: t("Return boxes populate automatically with drill-down") },
    { id: "ct", x: 915, y: 150, title: t("Corporate tax"), metric: <Num v={d.ct.ct} f={compact} />, sub: t("FY2026 estimate"), icon: <Calculator size={15} />, tone: "indigo", onClick: () => go("ct"), detail: t("Rules-based bridge from accounting profit to taxable income") },
    { id: "fs", x: 915, y: 245, title: t("Financial statements"), metric: <Num v={d.pl.net} f={compact} />, sub: t("Net profit YTD"), icon: <FileBarChart size={15} />, tone: "indigo", onClick: () => go("reports"), detail: t("P&L, balance sheet and trial balance in real time") },
  ];
  const flowEdges = [
    { from: "docs", to: "ai", d: curve(160, 55, 225, 150) }, { from: "sales", to: "ai", d: curve(160, 150, 225, 150) }, { from: "bank", to: "ai", d: curve(160, 245, 225, 150) },
    { from: "ai", to: "rules", d: curve(375, 150, 425, 150) }, { from: "rules", to: "gl", d: curve(575, 150, 625, 150) },
    { from: "gl", to: "vat", d: curve(775, 150, 840, 55) }, { from: "gl", to: "ct", d: curve(775, 150, 840, 150) }, { from: "gl", to: "fs", d: curve(775, 150, 840, 245) },
  ];

  return (
    <>
      {/* Hero */}
      <section className="hero relative overflow-hidden rounded-3xl text-white p-5 sm:p-7 mb-6 shadow-[0_24px_60px_-28px_rgba(7,13,26,.7)] fade-in">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute -end-10 -top-10 size-64 rounded-full bg-emerald-400/20 blur-3xl float" />
        <div className="relative grid grid-cols-1 xl:grid-cols-5 gap-6 items-center">
          <div className="xl:col-span-3">
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium"><span className="size-1.5 rounded-full bg-emerald-400 pulse-ring" />{t(hour < 12 ? "Good morning" : "Good afternoon")} · {t("Live from posted ledger · YTD Jan–Sep 2026")}</div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{orgName(org)}</h1>
            <div className="text-sm text-slate-400">{rtl ? org.name : org.nameAr}</div>
            <div className="mt-5 flex flex-wrap items-end gap-8">
              <div><div className="text-xs text-slate-400">{t("Net profit YTD")}</div><div className="text-3xl sm:text-4xl font-semibold tracking-tight num bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent"><Num v={d.pl.net} f={(n) => fmt(n, { aed: true, dp0: true })} ms={1400} /></div></div>
              <div><div className="text-xs text-slate-400">{t("Revenue")}</div><div className="text-xl font-semibold num"><Num v={d.pl.revenue} f={compact} /></div></div>
              <div><div className="text-xs text-slate-400">{t("Net margin")}</div><div className="text-xl font-semibold num">{netM.toFixed(1)}%</div></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn !bg-white !text-slate-900 hover:!-translate-y-px shadow-lg" onClick={() => go("capture")}><ScanLine size={15} />{t("Capture invoice")}</button>
              <button className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15" onClick={() => go("ask")}><Sparkles size={15} />{t("Ask your books")}</button>
              <button className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15" onClick={() => go("vat")}><Landmark size={15} />{t("VAT 201")}</button>
            </div>
          </div>
          <div className="xl:col-span-2 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-emerald-300 font-semibold"><Sparkles size={13} />{t("AI CFO insight · {a} vs {b}", { a: mon(d.mon[8].month), b: mon(d.mon[7].month) })}</div>
            <p className="mt-2 text-sm text-slate-200 leading-relaxed">{insight.text}</p>
            <ul className="mt-3 space-y-1.5">
              {insight.rows?.slice(0, 5).map((r) => {
                return <li key={r.label} className="flex items-center justify-between text-xs rounded-lg bg-white/5 px-2.5 py-1.5 hover:bg-white/10 transition"><span className="text-slate-300">{r.label}</span><b dir="ltr" className={cx("num", r.tone === "bad" ? "text-rose-300" : "text-emerald-300")}>{r.value}</b></li>;
              })}
            </ul>
            <div className="mt-2 text-[10px] text-slate-500">{t("Explained from journal lines · drill down in General ledger")}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        <Stat label={`${t("Revenue")} · ${mon(d.mon[8].month)}`} value={<Num v={last.revenue} f={compact} />} icon={<TrendingUp size={16} />} tone="sky" delta={{ v: `${pct(last.revenue, prev.revenue)} ${t("MoM")}`, up: last.revenue >= prev.revenue }} spark={d.mon.map((m) => m.revenue)} onClick={() => go("reports")} />
        <Stat label={`${t("Expenses")} · ${mon(d.mon[8].month)}`} value={<Num v={last.cogs + last.opex} f={compact} />} icon={<ArrowDownRight size={16} />} tone="amber" delta={{ v: `${pct(last.cogs + last.opex, prev.cogs + prev.opex)} ${t("MoM")}`, up: last.cogs + last.opex >= prev.cogs + prev.opex, good: last.cogs + last.opex < prev.cogs + prev.opex }} spark={d.mon.map((m) => m.expenses)} onClick={() => go("reports")} />
        <Stat label={`${t("Net profit")} · ${mon(d.mon[8].month)}`} value={<Num v={last.net} f={compact} />} icon={<ArrowUpRight size={16} />} tone="emerald" delta={{ v: `${pct(last.net, prev.net)} ${t("MoM")}`, up: last.net >= prev.net }} spark={d.mon.map((m) => m.profit)} onClick={() => go("reports")} />
        <Stat label={t("Cash at bank")} value={<Num v={d.cash} f={compact} />} icon={<Wallet size={16} />} tone="indigo" hint={`${t("AR")} ${compact(d.ar)} · ${t("AP")} ${compact(d.ap)}`} spark={d.cashSeries} onClick={() => go("bank")} />
      </div>

      <Card className="mt-4" icon={<Workflow size={16} />} title={t("How your numbers flow")} sub={t("Live pipeline — hover a step to trace it, click to open")} hover>
        <FlowDiagram nodes={flowNodes} edges={flowEdges} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title={t("Revenue vs expenses")} sub={t("Monthly, AED — from posted journals")} className="xl:col-span-2" hover icon={<TrendingUp size={16} />}>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={monData} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.revenue} stopOpacity={0.3} /><stop offset="1" stopColor={C.revenue} stopOpacity={0} /></linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.expenses} stopOpacity={0.22} /><stop offset="1" stopColor={C.expenses} stopOpacity={0} /></linearGradient>
                  <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.profit} stopOpacity={0.25} /><stop offset="1" stopColor={C.profit} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} {...xDir} />
                <YAxis {...axis} {...yDir} tickFormatter={aedK} />
                <Tooltip {...tipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} formatter={(v) => `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name={t("Revenue")} stroke={C.revenue} strokeWidth={2.5} fill="url(#gr)" activeDot={{ r: 6, strokeWidth: 3, stroke: "#fff" }} animationDuration={1400} />
                <Area type="monotone" dataKey="expenses" name={t("Expenses")} stroke={C.expenses} strokeWidth={2.5} fill="url(#ge)" activeDot={{ r: 6, strokeWidth: 3, stroke: "#fff" }} animationDuration={1400} animationBegin={200} />
                <Area type="monotone" dataKey="profit" name={t("Net profit")} stroke={C.profit} strokeWidth={2.5} fill="url(#gp)" activeDot={{ r: 6, strokeWidth: 3, stroke: "#fff" }} animationDuration={1400} animationBegin={400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={t("Where the money goes")} sub={t("Operating expenses YTD · hover a slice")} hover icon={<ArrowDownRight size={16} />}>
          <div className="h-48 relative">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="v" nameKey="n" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="#fff" strokeWidth={2} cornerRadius={4}
                  onMouseEnter={(_, i) => setActivePie(i)} animationDuration={1200}>
                  {pie.map((p, i) => <Cell key={p.n} fill={SERIES[i % 8]} style={{ opacity: activePie === i ? 1 : 0.4, transition: "opacity .3s", cursor: "pointer", outline: "none" }} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
              <div><div className="text-[11px] text-slate-500 max-w-24 truncate">{pie[activePie]?.n}</div><div className="text-base font-semibold num">{aedK(pie[activePie]?.v ?? 0)}</div><div className="text-[11px] text-slate-400">{((pie[activePie]?.v ?? 0) / pieTotal * 100).toFixed(1)}%</div></div>
            </div>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {pie.map((p, i) => <li key={p.n} onMouseEnter={() => setActivePie(i)} className={cx("flex items-center gap-1.5 text-[11px] rounded-md px-1.5 py-1 cursor-default transition", activePie === i ? "bg-slate-100 text-slate-900" : "text-slate-600")}><i className="size-2 rounded-full shrink-0" style={{ background: SERIES[i % 8] }} /><span className="truncate">{p.n}</span></li>)}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" title={t("Health gauges")} sub={t("Key ratios computed from the ledger")} hover>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 place-items-center">
          <Gauge value={grossM} label={t("Gross margin")} sub={`${t("GP")} ${compact(d.pl.gross)}`} color="#2a78d6" />
          <Gauge value={Math.max(0, netM)} label={t("Net margin")} sub={`${t("NP")} ${compact(d.pl.net)}`} color="#10b981" />
          <Gauge value={recovery} label={t("Input VAT recovery")} sub={t("Box 13 ÷ Box 12 · Q3")} color="#7c3aed" />
          <Gauge value={Math.max(0, collected)} label={t("Revenue collected")} sub={`${t("Open AR")} ${compact(d.ageing.reduce((s, a) => s + a.amount, 0))}`} color="#eb6834" />
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4 stagger">
        <Stat label={`${t("Output VAT")} · Q3`} value={<Num v={d.vat.box12} f={compact} />} icon={<Landmark size={16} />} tone="sky" hint={t("Box 8 total")} onClick={() => go("vat")} />
        <Stat label={`${t("Input VAT")} · Q3`} value={<Num v={d.vat.box13} f={compact} />} icon={<Landmark size={16} />} tone="violet" hint={`${t("Blocked")} ${compact(d.vat.blocked.vat)}`} onClick={() => go("vat")} />
        <Stat label={`${t("Net VAT payable")} · Q3`} value={<Num v={d.vat.box14} f={compact} />} icon={<Landmark size={16} />} tone="amber" hint={t("Due {date} · {n} days", { date: d.curQ.due, n: daysBetween(TODAY, d.curQ.due) })} onClick={() => go("vat")} />
        <Stat label={`${t("CT estimate")} FY2026`} value={<Num v={d.ct.ct} f={compact} />} icon={<Calculator size={16} />} tone="emerald" hint={org.regime === "sbr" && d.ct.sbrEligible ? t("SBR — nil") : `${t("Taxable")} ${compact(d.ct.taxable)}`} onClick={() => go("ct")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title={t("Tax risk")} sub={t("AI pre-filing review")} icon={<ShieldAlert size={16} className="text-rose-500" />} hover>
          <ul className="space-y-1">
            <RiskRow icon={<FileWarning size={15} />} tone={d.missingTrn.length ? "rose" : "emerald"} label={t("{n} invoice(s) with missing / invalid TRN", { n: d.missingTrn.length })} onClick={() => go("capture")} />
            <RiskRow icon={<AlertTriangle size={15} />} tone={d.vatAtRisk ? "rose" : "emerald"} label={t("{amt} input VAT at risk", { amt: fmt(d.vatAtRisk, { aed: true }) })} onClick={() => go("capture")} />
            <RiskRow icon={<Calculator size={15} />} tone={d.ctAdj ? "amber" : "emerald"} label={t("{n} corporate tax adjustment(s) required", { n: d.ctAdj })} onClick={() => go("ct")} />
            <RiskRow icon={<Banknote size={15} />} tone={d.unmatched ? "amber" : "emerald"} label={t("{n} unreconciled bank line(s)", { n: d.unmatched })} onClick={() => go("bank")} />
            {d.ct.warnings.map((w) => <RiskRow key={w} icon={<AlertTriangle size={15} />} tone="amber" label={t(w)} onClick={() => go("ct")} />)}
          </ul>
        </Card>
        <Card title={t("Receivables ageing")} sub={`${t("Open AR")} ${fmt(d.ageing.reduce((s, a) => s + a.amount, 0), { aed: true, dp0: true })}`} hover icon={<Receipt size={16} />} actions={<button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => go("ar")}>{t("View AR")} <ChevronRight size={13} className="rtl:rotate-180" /></button>}>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={d.buckets.map((b) => ({ ...b, label: t(b.label), v: b.v / 100 }))} margin={{ left: -15, top: 8 }}>
                <defs>
                  <linearGradient id="bOk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b9be6" /><stop offset="1" stopColor="#2a78d6" /></linearGradient>
                  <linearGradient id="bWarn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6c04d" /><stop offset="1" stopColor="#eda100" /></linearGradient>
                  <linearGradient id="bBad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ef7b7a" /><stop offset="1" stopColor="#e34948" /></linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} {...xDir} />
                <YAxis {...axis} {...yDir} tickFormatter={aedK} />
                <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)", radius: 8 }} formatter={(v) => `AED ${Number(v).toLocaleString()}`} />
                <Bar dataKey="v" name={t("Outstanding")} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={1200}>
                  {d.buckets.map((b, i) => <Cell key={b.label} fill={i >= 3 ? "url(#bBad)" : i === 2 ? "url(#bWarn)" : "url(#bOk)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={t("Upcoming deadlines")} icon={<CalendarClock size={16} className="text-emerald-600" />} hover>
          <ul className="space-y-1.5">
            {dl.map((x) => {
              const days = daysBetween(TODAY, x.date);
              return (
                <li key={x.title + x.date} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 transition">
                  <div className={cx("text-center w-11 shrink-0 rounded-xl py-1 ring-1", days <= 7 ? "bg-rose-50 ring-rose-100" : days <= 30 ? "bg-amber-50 ring-amber-100" : "bg-slate-50 ring-slate-100")}><div className="text-[9px] uppercase text-slate-400">{mon(x.date)}</div><div className="text-base font-semibold text-slate-800 leading-none">{x.date.slice(8)}</div></div>
                  <div className="flex-1 text-sm text-slate-700">{t(x.title, x.p)}</div>
                  <Badge tone={days <= 7 ? "rose" : days <= 30 ? "amber" : "slate"}>{t("{n}d", { n: days })}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function RiskRow({ icon, label, tone, onClick }: { icon: React.ReactNode; label: string; tone: string; onClick: () => void }) {
  const c = tone === "rose" ? "text-rose-600 bg-rose-50 ring-rose-100" : tone === "amber" ? "text-amber-600 bg-amber-50 ring-amber-100" : "text-emerald-600 bg-emerald-50 ring-emerald-100";
  return <li><button onClick={onClick} className="group w-full flex items-center gap-3 text-start text-sm text-slate-700 hover:text-slate-900 rounded-xl px-2 py-2 hover:bg-slate-50 transition cursor-pointer"><span className={`size-8 rounded-xl grid place-items-center shrink-0 ring-1 ${c}`}>{icon}</span><span className="flex-1">{label}</span><ChevronRight size={15} className="text-slate-300 transition rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 group-hover:text-slate-500" /></button></li>;
}
