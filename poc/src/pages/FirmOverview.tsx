import { Building2, AlertTriangle, CheckCircle2, Clock, Users, FileCheck2, ArrowRight, Flame, LineChart } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { orgData, deadlines, daysBetween, TODAY, MONTHS } from "../lib/derive";
import { compact } from "../lib/money";
import { Badge, Card, DataTable, KpiGrid, Num, Ring, Sparkline, Stat, cx } from "../components/ui";
import { C, axis, tipStyle, aedK } from "../components/charts";
import type { Page } from "../components/Layout";

export function FirmOverview({ open }: { open: (orgId: string, p?: Page) => void }) {
  const { state } = useStore();
  const { t, mon, orgName, xDir, yDir, date } = useI18n();
  const rows = state.orgs.map((o) => ({ o, d: orgData(state, o), pend: state.purchases.filter((p) => p.orgId === o.id && p.status === "PENDING").length }));
  const pending = state.purchases.filter((p) => p.status === "PENDING");
  const dl = deadlines(state).filter((x) => x.date >= TODAY);
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = new Date(TODAY); s.setDate(s.getDate() + i * 7); return s.toISOString().slice(0, 10); });
  const totRev = rows.reduce((s, r) => s + r.d.pl.revenue, 0);
  const totVat = rows.reduce((s, r) => s + r.d.vat.box14, 0);
  const totCt = rows.reduce((s, r) => s + r.d.ct.ct, 0);
  const flags = rows.reduce((s, r) => s + r.d.missingTrn.length + (r.d.unmatched ? 1 : 0) + r.d.ct.warnings.length, 0);
  const health = (r: (typeof rows)[0]) => Math.max(20, 100 - r.d.missingTrn.length * 12 - r.pend * 6 - r.d.unmatched * 3 - r.d.ct.warnings.length * 8);
  const short = (o: { name: string; nameAr: string }) => orgName(o).split(" ").slice(0, 2).join(" ");
  const portfolio = MONTHS.map((m, i) => Object.fromEntries([["label", mon(m)], ...rows.map((r) => [short(r.o), r.d.mon[i].revenue])]));
  const colors = [C.revenue, C.expenses, C.profit];
  const toneOf = (h: number) => (h >= 80 ? "#10b981" : h >= 60 ? "#eda100" : "#e34948");

  return (
    <>
      <section className="hero relative overflow-hidden rounded-3xl text-white p-5 sm:p-7 mb-6 shadow-[0_24px_60px_-28px_rgba(7,13,26,.7)] fade-in">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute end-10 -top-16 size-72 rounded-full bg-indigo-400/20 blur-3xl float" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium"><span className="size-1.5 rounded-full bg-emerald-400 pulse-ring" />{t("TFS Plus Tax & Accountancy LLC · FTA-registered tax agency")}</div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{t("Firm overview")}</h1>
            <p className="text-sm text-slate-400 mt-1">{t("Master console across every client — prepared by AI, reviewed by your team.")}</p>
          </div>
          <div className="flex flex-wrap gap-6 sm:gap-8">
            {([["Revenue under management", totRev, 1400], ["VAT payable · Q3", totVat, 900], ["CT estimate FY26", totCt, 900]] as const).map(([l, v, ms]) => (
              <div key={l}><div className="text-xs text-slate-400">{t(l)}</div><div className="text-xl sm:text-2xl font-semibold num bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent"><Num v={v} f={compact} ms={ms} /></div></div>
            ))}
          </div>
        </div>
      </section>

      <KpiGrid>
        <Stat label={t("Active clients")} value={<Num v={state.orgs.length} f={String} />} icon={<Building2 size={16} />} tone="indigo" hint={t("Pilot cohort · Feb 2027")} />
        <Stat label={t("Docs awaiting approval")} value={<Num v={pending.length} f={String} />} icon={<FileCheck2 size={16} />} tone="amber" hint={t("Maker-checker queue")} />
        <Stat label={t("Next filing")} value={date("2026-10-28")} icon={<Clock size={16} />} tone="sky" hint={t("VAT Q3 · {n} days", { n: daysBetween(TODAY, "2026-10-28") })} />
        <Stat label={t("Open risk flags")} value={<Num v={flags} f={String} />} icon={<AlertTriangle size={16} />} tone="rose" hint={t("Across all clients")} />
      </KpiGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
        {rows.map((r) => {
          const { o, d, pend } = r; const h = health(r);
          return (
            <button key={o.id} onClick={() => open(o.id)} className="card card-hover group text-start p-5 cursor-pointer relative overflow-hidden focus-visible:outline-2 focus-visible:outline-emerald-500">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${o.color}, transparent)` }} />
              <div className="flex items-start gap-3">
                <span className="size-11 shrink-0 rounded-2xl grid place-items-center text-white font-semibold shadow-md transition-transform group-hover:scale-105" style={{ background: `linear-gradient(135deg, ${o.color}, ${o.color}aa)` }}>{orgName(o)[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{orgName(o)}</div>
                  <div className="text-xs text-slate-500">{t(o.industry)} · {o.emirate} · {t(o.regime === "sbr" ? "SBR" : "Standard CT")}</div>
                </div>
                <div className="text-center"><Ring value={h} color={toneOf(h)} size={52} stroke={6}>{h}</Ring><div className="text-[10px] text-slate-400 mt-0.5">{t("Health")}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {([["Revenue", d.pl.revenue], ["Net profit", d.pl.net], ["VAT Q3", d.vat.box14]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100"><div className="text-[10px] text-slate-500">{t(l)}</div><div className="text-sm font-semibold num">{compact(v)}</div></div>)}
              </div>
              <div className="mt-3 -mx-1"><Sparkline data={d.mon.map((m) => m.revenue)} color={o.color} h={40} /></div>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {pend ? <Badge tone="amber" dot>{t("{n} approvals", { n: pend })}</Badge> : <Badge tone="emerald" dot>{t("No approvals")}</Badge>}
                {d.unmatched ? <Badge tone="amber" dot>{t("{n} bank lines", { n: d.unmatched })}</Badge> : <Badge tone="emerald"><CheckCircle2 size={11} />{t("Reconciled")}</Badge>}
                <span className="ms-auto text-xs text-slate-400 flex items-center gap-1 group-hover:text-emerald-600 transition">{t("Open")} <ArrowRight size={13} className="transition rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <DataTable title={t("Client status board")} sub={t("Every client at a glance — sort, filter or open")} rows={rows} rowKey={(r) => r.o.id} onRowClick={(r) => open(r.o.id)}
          search={(r) => `${r.o.name} ${r.o.nameAr} ${r.o.industry} ${r.o.assignedTo}`}
          filters={[
            { key: "acc", label: t("Accountant"), options: [...new Set(state.orgs.map((o) => o.assignedTo))].map((a) => ({ value: a, label: a })), get: (r) => r.o.assignedTo },
            { key: "risk", label: t("Risk"), options: ["High", "Medium", "Low"].map((x) => ({ value: x, label: t(x) })), get: (r) => (health(r) < 60 ? "High" : health(r) < 80 ? "Medium" : "Low") },
          ]}
          cols={[
            { key: "c", header: t("Client"), sort: (r) => r.o.name, cell: (r) => <div className="flex items-center gap-3"><span className="size-8 shrink-0 rounded-lg grid place-items-center text-white text-xs font-semibold" style={{ background: r.o.color }}>{orgName(r.o)[0]}</span><div className="min-w-0"><div className="font-medium text-slate-900 truncate">{orgName(r.o)}</div><div className="text-xs text-slate-400">{t(r.o.industry)} · {r.o.emirate}</div></div></div> },
            { key: "rev", header: t("Revenue YTD"), align: "end", sort: (r) => r.d.pl.revenue, cell: (r) => compact(r.d.pl.revenue) },
            { key: "np", header: t("Net profit"), align: "end", hide: "md", sort: (r) => r.d.pl.net, cell: (r) => compact(r.d.pl.net) },
            { key: "vat", header: t("VAT Q3"), align: "end", sort: (r) => r.d.vat.box14, cell: (r) => compact(r.d.vat.box14) },
            { key: "ct", header: t("CT FY26"), align: "end", hide: "lg", sort: (r) => r.d.ct.ct, cell: (r) => compact(r.d.ct.ct) },
            { key: "ap", header: t("Approvals"), hide: "sm", sort: (r) => r.pend, cell: (r) => (r.pend ? <Badge tone="amber" dot>{t("{n} pending", { n: r.pend })}</Badge> : <Badge tone="emerald" dot>{t("Clear")}</Badge>) },
            { key: "h", header: t("Health"), sort: (r) => health(r), cell: (r) => <div className="flex items-center gap-2"><div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${health(r)}%`, background: toneOf(health(r)) }} /></div><span className="text-xs num text-slate-600">{health(r)}</span></div> },
            { key: "a", header: t("Accountant"), hide: "lg", sort: (r) => r.o.assignedTo, cell: (r) => <span className="text-slate-600">{r.o.assignedTo}</span> },
          ]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title={t("Portfolio revenue")} sub={t("Monthly revenue by client, stacked")} className="xl:col-span-2" icon={<LineChart size={16} />} hover>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={portfolio} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>{colors.map((c, i) => <linearGradient key={i} id={`pf${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity={0.45} /><stop offset="1" stopColor={c} stopOpacity={0.08} /></linearGradient>)}</defs>
                <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} {...xDir} /><YAxis {...axis} {...yDir} tickFormatter={aedK} />
                <Tooltip {...tipStyle} formatter={(v) => `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {rows.map((r, i) => <Area key={r.o.id} type="monotone" dataKey={short(r.o)} stackId="1" stroke={colors[i]} strokeWidth={2} fill={`url(#pf${i})`} animationDuration={1300} animationBegin={i * 150} />)}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={t("Workload per accountant")} sub={t("Clients and open items")} icon={<Users size={16} />} hover>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              <BarChart layout="vertical" data={[...new Set(state.orgs.map((o) => o.assignedTo))].map((a) => {
                const mine = rows.filter((r) => r.o.assignedTo === a);
                return { a, clients: mine.length, approvals: mine.reduce((s, r) => s + r.pend, 0), bank: mine.reduce((s, r) => s + r.d.unmatched, 0) };
              })} margin={{ left: 0 }} barSize={26}>
                <CartesianGrid stroke="#eef2f7" horizontal={false} strokeDasharray="3 4" />
                <XAxis type="number" {...axis} allowDecimals={false} {...xDir} />
                <YAxis type="category" dataKey="a" {...axis} width={50} {...yDir} />
                <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="clients" name={t("Clients")} stackId="s" fill={C.revenue} />
                <Bar dataKey="approvals" name={t("Approvals")} stackId="s" fill={C.expenses} />
                <Bar dataKey="bank" name={t("Bank lines")} stackId="s" fill={C.profit} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title={t("Deadline heat-map")} sub={t("Next 12 weeks · hover a cell for details")} className="mt-4" icon={<Flame size={16} />} hover>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs border-separate border-spacing-1">
            <thead><tr><th className="text-start font-medium text-slate-500 pb-1 pe-3">{t("Client")}</th>{weeks.map((w) => <th key={w} className="font-medium text-slate-400 pb-1 whitespace-nowrap">{w.slice(8)} {mon(w)}</th>)}</tr></thead>
            <tbody>
              {state.orgs.map((o) => (
                <tr key={o.id}>
                  <td className="pe-3 text-slate-700 whitespace-nowrap font-medium"><span className="inline-block size-2 rounded-full me-2" style={{ background: o.color }} />{short(o)}</td>
                  {weeks.map((w) => {
                    const end = new Date(w); end.setDate(end.getDate() + 7);
                    const items = dl.filter((x) => x.orgId === o.id && x.date >= w && x.date < end.toISOString().slice(0, 10));
                    const shade = items.length === 0 ? "bg-slate-100/80" : items.some((i) => i.kind === "VAT" || i.kind === "CT") ? "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-sm shadow-rose-300" : items.length > 1 ? "bg-gradient-to-br from-amber-300 to-amber-500 text-white" : "bg-amber-100 text-amber-800";
                    return <td key={w}><div title={items.map((i) => `${i.date} ${t(i.title, i.p)}`).join("\n") || t("No deadlines")} className={cx("h-8 rounded-lg grid place-items-center text-[11px] font-semibold transition hover:scale-110 hover:z-10 relative cursor-default", shade)}>{items.length || ""}</div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><i className="size-3 rounded bg-rose-500" />{t("VAT / CT filing")}</span><span className="flex items-center gap-1.5"><i className="size-3 rounded bg-amber-400" />{t("Multiple items")}</span><span className="flex items-center gap-1.5"><i className="size-3 rounded bg-amber-100" />{t("Licence / WPS")}</span></div>
        </div>
      </Card>
    </>
  );
}
