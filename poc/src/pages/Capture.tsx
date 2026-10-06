import { useMemo, useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Send, Ban, Info, Inbox as InboxIcon, Receipt, Clock, Plus, Paperclip } from "lucide-react";
import { useStore, USERS } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { COA, TAX_CODES } from "../lib/coa";
import { ctTreatment } from "../lib/ct";
import { fmt, fmtPlain, toFils, compact } from "../lib/money";
import { purchaseLines } from "../lib/posting";
import { Badge, Card, PageHeader, cx, Empty, Field, Input, Select, SearchInput, Tabs, KpiGrid, Stat, Num } from "../components/ui";
import type { Org, PurchaseDoc, TaxCode } from "../lib/types";

const PIPE = ["Entered", "Checked", "Submitted", "Approved", "Posted"];

export function Capture({ org }: { org: Org }) {
  const store = useStore();
  const { t } = useI18n();
  const { state } = store;
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
  // Bills are entered by hand; an uploaded file is kept as the attachment (no OCR — D-01).
  const create = (fileName?: string) => { const p = store.newBill(org.id, fileName); setSelId(p.id); setFilter("ALL"); };

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("Purchase bills")} sub={t("Enter bill → Article 59 & duplicate checks → account & tax code → journal preview → approval by a second person")} />
      <KpiGrid>
        <Stat label={t("In inbox")} value={<Num v={docs.length} f={String} />} icon={<InboxIcon size={16} />} tone="sky" hint={t("{n} in review", { n: count("REVIEW") })} />
        <Stat label={t("Awaiting approval")} value={<Num v={count("PENDING")} f={String} />} icon={<Clock size={16} />} tone="amber" hint={t("Maker-checker queue")} onClick={() => setFilter("PENDING")} />
        <Stat label={t("Posted to ledger")} value={<Num v={posted.length} f={String} />} icon={<CheckCircle2 size={16} />} tone="emerald" hint={compact(posted.reduce((s, d) => s + d.total, 0))} onClick={() => setFilter("POSTED")} />
        <Stat label={t("Rejected")} value={<Num v={count("REJECTED")} f={String} />} icon={<Ban size={16} />} tone="rose" hint={t("Not posted")} onClick={() => setFilter("REJECTED")} />
      </KpiGrid>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Card title={t("1 · New purchase bill")} sub={t("Attach the PDF or photo, then type in the details")} icon={<UploadCloud size={16} />}>
            <div role="button" tabIndex={0} aria-label={t("Attach a bill file")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) create(f.name); }} onClick={() => fileRef.current?.click()}
              className={cx("rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 outline-none focus-visible:ring-4 focus-visible:ring-emerald-100", drag ? "border-brand-500 bg-brand-50 scale-[1.01]" : "border-slate-200 hover:border-brand-500 hover:bg-brand-50/40")}>
              <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) create(f.name); e.target.value = ""; }} />
              <div className="mx-auto size-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 grid place-items-center ring-1 ring-emerald-100"><Paperclip size={22} /></div>
              <div className="mt-3 text-sm font-medium text-slate-800">{t("Drop the bill file here or click to attach")}</div>
              <div className="text-xs text-slate-500 mt-1">{t("PDF, JPG or PNG. You then enter supplier, amounts and VAT yourself.")}</div>
            </div>
            <button className="btn-ghost w-full mt-3 justify-center" onClick={() => create()}><Plus size={15} />{t("Enter a bill without a file")}</button>
          </Card>

          <section className="card fade-in overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{t("Inbox")}</h3><span className="text-xs text-slate-400 num">{t("{n} results", { n: list.length })}</span></div>
              <SearchInput value={q} onChange={setQ} placeholder={t("Search supplier or invoice no.")} />
              <div className="overflow-x-auto -mx-1 px-1"><Tabs value={filter} onChange={setFilter} items={(["ALL", "REVIEW", "PENDING", "POSTED", "REJECTED"] as const).map((x) => ({ id: x, label: x === "ALL" ? t("All") : `${t(x)} ${count(x as PurchaseDoc["status"]) || ""}` }))} /></div>
            </div>
            {list.length === 0 ? <Empty icon={<Receipt size={22} />}>{t("No bills match. Add one above.")}</Empty> : (
              <ul className="divide-y divide-slate-100 max-h-[460px] overflow-auto">
                {list.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setSelId(d.id)} aria-current={selId === d.id} className={cx("w-full text-start px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-all border-s-2 outline-none focus-visible:bg-emerald-50/60", selId === d.id ? "bg-emerald-50/60 border-emerald-500" : "border-transparent hover:border-slate-200")}>
                      <span className={cx("size-9 shrink-0 rounded-xl grid place-items-center ring-1", d.risk === "High" ? "bg-rose-50 text-rose-500 ring-rose-100" : d.risk === "Medium" ? "bg-amber-50 text-amber-500 ring-amber-100" : "bg-emerald-50 text-emerald-500 ring-emerald-100")}><FileText size={16} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{d.supplier || t("New bill")}</div>
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
          {sel ? <DocReview key={sel.id} doc={sel} /> : (
            <div className="card h-full min-h-80 grid place-items-center text-center p-10 relative overflow-hidden">
              <div className="absolute -top-20 -end-20 size-72 rounded-full bg-emerald-100/60 blur-3xl" />
              <div className="relative"><div className="mx-auto size-16 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-700 grid place-items-center text-white shadow-lg shadow-emerald-200 float"><ShieldCheck size={30} /></div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-6 text-xs">{["You enter", "Rules check", "A second person approves"].map((x, i) => <span key={x} className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{t(x)}</span>{i < 2 && <span className="text-slate-300 rtl:rotate-180">→</span>}</span>)}</div>
                <div className="mt-4 font-medium text-slate-700">{t("Select or add a bill")}</div><p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{t("Nothing is posted to the ledger without passing the compliance checks and a second person's approval.")}</p></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Pipeline({ status }: { status: PurchaseDoc["status"] }) {
  const { t } = useI18n();
  const at = status === "REVIEW" ? 2 : status === "PENDING" ? 3 : status === "POSTED" ? 5 : 2;
  return (
    <div className="card px-3 sm:px-5 py-4 fade-in overflow-x-auto">
      <div className="relative flex justify-between min-w-[420px]">
        <div className="absolute top-3.5 inset-x-6 h-0.5 bg-slate-100 rounded-full" />
        <div className="absolute top-3.5 start-6 h-0.5 rounded-full bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-700" style={{ width: `calc((100% - 3rem) * ${Math.max(0, at - 1) / (PIPE.length - 1)})` }} />
        {PIPE.map((p, i) => (
          <div key={p} className="relative flex flex-col items-center gap-1.5 w-16">
            <span className={cx("size-7 rounded-full grid place-items-center text-[11px] font-semibold transition-all duration-500", status === "REJECTED" && i >= 2 ? "bg-rose-100 text-rose-600" : i < at ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-200" : i === at ? "bg-white ring-2 ring-emerald-500 text-emerald-700 pulse-ring" : "bg-slate-100 text-slate-400")}>{i < at ? "✓" : i + 1}</span>
            <span className={cx("text-[11px] font-medium text-center", i < at ? "text-slate-800" : i === at ? "text-emerald-700" : "text-slate-400")}>{t(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskBadge({ r }: { r: PurchaseDoc["risk"] }) { const { t } = useI18n(); return <Badge tone={r === "High" ? "rose" : r === "Medium" ? "amber" : "emerald"} dot>{t(`${r} risk`)}</Badge>; }
export function StatusBadge({ s }: { s: string }) { const { t } = useI18n(); return <Badge tone={s === "POSTED" || s === "PAID" || s === "DELIVERED" ? "emerald" : s === "PENDING" || s === "UNPAID" ? "amber" : s === "REJECTED" ? "rose" : s === "REVERSED" ? "slate" : "sky"}>{t(s)}</Badge>; }

function DocReview({ doc }: { doc: PurchaseDoc }) {
  const store = useStore();
  const { t, tx, accFull, tax } = useI18n();
  const editable = doc.status === "REVIEW";
  const u = (patch: Partial<PurchaseDoc>) => store.updatePurchase(doc.id, patch);
  const ctt = ctTreatment(doc.account);
  const lines = purchaseLines(doc);
  const fails = doc.checks.filter((c) => !c.ok);
  const invalid = fails.some((f) => f.severity === "error");
  const canApprove = USERS[store.state.session.role].canApprove && doc.createdBy !== store.state.session.user;
  const vatTreat = doc.taxCode === "BLK" || (!doc.supplierTrn && doc.vat > 0 && !doc.foreign) ? { t: "Blocked / non-recoverable", tone: "rose" } : doc.taxCode === "RCS" ? { t: "Reverse charge — Box 3 & 10", tone: "violet" } : doc.taxCode === "SR" ? { t: "Recoverable — Box 9", tone: "emerald" } : { t: "No VAT (out of scope)", tone: "slate" };
  const money = (k: "net" | "vat" | "total", label: string) => <Field label={label}><Input prefix="AED" inputMode="decimal" disabled={!editable} defaultValue={fmtPlain(doc[k])} onBlur={(e) => u({ [k]: toFils(e.target.value) } as Partial<PurchaseDoc>)} /></Field>;
  const text = (k: "supplier" | "supplierTrn" | "invNo" | "currency" | "description", label: string, extra?: object) => <Field label={label}><Input disabled={!editable} defaultValue={doc[k]} onBlur={(e) => u({ [k]: e.target.value } as Partial<PurchaseDoc>)} {...extra} /></Field>;

  return (
    <div className="space-y-4">
      <Pipeline status={doc.status} />
      <Card title={t("2 · Bill details")} sub={doc.fileName ? <span className="flex items-center gap-1"><Paperclip size={12} />{doc.fileName}</span> : t("No file attached")} actions={<div className="flex gap-1.5"><RiskBadge r={doc.risk} /><StatusBadge s={doc.status} /></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {text("supplier", t("Supplier"))}{text("supplierTrn", t("Supplier TRN"), { inputMode: "numeric", dir: "ltr" })}{text("invNo", t("Invoice no."), { dir: "ltr" })}
          <Field label={t("Invoice date")}><Input type="date" disabled={!editable} defaultValue={doc.date} onBlur={(e) => u({ date: e.target.value })} /></Field>
          {money("net", t("Taxable value"))}{money("vat", t("VAT"))}{money("total", t("Total"))}
          {text("currency", t("Currency"))}
          <Field label={t("Supplier location")}><Select disabled={!editable} value={doc.foreign ? "out" : "ae"} onChange={(e) => u({ foreign: e.target.value === "out" })}><option value="ae">{t("UAE")}</option><option value="out">{t("Outside the UAE (reverse charge)")}</option></Select></Field>
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

        <Card title={t("4 · Account & tax code")} sub={t("Pre-filled by rule — always check before submitting")}>
          <div className="space-y-3">
            <Field label={t("Account")}><Select disabled={!editable} value={doc.account} onChange={(e) => u({ account: e.target.value })}>
              {COA.filter((a) => a.type === "EXPENSE" || ["1200", "1500", "1150"].includes(a.code)).map((a) => <option key={a.code} value={a.code}>{accFull(a.code)}</option>)}
            </Select></Field>
            <Field label={t("VAT tax code")}><Select disabled={!editable} value={doc.taxCode} onChange={(e) => u({ taxCode: e.target.value as TaxCode })}>
              {Object.keys(TAX_CODES).filter((k) => k !== "ZR" && k !== "EX").map((k) => <option key={k} value={k}>{k} · {tax(k)}</option>)}
            </Select></Field>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 leading-relaxed"><b>{t("Default from:")}</b> {tx(doc.reasoning)}</div>
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
            <button className="btn-primary" onClick={() => store.submitPurchase(doc.id)}><Send size={15} className="rtl:-scale-x-100" />{t("Submit for approval")}</button>
            <button className="btn-danger" onClick={() => store.rejectPurchase(doc.id)}><Ban size={15} />{t("Reject")}</button>
            <span className="text-xs text-slate-500">{t("A second person must approve before it is posted (maker-checker).")}</span>
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
