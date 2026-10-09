import { AlertTriangle, BarChart3, Calculator, TrendingUp, Plus, Percent, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { useOrgData } from "../lib/derive";
import { TAX_CONFIG } from "../lib/config";
import { fmt, compact } from "../lib/money";
import { Waterfall } from "../components/Waterfall";
import { Badge, Card, Gauge, KpiGrid, Num, PageHeader, Select, Stat } from "../components/ui";
import type { Org, CtRegime } from "../lib/types";

export function Ct({ org }: { org: Org }) {
  const store = useStore();
  const { t } = useI18n();
  const d = useOrgData(org)!;
  const ct = d.ct;
  const sbrPct = Math.min(100, (d.ytdRevenueAnnualised / TAX_CONFIG.ct.sbrLimit.value) * 100);
  const short = (l: string) => t(l).split(" — ")[0];
  return (
    <>
      <PageHeader eyebrow={t("Tax")} title={t("Corporate tax computation")} sub={t("FDL 47/2022 · FY ending 31 Dec 2026 · YTD actuals to 30 Sep · deterministic rules engine (config {v})", { v: ct.configVersion })}
        actions={<div className="flex items-center gap-2"><span className="text-sm text-slate-500">{t("Regime")}</span><Select aria-label={t("Regime")} className="w-60" value={org.regime} onChange={(e) => store.setRegime(org.id, e.target.value as CtRegime)}><option value="standard">{t("Standard (0% / 9%)")}</option><option value="sbr">{t("Small Business Relief")}</option><option value="qfzp">{t("Qualifying Free Zone Person")}</option></Select></div>} />
      <KpiGrid>
        <Stat label={t("Accounting profit (YTD)")} value={<Num v={ct.profit} f={compact} />} tone="sky" icon={<TrendingUp size={16} />} />
        <Stat label={t("Tax adjustments (add-backs)")} value={<Num v={ct.adds} f={compact} />} tone="amber" icon={<Plus size={16} />} hint={t("{n} adjustment(s)", { n: d.ctAdj })} />
        <Stat label={t("Taxable income")} value={<Num v={ct.taxable} f={compact} />} tone="violet" icon={<Calculator size={16} />} />
        <Stat label={t("Corporate tax payable")} value={<Num v={ct.ct} f={(n) => fmt(n, { aed: true })} />} tone="emerald" icon={<Percent size={16} />} hint={t("Due {date} · ETR {r}%", { date: ct.dueDate, r: ct.profit > 0 ? ((ct.ct / ct.profit) * 100).toFixed(2) : "0" })} />
      </KpiGrid>
      {ct.warnings.map((w) => <div key={w} className="mb-3 text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-100 rounded-xl px-4 py-2.5 flex gap-2 fade-in"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{t(w)}</div>)}
      <Card title={t("Profit → tax bridge")} sub={t("Waterfall from accounting profit to corporate tax payable")} className="mb-4" icon={<BarChart3 size={16} />} hover>
        <Waterfall steps={[
          { label: t("Accounting profit"), value: ct.profit / 100, kind: "start" },
          ...ct.lines.filter((l) => l.kind === "add").map((l) => ({ label: short(l.label), value: l.amount / 100, kind: "up" as const })),
          { label: t("Taxable income"), value: ct.taxable / 100, kind: "total" },
          ...(org.regime === "sbr" && ct.sbrEligible ? [] : [{ label: t("0% band"), value: Math.min(ct.taxable, TAX_CONFIG.ct.zeroBand.value) / 100, kind: "down" as const }, { label: t("Taxed at {r}%", { r: TAX_CONFIG.ct.rateBp.value / 100 }), value: Math.max(0, ct.taxable - TAX_CONFIG.ct.zeroBand.value) / 100, kind: "total" as const }, { label: t("CT payable"), value: ct.ct / 100, kind: "total" as const }]),
        ]} />
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title={t("Taxable income bridge")} sub={t("Every line cites its legal basis")} className="xl:col-span-2" pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><thead><tr><th className="th">{t("Item")}</th><th className="th">{t("Basis")}</th><th className="th !text-end">AED</th></tr></thead>
            <tbody>{ct.lines.map((l, i) => <tr key={i} className={l.kind === "total" ? "font-semibold bg-slate-50/70" : "hover:bg-slate-50/70"}><td className="td">{l.kind === "add" ? <span className="text-amber-600 font-medium">{t("Add:")} </span> : l.kind === "less" ? <span className="text-violet-600 font-medium">{t("Less:")} </span> : ""}{t(l.label, l.p)}</td><td className="td text-xs text-slate-500" dir="ltr">{l.basis}</td><td className="td text-end num">{fmt(l.amount)}</td></tr>)}</tbody></table></div>
        </Card>
        <div className="space-y-4">
          <Card title={t("Small Business Relief monitor")} sub={t("Revenue ≤ AED 3m in current & all prior periods")} icon={<ShieldCheck size={16} />} hover>
            <div className="flex justify-center mb-2"><Gauge value={sbrPct} label={t("Of AED 3m SBR ceiling")} color={sbrPct >= 100 ? "#e34948" : sbrPct > 85 ? "#eda100" : "#10b981"} /></div>
            <div className="text-sm text-slate-600 mb-3 text-center">{t("Annualised revenue")} <b className="num">{compact(d.ytdRevenueAnnualised)}</b> · {t("prior period")} <b className="num">{compact(org.priorRevenue)}</b></div>
            <div className="flex flex-wrap gap-1.5 justify-center">{ct.sbrEligible ? <Badge tone="emerald" dot>{t("Eligible for SBR")}</Badge> : <Badge tone="rose" dot>{t("Not eligible for SBR")}</Badge>} <Badge tone="amber">{t("SBR ends {d} — VERIFY", { d: TAX_CONFIG.ct.sbrLastPeriodEnd.value })}</Badge></div>
          </Card>
          <Card title={t("Expense treatment rules")} sub={t("Rules engine — not AI")} hover>
            <ul className="text-sm space-y-2.5">
              {([["Salaries, rent, utilities", "Deductible", "emerald"], ["Client entertainment", "50% deductible (Art 32)", "amber"], ["Fines & penalties", "Disallowed (Art 33)", "rose"], ["Donations to non-QPBE", "Disallowed (Art 33)", "rose"], ["Personal expenses", "Disallowed (Art 28)", "rose"]] as const).map(([a, b, tone]) => <li key={a} className="flex justify-between items-center gap-2"><span className="text-slate-600">{t(a)}</span><Badge tone={tone}>{t(b)}</Badge></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
