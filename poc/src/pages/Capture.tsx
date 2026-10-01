import { useMemo, useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, XCircle, AlertTriangle, Sparkles, ShieldCheck, Send, Ban, Info, Inbox as InboxIcon, Receipt, Gauge as GaugeIcon, Clock } from "lucide-react";
import { useStore, USERS } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { extract, sampleList } from "../lib/ai";
import { COA, TAX_CODES } from "../lib/coa";
import { ctTreatment } from "../lib/ct";
import { applyBp, fmt, toFils, compact } from "../lib/money";
import { Badge, Card, PageHeader, cx, Empty, Field, Input, Select, SearchInput, Tabs, KpiGrid, Stat, Num } from "../components/ui";
import type { Org, PurchaseDoc, TaxCode, JLine } from "../lib/types";

const SCAN_STEPS = ["Reading document (OCR, EN/AR)", "Extracting supplier, TRN, amounts", "Verifying TRN format", "Article 59 compliance check", "Duplicate & fraud scan", "Classifying account, VAT & CT"];
const PIPE = ["Extracted", "Validated", "Classified", "Submitted", "Approved", "Posted"];

export function Capture({ org }: { org: Org }) {
  const store = useStore();
  const { t } = useI18n();
  const { state } = store;
  const [scanning, setScanning] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | PurchaseDoc["status"]>("ALL");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = state.purchases.filter((p) => p.orgId === org.id);
  const sel = docs.find((d) => d.id === selId) ?? null;
  const list = useMemo(() => docs.filter((d) => (filter === "ALL" || d.status === filter) && (!q || `${d.supplier} ${d.invNo}`.toLowerCase().includes(q.toLowerCase()))), [docs, filter, q]);
  const count = (s: PurchaseDoc["status"]) => docs.filter((d) => d.status === s).length;
  const posted = docs.filter((d) => d.status === "POSTED");
  const autoRate = posted.length ? Math.round((state.journals.filter((j) => j.orgId === org.id && j.approvedBy === "Auto-approve rule").length / posted.length) * 100) : 0;

  const run = (name: string) => {
    setScanning(name); setSelId(null); setStep(0);
    SCAN_STEPS.forEach((_, i) => setTimeout(() => setStep(i + 1), 320 * (i + 1)));
    setTimeout(() => { const p = store.capture(org.id, extract(name), name); setScanning(null); setSelId(p.id); }, 320 * SCAN_STEPS.length + 250);
  };

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("Capture invoices")} sub={t("Upload → AI extraction → Article 59 check → fraud & duplicate scan → classification → journal → approval")} />
      <KpiGrid>
        <Stat label={t("In inbox")} value={<Num v={docs.length} f={String} />} icon={<InboxIcon size={16} />} tone="sky" hint={t("{n} in review", { n: count("REVIEW") })} />
        <Stat label={t("Awaiting approval")} value={<Num v={count("PENDING")} f={String} />} icon={<Clock size={16} />} tone="amber" hint={t("Maker-checker queue")} onClick={() => setFilter("PENDING")} />
        <Stat label={t("Posted to ledger")} value={<Num v={posted.length} f={String} />} icon={<CheckCircle2 size={16} />} tone="emerald" hint={compact(posted.reduce((s, d) => s + d.total, 0))} onClick={() => setFilter("POSTED")} />
        <Stat label={t("Auto-approved")} value={`${autoRate}%`} icon={<GaugeIcon size={16} />} tone="violet" hint={t("Within tenant thresholds")} />
      </KpiGrid>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Card title={t("1 · Drop a purchase invoice")} sub={t("PDF, image, e-invoice XML, email or WhatsApp forward")} icon={<UploadCloud size={16} />}>
            <div role="button" tabIndex={0} aria-label={t("Upload an invoice")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run(f.name); }} onClick={() => !scanning && fileRef.current?.click()}
              className={cx("rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 outline-none focus-visible:ring-4 focus-visible:ring-emerald-100", scanning ? "border-brand-500 bg-brand-50 scan" : drag ? "border-brand-500 bg-brand-50 scale-[1.01]" : "border-slate-200 hover:border-brand-500 hover:bg-brand-50/40")}>
              <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f.name); e.target.value = ""; }} />
              {scanning ? (
                <div className="text-start" aria-live="polite">
                  <div className="flex items-center gap-2 mb-3"><Sparkles className="text-brand-600 animate-pulse" size={18} /><span className="text-sm font-medium text-slate-800 truncate">{t("Reading {f}…", { f: scanning })}</span></div>
                  <ul className="space-y-1.5">{SCAN_STEPS.map((s, i) => (
                    <li key={s} className={cx("flex items-center gap-2 text-xs transition-all duration-300", i < step ? "text-emerald-700" : i === step ? "text-slate-800" : "text-slate-400")}>
                      {i < step ? <CheckCircle2 size={14} className="text-emerald-500" /> : i === step ? <span className="size-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /> : <span className="size-3.5 rounded-full border-2 border-slate-200" />}{t(s)}
                    </li>))}</ul>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-600 transition-all duration-300" style={{ width: `${(step / SCAN_STEPS.length) * 100}%` }} /></div>
                </div>
              ) : (
                <><div className="mx-auto size-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 grid place-items-center ring-1 ring-emerald-100"><UploadCloud size={24} /></div><div className="mt-3 text-sm font-medium text-slate-800">{t("Drop file here or click to browse")}</div><div className="text-xs text-slate-500 mt-1">{t("POC: extraction is simulated from the file name (try \"uber.pdf\", \"rent.pdf\")")}</div></>
              )}
            </div>
            <div className="mt-4">
              <div className="label">{t("Or try a sample invoice")}</div>
              <div className="flex flex-wrap gap-1.5">{sampleList.map((s) => <button key={s.key} disabled={!!scanning} onClick={() => run(`${s.key}_invoice.pdf`)} className="btn-ghost !py-1 !px-2.5 !text-xs !rounded-full">{t(s.title)}</button>)}</div>
            </div>
          </Card>

          <section className="card fade-in overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{t("Inbox")}</h3><span className="text-xs text-slate-400 num">{t("{n} results", { n: list.length })}</span></div>
              <SearchInput value={q} onChange={setQ} placeholder={t("Search supplier or invoice no.")} />
              <div className="overflow-x-auto -mx-1 px-1"><Tabs value={filter} onChange={setFilter} items={(["ALL", "REVIEW", "PENDING", "POSTED", "REJECTED"] as const).map((x) => ({ id: x, label: x === "ALL" ? t("All") : `${t(x)} ${count(x as PurchaseDoc["status"]) || ""}` }))} /></div>
            </div>
            {list.length === 0 ? <Empty icon={<Receipt size={22} />}>{t("No documents match. Upload one or try a sample above.")}</Empty> : (
              <ul className="divide-y divide-slate-100 max-h-[460px] overflow-auto">
                {list.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setSelId(d.id)} aria-current={selId === d.id} className={cx("w-full text-start px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-all border-s-2 outline-none focus-visible:bg-emerald-50/60", selId === d.id ? "bg-emerald-50/60 border-emerald-500" : "border-transparent hover:border-slate-200")}>
                      <span className={cx("size-9 shrink-0 rounded-xl grid place-items-center ring-1", d.risk === "High" ? "bg-rose-50 text-rose-500 ring-rose-100" : d.risk === "Medium" ? "bg-amber-50 text-amber-500 ring-amber-100" : "bg-emerald-50 text-emerald-500 ring-emerald-100")}><FileText size={16} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{d.supplier}</div>
                        <div className="text-xs text-slate-500 truncate">{d.invNo} · {d.date} · {d.createdBy.split(" ")[0]}</div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="text-sm num font-medium">{fmt(d.total)}</div>
                        <div className="flex gap-1 justify-end mt-0.5"><RiskBadge r={d.risk} /><StatusBadge s={d.status} /></div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="xl:col-span-3">
          {sel ? <DocReview key={sel.id} doc={sel} org={org} /> : (
            <div className="card h-full min-h-80 grid place-items-center text-center p-10 relative overflow-hidden">
              <div className="absolute -top-20 -end-20 size-72 rounded-full bg-emerald-100/60 blur-3xl" />
              <div className="relative"><div className="mx-auto size-16 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-700 grid place-items-center text-white shadow-lg shadow-emerald-200 float"><ShieldCheck size={30} /></div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-6 text-xs">{["AI proposes", "Rules validate", "Humans approve"].map((x, i) => <span key={x} className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{t(x)}</span>{i < 2 && <span className="text-slate-300 rtl:rotate-180">→</span>}</span>)}</div>
                <div className="mt-4 font-medium text-slate-700">{t("Select or upload an invoice")}</div><p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{t("Nothing is posted to the ledger without passing AI, deterministic rules and human approval.")}</p></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Pipeline({ status }: { status: PurchaseDoc["status"] }) {
  const { t } = useI18n();
  const at = status === "REVIEW" ? 3 : status === "PENDING" ? 4 : status === "POSTED" ? 6 : 3;
  return (
    <div className="card px-3 sm:px-5 py-4 fade-in overflow-x-auto">
      <div className="relative flex justify-between min-w-[420px]">
        <div className="absolute top-3.5 inset-x-6 h-0.5 bg-slate-100 rounded-full" />
        <div className="absolute top-3.5 start-6 h-0.5 rounded-full bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-700" style={{ width: `calc((100% - 3rem) * ${Math.max(0, at - 1) / (PIPE.length - 1)})` }} />
        {PIPE.map((p, i) => (
          <div key={p} className="relative flex flex-col items-center gap-1.5 w-16">
            <span className={cx("size-7 rounded-full grid place-items-center text-[11px] font-semibold transition-all duration-500", status === "REJECTED" && i >= 3 ? "bg-rose-100 text-rose-600" : i < at ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-200" : i === at ? "bg-white ring-2 ring-emerald-500 text-emerald-700 pulse-ring" : "bg-slate-100 text-slate-400")}>{i < at ? "✓" : i + 1}</span>
            <span className={cx("text-[11px] font-medium text-center", i < at ? "text-slate-800" : i === at ? "text-emerald-700" : "text-slate-400")}>{t(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskBadge({ r }: { r: PurchaseDoc["risk"] }) { const { t } = useI18n(); return <Badge tone={r === "High" ? "rose" : r === "Medium" ? "amber" : "emerald"} dot>{t(`${r} risk`)}</Badge>; }
export function StatusBadge({ s }: { s: string }) { const { t } = useI18n(); return <Badge tone={s === "POSTED" || s === "PAID" || s === "DELIVERED" ? "emerald" : s === "PENDING" || s === "UNPAID" ? "amber" : s === "REJECTED" ? "rose" : s === "REVERSED" ? "slate" : "sky"}>{t(s)}</Badge>; }

function previewLines(d: PurchaseDoc): JLine[] {
  if (d.taxCode === "RCS") { const v = applyBp(d.net, 500); return [{ account: d.account, debit: d.net, credit: 0 }, { account: "1310", debit: v, credit: 0 }, { account: "2110", debit: 0, credit: v }, { account: "2000", debit: 0, credit: d.total }]; }
  if (d.taxCode === "BLK" || (!d.supplierTrn && d.vat > 0)) return [{ account: d.account, debit: d.total, credit: 0 }, { account: "2000", debit: 0, credit: d.total }];
  if (d.taxCode === "SR") return [{ account: d.account, debit: d.net, credit: 0 }, { account: "1300", debit: d.vat, credit: 0 }, { account: "2000", debit: 0, credit: d.total }];
  return [{ account: d.account, debit: d.total, credit: 0 }, { account: "2000", debit: 0, credit: d.total }];
}

function DocReview({ doc, org }: { doc: PurchaseDoc; org: Org }) {
  const store = useStore();
  const { t, tx, accFull, tax } = useI18n();
  const editable = doc.status === "REVIEW";
  const u = (patch: Partial<PurchaseDoc>) => store.updatePurchase(doc.id, patch);
  const ctt = ctTreatment(doc.account);
  const lines = previewLines(doc);
  const fails = doc.checks.filter((c) => !c.ok);
  const invalid = fails.some((f) => f.severity === "error");
  const canApprove = USERS[store.state.session.role].canApprove && doc.createdBy !== store.state.session.user;
  const aa = org.autoApprove;
  const willAuto = aa.enabled && doc.risk === "Low" && doc.confidence >= aa.minConfidence && doc.total <= aa.maxAmount;
  const vatTreat = doc.taxCode === "BLK" || (!doc.supplierTrn && doc.vat > 0 && !doc.foreign) ? { t: "Blocked / non-recoverable", tone: "rose" } : doc.taxCode === "RCS" ? { t: "Reverse charge — Box 3 & 10", tone: "violet" } : doc.taxCode === "SR" ? { t: "Recoverable — Box 9", tone: "emerald" } : { t: "No VAT (out of scope)", tone: "slate" };
  const money = (k: "net" | "vat" | "total", label: string) => <Field label={label}><Input prefix="AED" inputMode="decimal" disabled={!editable} defaultValue={(doc[k] / 100).toFixed(2)} onBlur={(e) => u({ [k]: toFils(e.target.value) } as Partial<PurchaseDoc>)} /></Field>;
  const text = (k: "supplier" | "supplierTrn" | "invNo" | "currency" | "description", label: string, extra?: object) => <Field label={label}><Input disabled={!editable} defaultValue={doc[k]} onBlur={(e) => u({ [k]: e.target.value } as Partial<PurchaseDoc>)} {...extra} /></Field>;

  return (
    <div className="space-y-4">
      <Pipeline status={doc.status} />
      <Card title={<span className="flex items-center gap-2">{t("2 · Extracted data")} <Badge tone="violet"><Sparkles size={11} />{t("AI")}</Badge></span>} sub={doc.fileName} actions={<div className="flex gap-1.5"><RiskBadge r={doc.risk} /><StatusBadge s={doc.status} /></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {text("supplier", t("Supplier"))}{text("supplierTrn", t("Supplier TRN"), { inputMode: "numeric", dir: "ltr" })}{text("invNo", t("Invoice no."), { dir: "ltr" })}
          <Field label={t("Invoice date")}><Input type="date" disabled={!editable} defaultValue={doc.date} onBlur={(e) => u({ date: e.target.value })} /></Field>
          {money("net", t("Taxable value"))}{money("vat", t("VAT"))}{money("total", t("Total"))}
          {text("currency", t("Currency"))}
          <Field label={t("'Tax Invoice' heading")}><Select disabled={!editable} value={doc.hasHeading ? "y" : "n"} onChange={(e) => u({ hasHeading: e.target.value === "y" })}><option value="y">{t("Present")}</option><option value="n">{t("Missing")}</option></Select></Field>
          <div className="sm:col-span-2 md:col-span-3">{text("description", t("Description"))}</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t("3 · FTA compliance & fraud checks")} sub={t("Art 59 Exec. Regulation + duplicate / TRN / arithmetic")}>
          <div className={cx("flex items-center gap-4 mb-4 rounded-2xl p-3 ring-1", invalid ? "bg-rose-50/60 ring-rose-100" : "bg-emerald-50/60 ring-emerald-100")}>
            <div className="relative size-16 shrink-0">
              <svg viewBox="0 0 36 36" className="size-16 -rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#fff" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.9" fill="none" stroke={doc.risk === "High" ? "#e11d48" : doc.risk === "Medium" ? "#f59e0b" : "#10b981"} strokeWidth="3.5" strokeDasharray={`${Math.max(4, doc.riskScore)} 100`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s cubic-bezier(.16,1,.3,1)" }} /></svg>
              <div className="absolute inset-0 grid place-items-center text-sm font-semibold num">{doc.riskScore}</div>
            </div>
            <div>
              <div className={cx("font-semibold flex items-center gap-1.5", invalid ? "text-rose-700" : "text-emerald-700")}>{invalid ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{t(invalid ? "Invalid tax invoice" : "Valid tax invoice")}</div>
              <div className="text-xs text-slate-500">{t("{a}/{b} checks passed · risk score {s}/100", { a: doc.checks.length - fails.length, b: doc.checks.length, s: doc.riskScore })}</div>
            </div>
          </div>
          <ul className="space-y-2">
            {doc.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.ok ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" /> : c.severity === "error" ? <XCircle size={16} className="text-rose-500 mt-0.5 shrink-0" /> : c.severity === "info" ? <Info size={16} className="text-sky-500 mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />}
                <div><span className={c.ok ? "text-slate-700" : "text-slate-900 font-medium"}>{t(c.label)}</span>{c.detail && <div className="text-xs text-slate-500">{t(c.detail, c.dp)}</div>}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2">{t("4 · Classification")} <Badge tone="violet"><Sparkles size={11} />{t("{n}% confidence", { n: Math.round(doc.confidence * 100) })}</Badge></span>}>
          <div className="space-y-3">
            <Field label={t("Account")}><Select disabled={!editable} value={doc.account} onChange={(e) => u({ account: e.target.value })}>
              {COA.filter((a) => a.type === "EXPENSE" || ["1200", "1500", "1150"].includes(a.code)).map((a) => <option key={a.code} value={a.code}>{accFull(a.code)}</option>)}
            </Select></Field>
            <Field label={t("VAT tax code")}><Select disabled={!editable} value={doc.taxCode} onChange={(e) => u({ taxCode: e.target.value as TaxCode })}>
              {Object.keys(TAX_CODES).filter((k) => k !== "ZR" && k !== "EX").map((k) => <option key={k} value={k}>{k} · {tax(k)}</option>)}
            </Select></Field>
            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50/40 border border-violet-100 p-3 text-xs text-violet-900 leading-relaxed"><b>{t("Why:")}</b> {tx(doc.reasoning)}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[11px] text-slate-500">{t("VAT treatment")}</div><Badge tone={vatTreat.tone} className="mt-1 !whitespace-normal">{t(vatTreat.t)}</Badge></div>
              <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[11px] text-slate-500">{t("Corporate tax")}</div><Badge tone={ctt.tone === "ok" ? "emerald" : ctt.tone === "warn" ? "amber" : "rose"} className="mt-1">{t(ctt.label)}</Badge></div>
            </div>
          </div>
        </Card>
      </div>

      <Card title={t("5 · Proposed journal entry")} sub={t("Double entry validated before posting — Dr = Cr in AED")}>
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
          <table className="w-full">
            <thead><tr><th className="th">{t("Account")}</th><th className="th !text-end">{t("Debit")}</th><th className="th !text-end">{t("Credit")}</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td className="td">{accFull(l.account)}</td><td className="td text-end num">{l.debit ? fmt(l.debit) : ""}</td><td className="td text-end num">{l.credit ? fmt(l.credit) : ""}</td></tr>)}
              <tr className="font-semibold bg-slate-50/60"><td className="td">{t("Total")}</td><td className="td text-end num">{fmt(lines.reduce((s, l) => s + l.debit, 0))}</td><td className="td text-end num">{fmt(lines.reduce((s, l) => s + l.credit, 0))}</td></tr></tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {doc.status === "REVIEW" && <>
            <button className="btn-primary" onClick={() => store.submitPurchase(doc.id)}><Send size={15} className="rtl:-scale-x-100" />{t(willAuto ? "Submit (auto-approve)" : "Submit for approval")}</button>
            <button className="btn-danger" onClick={() => store.rejectPurchase(doc.id)}><Ban size={15} />{t("Reject")}</button>
            <span className="text-xs text-slate-500">{willAuto ? t("Within auto-approve rule: ≤ AED {max}, ≥ {c}% confidence, low risk.", { max: aa.maxAmount / 100, c: aa.minConfidence * 100 }) : aa.enabled ? t("Needs human approval (rule: ≤ AED {max}, ≥ {c}%, low risk).", { max: aa.maxAmount / 100, c: aa.minConfidence * 100 }) : t("Needs human approval (auto-approve off).")}</span>
          </>}
          {doc.status === "PENDING" && <>
            <button className="btn-primary" onClick={() => store.approvePurchase(doc.id)} disabled={!canApprove}><CheckCircle2 size={15} />{t("Approve & post")}</button>
            <button className="btn-danger" onClick={() => store.rejectPurchase(doc.id)}><Ban size={15} />{t("Reject")}</button>
            {!canApprove && <span className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">{t(doc.createdBy === store.state.session.user ? "Maker-checker: you prepared this — a different approver (e.g. Client Owner) must approve." : "Your role cannot approve — switch role in the sidebar.")}</span>}
          </>}
          {doc.status === "POSTED" && <Badge tone="emerald" className="!py-1.5 !px-3 !whitespace-normal"><CheckCircle2 size={12} />{t("Posted as {id} — P&L, Balance Sheet and VAT 201 updated", { id: doc.journalId ?? "" })}</Badge>}
          {doc.status === "REJECTED" && <Badge tone="rose" className="!py-1.5 !px-3">{t("Rejected — not posted")}</Badge>}
        </div>
      </Card>
    </div>
  );
}
