import { useState } from "react";
import { Wand2, Upload, CheckCircle2, Link2, ArrowDownLeft, ArrowUpRight, ListChecks } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { COA } from "../lib/coa";
import { classify } from "../lib/ai";
import { fmt, toFils, compact } from "../lib/money";
import { Badge, DataTable, Field, KpiGrid, Modal, PageHeader, Ring, Select, Stat } from "../components/ui";
import type { Org, BankLine } from "../lib/types";

export function Bank({ org }: { org: Org }) {
  const store = useStore();
  const { t, acc, accFull } = useI18n();
  const lines = store.state.bank.filter((b) => b.orgId === org.id);
  const open = lines.filter((b) => !b.journalId);
  const [imp, setImp] = useState(false);
  const [csv, setCsv] = useState("2026-09-30,DEWA BILL PAYMENT,-2450.00\n2026-09-30,CAREEM RIDE,-58.50\n2026-09-30,INWARD TT EMIRATES BUILD MART,52500.00");
  const [pick, setPick] = useState<Record<string, string>>({});
  const pct = lines.length ? Math.round(((lines.length - open.length) / lines.length) * 100) : 0;
  const sug = (b: BankLine) => pick[b.id] ?? b.suggestion ?? (b.amount < 0 ? classify(b.desc).account : "4300");
  const parsed = csv.split("\n").map((r) => r.split(",")).filter((r) => r.length >= 3);

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("Bank reconciliation")} sub={t("Bank — current account (AED) · September 2026 statement")}
        actions={<><button className="btn-ghost" onClick={() => setImp(true)}><Upload size={15} />{t("Import CSV")}</button><button className="btn-primary" onClick={() => store.autoMatch(org.id)} disabled={!open.length}><Wand2 size={15} />{t("Auto-match")}</button></>} />
      <KpiGrid>
        <div className="card card-hover p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0"><Ring value={pct} size={56} stroke={7}>{pct}%</Ring><div><div className="text-xs text-slate-500">{t("Reconciled")}</div><div className="text-[22px] font-semibold num">{lines.length - open.length} / {lines.length}</div><div className="text-xs text-slate-400">{t("lines matched to ledger")}</div></div></div>
        <Stat label={t("Money in")} value={compact(lines.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0))} icon={<ArrowDownLeft size={16} />} tone="emerald" />
        <Stat label={t("Money out")} value={compact(-lines.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0))} icon={<ArrowUpRight size={16} />} tone="amber" />
        <Stat label={t("To review")} value={String(open.length)} icon={<ListChecks size={16} />} tone="rose" hint={t("AI suggestions ready")} />
      </KpiGrid>
      <DataTable title={t("Statement lines")} rows={lines} rowKey={(b) => b.id} initialSort={{ key: "d", dir: "desc" }} search={(b) => b.desc}
        rowClass={(b) => (b.journalId ? "bg-emerald-50/30" : "")}
        filters={[
          { key: "s", label: t("Status"), options: [{ value: "m", label: t("Matched") }, { value: "u", label: t("Unreconciled") }], get: (b) => (b.journalId ? "m" : "u") },
          { key: "dir", label: t("Direction"), options: [{ value: "in", label: t("Money in") }, { value: "out", label: t("Money out") }], get: (b) => (b.amount > 0 ? "in" : "out") },
        ]}
        cols={[
          { key: "d", header: t("Date"), sort: (b) => b.date, cell: (b) => <span className="num text-slate-600 whitespace-nowrap">{b.date}</span> },
          { key: "n", header: t("Narrative"), cell: (b) => <span className="font-mono text-xs" dir="ltr">{b.desc}</span> },
          { key: "a", header: t("Amount"), align: "end", sort: (b) => b.amount, cell: (b) => <span className={b.amount < 0 ? "text-rose-600" : "text-emerald-700"}>{fmt(b.amount)}</span> },
          { key: "s", header: t("Status"), sort: (b) => (b.journalId ? 1 : 0), cell: (b) => (b.journalId ? <Badge tone="emerald"><CheckCircle2 size={11} />{t("Matched")}</Badge> : <Badge tone="amber" dot>{t("Unreconciled")}</Badge>) },
          { key: "m", header: t("Match / AI suggestion"), hide: "md", cell: (b) => { const j = store.state.journals.find((x) => x.id === b.journalId); return j ? <span className="flex items-center gap-1.5 text-slate-600 text-xs"><Link2 size={13} /><span className="font-mono" dir="ltr">{j.ref}</span> · <span className="truncate max-w-48">{j.memo}</span></span> :
            <Select aria-label={t("Account")} className="min-w-56" value={sug(b)} onChange={(e) => setPick({ ...pick, [b.id]: e.target.value })}>{COA.filter((a) => a.type === "EXPENSE" || a.type === "REVENUE" || a.code === "1100" || a.code === "2000").map((a) => <option key={a.code} value={a.code}>{accFull(a.code)}</option>)}</Select>; } },
        ]}
        actions={(b) => !b.journalId && <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => store.categoriseBank(b.id, sug(b))}>{t("Post to {a}", { a: acc(sug(b)).split(" ")[0] })}</button>} />
      <Modal open={imp} onClose={() => setImp(false)} title={t("Import bank statement (CSV)")}
        footer={<><button className="btn-ghost" onClick={() => setImp(false)}>{t("Cancel")}</button><button className="btn-primary" disabled={!parsed.length} onClick={() => { store.importBank(org.id, parsed.map((r) => ({ date: r[0].trim(), desc: r.slice(1, -1).join(",").trim(), amount: toFils(r[r.length - 1]) }))); setImp(false); }}>{t("Import {n} lines", { n: parsed.length })}</button></>}>
        <Field label={t("CSV rows")} hint={t("Format: date,narrative,amount (negative = payment). MT940 / PDF parsing and Open-Finance feeds are on the roadmap.")}>
          <textarea dir="ltr" className="input font-mono !text-xs h-40" value={csv} onChange={(e) => setCsv(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
