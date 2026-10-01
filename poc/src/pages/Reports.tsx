import { useState } from "react";
import { Download, BarChart3, Scale, TrendingUp, Percent, Printer } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { useOrgData } from "../lib/derive";
import { fmt, compact } from "../lib/money";
import { Waterfall } from "../components/Waterfall";
import { Card, PageHeader, Tabs, Badge, KpiGrid, Stat, Num } from "../components/ui";
import type { Org } from "../lib/types";

const Row = ({ l, v, b, indent, top }: { l: string; v: number; b?: boolean; indent?: boolean; top?: boolean }) => (
  <tr className={b ? "font-semibold text-slate-900" : "hover:bg-slate-50/70 transition-colors"}><td className={`py-2 px-1 text-sm ${indent ? "ps-6 text-slate-600" : ""} ${top ? "border-t border-slate-300" : ""}`}>{l}</td><td className={`py-2 px-1 text-sm text-end num ${top ? "border-t border-slate-300" : ""} ${v < 0 && !b ? "text-slate-500" : ""}`}>{fmt(v)}</td></tr>
);
const Sec = ({ children }: { children: string }) => <tr><td colSpan={2} className="pt-5 pb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</td></tr>;

export function Reports({ org }: { org: Org }) {
  const store = useStore();
  const { t, acc, orgName } = useI18n();
  const d = useOrgData(org)!;
  const [tab, setTab] = useState<"pl" | "bs" | "tb">("pl");
  const csv = () => {
    const rows = [["Code", "Account", "Debit", "Credit"], ...d.tb.map((r) => [r.code, r.name, (r.debit / 100).toFixed(2), (r.credit / 100).toFixed(2)])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" })); a.download = `${org.id}-trial-balance.csv`; a.click();
    store.toast(t("Trial balance exported"));
  };
  const tbDr = d.tb.reduce((s, r) => s + r.debit, 0), tbCr = d.tb.reduce((s, r) => s + r.credit, 0);
  const balanced = d.bs.totalAssets === d.bs.totalLiabilities + d.bs.totalEquity;
  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("Reports")} sub={t("IFRS for SMEs presentation · {org} · period 1 Jan – 30 Sep 2026", { org: orgName(org) })}
        actions={<><Tabs value={tab} onChange={setTab} items={[{ id: "pl", label: t("Profit & loss") }, { id: "bs", label: t("Balance sheet") }, { id: "tb", label: t("Trial balance") }]} /><button className="btn-ghost" onClick={csv}><Download size={15} />{t("TB CSV")}</button><button className="btn-ghost" onClick={() => window.print()}><Printer size={15} />{t("Print")}</button></>} />
      <KpiGrid>
        <Stat label={t("Revenue")} value={<Num v={d.pl.revenue} f={compact} />} icon={<TrendingUp size={16} />} tone="sky" spark={d.mon.map((m) => m.revenue)} />
        <Stat label={t("Gross margin")} value={`${((d.pl.gross / d.pl.revenue) * 100).toFixed(1)}%`} icon={<Percent size={16} />} tone="violet" hint={compact(d.pl.gross)} />
        <Stat label={t("Net profit")} value={<Num v={d.pl.net} f={compact} />} icon={<BarChart3 size={16} />} tone="emerald" spark={d.mon.map((m) => m.profit)} />
        <Stat label={t("Total assets")} value={<Num v={d.bs.totalAssets} f={compact} />} icon={<Scale size={16} />} tone="indigo" hint={balanced ? t("Balances ✓") : t("Out of balance")} />
      </KpiGrid>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3">
          {tab === "pl" && <Card title={t("Statement of profit or loss")} sub={t("For the nine months ended 30 September 2026 · AED")}>
            <table className="w-full"><tbody>
              <Row l={t("Revenue")} v={d.pl.revenue} b /><Row l={t("Cost of sales")} v={-d.pl.cogs} indent /><Row l={t("Gross profit")} v={d.pl.gross} b top />
              {d.pl.otherIncome !== 0 && <Row l={t("Other income")} v={d.pl.otherIncome} indent />}
              <Sec>{t("Operating expenses")}</Sec>
              {d.pl.opexLines.map(([n, v]) => <Row key={n} l={acc(n)} v={-v} indent />)}
              <Row l={t("Profit before tax")} v={d.pl.pbt} b top /><Row l={t("Corporate tax (estimate, not yet booked)")} v={-d.ct.ct} indent /><Row l={t("Profit after estimated tax")} v={d.pl.pbt - d.ct.ct} b top />
            </tbody></table></Card>}
          {tab === "bs" && <Card title={t("Statement of financial position")} sub={t("As at 30 September 2026 · AED")} actions={balanced ? <Badge tone="emerald" dot>{t("Balances ✓")}</Badge> : <Badge tone="rose">{t("Out of balance")}</Badge>}>
            <table className="w-full"><tbody>
              <Sec>{t("Assets")}</Sec>
              {d.bs.assets.map((r) => <Row key={r.code} l={acc(r.code)} v={r.balance} indent />)}<Row l={t("Total assets")} v={d.bs.totalAssets} b top />
              <Sec>{t("Liabilities")}</Sec>
              {d.bs.liabilities.map((r) => <Row key={r.code} l={acc(r.code)} v={r.balance} indent />)}<Row l={t("Total liabilities")} v={d.bs.totalLiabilities} b top />
              <Sec>{t("Equity")}</Sec>
              {d.bs.equity.map((r) => <Row key={r.code} l={acc(r.code)} v={r.balance} indent />)}<Row l={t("Profit for the period")} v={d.bs.currentProfit} indent /><Row l={t("Total equity")} v={d.bs.totalEquity} b top />
              <Row l={t("Total liabilities and equity")} v={d.bs.totalLiabilities + d.bs.totalEquity} b top />
            </tbody></table></Card>}
          {tab === "tb" && <Card title={t("Trial balance")} sub={t("All posted journals to date")} actions={tbDr === tbCr ? <Badge tone="emerald" dot>{t("Dr = Cr ✓")}</Badge> : <Badge tone="rose">{t("Unbalanced")}</Badge>} pad={false}>
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">{t("Code")}</th><th className="th">{t("Account")}</th><th className="th !text-end">{t("Debit")}</th><th className="th !text-end">{t("Credit")}</th></tr></thead>
              <tbody>{d.tb.map((r) => <tr key={r.code} className="hover:bg-slate-50/70"><td className="td num text-slate-500">{r.code}</td><td className="td">{acc(r.code)}</td><td className="td text-end num">{r.debit ? fmt(r.debit) : ""}</td><td className="td text-end num">{r.credit ? fmt(r.credit) : ""}</td></tr>)}
                <tr className="font-semibold bg-slate-50/70"><td className="td" colSpan={2}>{t("Total")}</td><td className="td text-end num">{fmt(tbDr)}</td><td className="td text-end num">{fmt(tbCr)}</td></tr></tbody></table></div></Card>}
        </div>
        <div className="xl:col-span-2 space-y-4 xl:sticky xl:top-24">
          <Card title={t("Profit walk")} sub={t("Revenue to net profit, YTD")} icon={<BarChart3 size={16} />} hover>
            <Waterfall height={290} steps={[
              { label: t("Revenue"), value: d.pl.revenue / 100, kind: "start" },
              { label: t("COGS"), value: d.pl.cogs / 100, kind: "down" },
              { label: t("Gross profit"), value: d.pl.gross / 100, kind: "total" },
              ...d.pl.opexLines.slice(0, 3).map(([n, v]) => ({ label: acc(n).split(" ")[0], value: v / 100, kind: "down" as const })),
              { label: t("Other opex"), value: d.pl.opexLines.slice(3).reduce((s, [, v]) => s + v, 0) / 100, kind: "down" },
              { label: t("Net profit"), value: d.pl.pbt / 100, kind: "total" },
            ]} />
          </Card>
          <Card title={t("Balance sheet check")} hover>
            <div className="space-y-3">{([["Assets", d.bs.totalAssets, "from-sky-400 to-blue-600"], ["Liabilities", d.bs.totalLiabilities, "from-amber-300 to-orange-500"], ["Equity", d.bs.totalEquity, "from-emerald-400 to-teal-600"]] as const).map(([l, v, g], i) => (
              <div key={l}><div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{t(l)}</span><span className="num font-medium">{fmt(v, { dp0: true })}</span></div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full grow-x bg-gradient-to-r rtl:bg-gradient-to-l ${g}`} style={{ width: `${(v / d.bs.totalAssets) * 100}%`, animationDelay: `${i * 0.1}s` }} /></div></div>))}
              <div className={`text-xs rounded-lg px-3 py-2 ${balanced ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"}`}>{t(balanced ? "Assets = Liabilities + Equity ✓ balanced to the fils" : "Assets ≠ Liabilities + Equity")}</div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
