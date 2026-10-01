import { useMemo, useState } from "react";
import { CalendarClock, AlertTriangle, Landmark, Calculator, Zap, ArrowRight } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { deadlines, daysBetween, TODAY, type Deadline } from "../lib/derive";
import { Badge, Card, KpiGrid, PageHeader, Stat, Tabs, cx, Empty } from "../components/ui";
import type { Page } from "../components/Layout";

const KIND: Record<string, { tone: string; dot: string }> = { VAT: { tone: "sky", dot: "bg-sky-500" }, CT: { tone: "violet", dot: "bg-violet-500" }, EINV: { tone: "indigo", dot: "bg-indigo-500" }, LICENCE: { tone: "amber", dot: "bg-amber-500" }, WPS: { tone: "slate", dot: "bg-slate-400" } };

export function Calendar({ open }: { open: (orgId: string, p?: Page) => void }) {
  const { state } = useStore();
  const { t, monLong, wd, orgName } = useI18n();
  const [range, setRange] = useState<"30" | "90" | "365">("90");
  const [kind, setKind] = useState<string>("ALL");
  const sid = state.session.orgId;
  const all = deadlines(state).filter((d) => sid === "FIRM" || d.orgId === sid);
  const upcoming = all.filter((d) => d.date >= TODAY);
  const list = upcoming.filter((d) => daysBetween(TODAY, d.date) <= Number(range) && (kind === "ALL" || d.kind === kind));
  const byMonth = useMemo(() => list.reduce<Record<string, Deadline[]>>((m, d) => { (m[d.date.slice(0, 7)] ??= []).push(d); return m; }, {}), [list]);
  const within = (n: number) => upcoming.filter((d) => daysBetween(TODAY, d.date) <= n).length;
  const nameOf = (id: string) => { const o = state.orgs.find((x) => x.id === id); return o ? orgName(o) : ""; };
  const target = (k: string): Page => (k === "VAT" ? "vat" : k === "CT" ? "ct" : "dashboard");

  return (
    <>
      <PageHeader eyebrow={t("Tax")} title={t("Compliance calendar")} sub={t("Generated from tax config — alerts at T-30 / T-14 / T-7 / T-1 (email & in-app; WhatsApp on roadmap)")}
        actions={<Tabs value={range} onChange={setRange} items={[{ id: "30", label: t("30 days") }, { id: "90", label: t("90 days") }, { id: "365", label: t("12 months") }]} />} />
      <KpiGrid>
        <Stat label={t("Due in 7 days")} value={String(within(7))} icon={<AlertTriangle size={16} />} tone="rose" />
        <Stat label={t("Due in 30 days")} value={String(within(30))} icon={<CalendarClock size={16} />} tone="amber" />
        <Stat label={t("Next VAT return")} value={upcoming.find((d) => d.kind === "VAT")?.date ?? "—"} icon={<Landmark size={16} />} tone="sky" />
        <Stat label={t("E-invoicing go-live")} value="2027-07-01" icon={<Zap size={16} />} tone="indigo" hint={t("{n} days", { n: daysBetween(TODAY, "2027-07-01") })} />
      </KpiGrid>
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label={t("Filter by type")}>
        {["ALL", "VAT", "CT", "EINV", "LICENCE", "WPS"].map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition cursor-pointer", kind === k ? "bg-ink-900 text-white ring-ink-900 shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300")}>
            {k !== "ALL" && <i className={cx("size-1.5 rounded-full", KIND[k].dot)} />}{t(k === "ALL" ? "All" : k)} <span className="opacity-60 num">{k === "ALL" ? upcoming.length : upcoming.filter((d) => d.kind === k).length}</span>
          </button>
        ))}
      </div>
      {!Object.keys(byMonth).length && <Card><Empty icon={<CalendarClock size={22} />}>{t("No deadlines in this range.")}</Empty></Card>}
      <div className="space-y-4 max-w-5xl">
        {Object.entries(byMonth).map(([m, items]) => (
          <Card key={m} title={monLong(m)} sub={t("{n} deadlines", { n: items.length })} pad={false} hover>
            <ol className="relative">
              {items.map((x, i) => {
                const days = daysBetween(TODAY, x.date);
                return (
                  <li key={x.orgId + x.title + x.date + i}>
                    <button onClick={() => open(x.orgId, target(x.kind))} className="w-full text-start px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 hover:bg-emerald-50/40 focus-visible:bg-emerald-50/60 outline-none cursor-pointer group transition-colors border-t border-slate-100">
                      <div className={cx("w-12 shrink-0 text-center rounded-xl py-1.5 ring-1", days <= 7 ? "bg-rose-50 ring-rose-100" : days <= 30 ? "bg-amber-50 ring-amber-100" : "bg-slate-50 ring-slate-100")}><div className="text-lg font-semibold text-slate-800 leading-none num">{x.date.slice(8)}</div><div className="text-[10px] text-slate-400 mt-0.5">{wd(x.date)}</div></div>
                      <Badge tone={KIND[x.kind].tone}>{t(x.kind)}</Badge>
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-800">{t(x.title, x.p)}</div><div className="text-xs text-slate-500 truncate">{nameOf(x.orgId)}{x.ref ? ` · ${x.ref}` : ""}</div></div>
                      <Badge tone={days <= 7 ? "rose" : days <= 30 ? "amber" : "slate"} dot>{t("in {n}d", { n: days })}</Badge>
                      <ArrowRight size={14} className="hidden sm:block text-slate-300 rtl:rotate-180 group-hover:text-emerald-600 transition" />
                    </button>
                  </li>);
              })}
            </ol>
          </Card>
        ))}
      </div>
    </>
  );
}
