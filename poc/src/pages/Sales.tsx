import { useMemo, useState } from "react";
import { Plus, Trash2, Send, Code2, CheckCircle2, XCircle, Wallet, Receipt, Clock, AlertTriangle, Zap, Copy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { invoiceTotals, toPintXml, validatePint } from "../lib/einvoice";
import { isTrn } from "../lib/rules";
import { today, addDays } from "../lib/dates";
import { TERMS_DAYS } from "../lib/subledger";
import { EMIRATES } from "../lib/coa";
import { fmt, toFils, compact } from "../lib/money";
import { daysBetween, TODAY, MONTHS } from "../lib/derive";
import { Badge, Card, DataTable, Field, IconButton, Input, KpiGrid, Modal, Num, PageHeader, Select, Stat, cx } from "../components/ui";
import { C, axis, tipStyle, aedK } from "../components/charts";
import type { Emirate, Org, SaleLine, SalesInvoice, TaxCode } from "../lib/types";

const EINV_TONE: Record<string, string> = { NOT_SENT: "slate", VALIDATED: "sky", SENT: "violet", DELIVERED: "emerald", REJECTED: "rose" };

export function Sales({ org }: { org: Org }) {
  const store = useStore();
  const { t, mon, xDir, yDir } = useI18n();
  const list = store.state.sales.filter((s) => s.orgId === org.id);
  const [creating, setCreating] = useState(false);
  const [xmlId, setXmlId] = useState<string | null>(null);
  const rows = useMemo(() => list.map((s) => ({ s, ...invoiceTotals(s), overdue: s.status === "POSTED" ? Math.max(0, daysBetween(s.dueDate, TODAY)) : 0 })), [list]);
  const invoiced = rows.reduce((a, r) => a + r.total, 0);
  const open = rows.filter((r) => r.s.status === "POSTED");
  const overdue = open.filter((r) => r.overdue > 0);
  const delivered = rows.filter((r) => r.s.einv === "DELIVERED").length;
  const chart = MONTHS.map((m) => ({ label: mon(m), v: rows.filter((r) => r.s.date.startsWith(m)).reduce((a, r) => a + r.total, 0) / 100 }));

  return (
    <>
      <PageHeader eyebrow={t("Accounting")} title={t("Sales & e-invoicing")} sub={t("Bilingual tax invoices · VAT treatment checks · PINT AE (UBL 2.1) generation & ASP transmission (sandbox)")}
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />{t("New tax invoice")}</button>} />
      <KpiGrid>
        <Stat label={t("Invoiced YTD")} value={<Num v={invoiced} f={compact} />} icon={<Receipt size={16} />} tone="sky" hint={t("{n} invoices", { n: rows.length })} spark={chart.map((c) => c.v)} />
        <Stat label={t("Outstanding")} value={<Num v={open.reduce((a, r) => a + r.total, 0)} f={compact} />} icon={<Clock size={16} />} tone="amber" hint={t("{n} unpaid", { n: open.length })} />
        <Stat label={t("Overdue")} value={<Num v={overdue.reduce((a, r) => a + r.total, 0)} f={compact} />} icon={<AlertTriangle size={16} />} tone="rose" hint={t("{n} invoices past due", { n: overdue.length })} />
        <Stat label={t("E-invoices delivered")} value={`${rows.length ? Math.round((delivered / rows.length) * 100) : 0}%`} icon={<Zap size={16} />} tone="emerald" hint={t("{n} via ASP · go-live 1 Jul 2027", { n: delivered })} />
      </KpiGrid>

      <Card title={t("Invoiced by month")} sub={t("Tax-inclusive, AED")} className="mb-4" hover>
        <div className="h-44" dir="ltr"><ResponsiveContainer>
          <BarChart data={chart} margin={{ left: -10, top: 4 }}>
            <defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b9be6" /><stop offset="1" stopColor={C.revenue} /></linearGradient></defs>
            <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
            <XAxis dataKey="label" {...axis} {...xDir} /><YAxis {...axis} {...yDir} tickFormatter={aedK} />
            <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)", radius: 8 }} formatter={(v) => `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`} />
            <Bar dataKey="v" name={t("Invoiced")} fill="url(#sb)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={1100} />
          </BarChart>
        </ResponsiveContainer></div>
      </Card>

      <DataTable title={t("Invoices")} rows={rows} rowKey={(r) => r.s.id} initialSort={{ key: "date", dir: "desc" }}
        search={(r) => `${r.s.invNo} ${r.s.customer} ${r.s.customerTrn}`}
        filters={[
          { key: "st", label: t("Status"), options: [{ value: "POSTED", label: t("UNPAID") }, { value: "PAID", label: t("PAID") }], get: (r) => r.s.status },
          { key: "e", label: t("E-invoice"), options: Object.keys(EINV_TONE).map((k) => ({ value: k, label: t(k) })), get: (r) => r.s.einv },
          { key: "tc", label: t("VAT"), options: [{ value: "SR", label: t("Standard 5%") }, { value: "ZR", label: t("Zero-rated") }], get: (r) => r.s.lines[0]?.taxCode ?? "" },
        ]}
        cols={[
          { key: "no", header: t("Invoice"), sort: (r) => r.s.invNo, cell: (r) => <span className="font-medium text-slate-900 font-mono text-xs" dir="ltr">{r.s.invNo}</span> },
          { key: "date", header: t("Date"), sort: (r) => r.s.date, hide: "sm", cell: (r) => <span className="num text-slate-600">{r.s.date}</span> },
          { key: "cust", header: t("Customer"), sort: (r) => r.s.customer, cell: (r) => <div className="min-w-0"><div className="truncate max-w-56">{r.s.customer}</div><div className="text-xs text-slate-400">{r.s.customerTrn ? `TRN ${r.s.customerTrn}` : r.s.customerCountry !== "AE" ? t("Export · {c}", { c: r.s.customerCountry }) : t("Unregistered")}</div></div> },
          { key: "vat", header: t("VAT"), align: "end", hide: "md", sort: (r) => r.vat, cell: (r) => fmt(r.vat) },
          { key: "tot", header: t("Total"), align: "end", sort: (r) => r.total, cell: (r) => <span className="font-medium">{fmt(r.total)}</span> },
          { key: "st", header: t("Status"), sort: (r) => r.s.status, cell: (r) => r.s.status === "PAID" ? <Badge tone="emerald" dot>{t("PAID")}</Badge> : r.overdue ? <Badge tone="rose" dot>{t("{n}d overdue", { n: r.overdue })}</Badge> : <Badge tone="amber" dot>{t("UNPAID")}</Badge> },
          { key: "e", header: t("E-invoice"), hide: "lg", sort: (r) => r.s.einv, cell: (r) => <Badge tone={EINV_TONE[r.s.einv]}>{t(r.s.einv)}</Badge> },
        ]}
        actions={(r) => <div className="flex justify-end gap-1">
          <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setXmlId(r.s.id)}><Code2 size={13} />{t("PINT AE")}</button>
          {r.s.status === "POSTED" && <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => store.receivePayment(r.s.id)}><Wallet size={13} />{t("Receive")}</button>}
        </div>} />
      {creating && <NewInvoice org={org} onClose={() => setCreating(false)} />}
      {xmlId && <XmlModal inv={store.state.sales.find((s) => s.id === xmlId)!} org={org} onClose={() => setXmlId(null)} />}
    </>
  );
}

function XmlModal({ inv, org, onClose }: { inv: SalesInvoice; org: Org; onClose: () => void }) {
  const store = useStore();
  const { t, tx } = useI18n();
  const res = validatePint(inv, org);
  const xml = toPintXml(inv, org);
  const corners = ["Seller", "Seller ASP", "Buyer ASP", "Buyer", "FTA"];
  return (
    <Modal open onClose={onClose} title={t("E-invoice {ref} — PINT AE", { ref: inv.invNo })} wide
      footer={<>
        <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(xml); store.toast(t("XML copied")); }}><Copy size={15} />{t("Copy XML")}</button>
        {(inv.einv === "NOT_SENT" || inv.einv === "REJECTED") && <button className="btn-primary" onClick={() => store.sendEinvoice(inv.id)}><Send size={15} className="rtl:-scale-x-100" />{t("Validate & transmit via ASP (sandbox)")}</button>}
      </>}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <div className="label">{t("Pre-validation (local rules, before ASP)")}</div>
            <ul className="space-y-1.5">{res.map((r) => <li key={r.rule} className="flex gap-2 text-sm">{r.ok ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />}<span><b className="font-mono text-xs" dir="ltr">{r.rule}</b> {t(r.msg)}</span></li>)}</ul>
          </div>
          <div>
            <div className="label">{t("5-corner flow status")}</div>
            <div className="flex items-center gap-1 text-[11px] mb-2">
              {corners.map((c, i) => {
                const lit = inv.einv === "DELIVERED" || (inv.einv === "SENT" && i <= 1) || (inv.einv === "VALIDATED" && i === 0);
                return <span key={c} className={cx("flex-1 text-center rounded-lg py-1.5 transition-all duration-500", lit ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm" : "bg-slate-100 text-slate-500")}>{t(c)}</span>;
              })}
            </div>
            <ul className="text-xs text-slate-600 space-y-1 font-mono">{inv.einvLog.map((l, i) => <li key={i} className="fade-in">{tx(l)}</li>)}</ul>
          </div>
          <p className="text-xs text-slate-400">{t("Mandatory for SMEs (< AED 50m): appoint ASP by 31 Mar 2027, go-live 1 Jul 2027 — VERIFY.")}</p>
        </div>
        <pre dir="ltr" className="lg:col-span-3 bg-ink-950 text-emerald-200 text-[11px] leading-relaxed rounded-xl p-4 overflow-auto max-h-[55vh] ring-1 ring-white/5">{xml}</pre>
      </div>
    </Modal>
  );
}

function NewInvoice({ org, onClose }: { org: Org; onClose: () => void }) {
  const store = useStore();
  const { t, em, tax } = useI18n();
  const n = store.state.sales.filter((s) => s.orgId === org.id).length + 1001;
  const [f, setF] = useState({ invNo: `INV-${org.id.slice(0, 2).toUpperCase()}-${n + 100}`, date: today(), customer: "", customerTrn: "", customerCountry: "AE", emirate: org.emirate as Emirate });
  const rev = org.industry === "Professional services" ? "4010" : "4000";
  const [lines, setLines] = useState<(Omit<SaleLine, "price"> & { price: string })[]>([{ desc: "", qty: 1, price: "", taxCode: "SR", account: rev }]);
  const inv = { ...f, orgId: org.id, dueDate: addDays(f.date, TERMS_DAYS), lines: lines.map((l) => ({ ...l, price: toFils(l.price || 0) })) };
  const tt = invoiceTotals(inv as SalesInvoice);
  const trnBad = !!f.customerTrn && !isTrn(f.customerTrn);
  const hints: { ok: boolean; msg: string }[] = [
    { ok: f.customerCountry === "AE" || lines.every((l) => l.taxCode !== "SR"), msg: "Export to non-UAE customer — consider zero-rating (Art 45) if export evidence is held" },
    { ok: f.customerCountry !== "AE" || lines.every((l) => l.taxCode !== "ZR"), msg: "Zero-rating a domestic supply requires a specific legal basis" },
    { ok: tt.total < 10_000_00 || !!f.customer, msg: "Full tax invoice (> AED 10,000) needs recipient details" },
  ];
  const setCountry = (c: string) => { setF({ ...f, customerCountry: c }); if (c !== "AE") setLines(lines.map((l) => ({ ...l, taxCode: l.taxCode === "SR" ? "ZR" : l.taxCode }))); };
  const setLine = (i: number, p: Partial<(typeof lines)[0]>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const can = !!f.customer && tt.net > 0 && !trnBad && lines.every((l) => l.desc);

  return (
    <Modal open onClose={onClose} title={t("New tax invoice")} wide
      footer={<><span className="me-auto text-xs text-slate-500">{t("Posts Dr Receivables / Cr Revenue & VAT output on issue")}</span><button className="btn-ghost" onClick={onClose}>{t("Cancel")}</button><button className="btn-primary" disabled={!can} onClick={() => { store.createSale(inv); onClose(); }}>{t("Issue & post invoice")}</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <Field label={t("Invoice no.")}><Input dir="ltr" value={f.invNo} onChange={(e) => setF({ ...f, invNo: e.target.value })} /></Field>
        <Field label={t("Date of supply")}><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t("Place of supply (emirate)")}><Select value={f.emirate} onChange={(e) => setF({ ...f, emirate: e.target.value as Emirate })}>{Object.keys(EMIRATES).map((k) => <option key={k} value={k}>{em(k)}</option>)}</Select></Field>
        <Field label={t("Customer")}><Input value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} placeholder={t("Customer name")} /></Field>
        <Field label={t("Customer TRN")} error={trnBad ? t("TRN must be 15 digits starting with 1") : undefined} hint={t("Optional for unregistered customers")}><Input dir="ltr" inputMode="numeric" value={f.customerTrn} onChange={(e) => setF({ ...f, customerTrn: e.target.value })} placeholder="100xxxxxxxxxxx3" /></Field>
        <Field label={t("Customer country")}><Select value={f.customerCountry} onChange={(e) => setCountry(e.target.value)}>{["AE", "SA", "OM", "BH", "QA", "KW", "IN", "GB", "US"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <div className="mt-5 rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead><tr><th className="th">{t("Description")}</th><th className="th w-20">{t("Qty")}</th><th className="th w-36">{t("Unit price")}</th><th className="th w-40">{t("VAT")}</th><th className="th w-28 !text-end">{t("Net")}</th><th className="th w-10" /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="p-2"><Input aria-label={t("Description")} value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} placeholder={t("Goods / services")} /></td>
              <td className="p-2"><Input aria-label={t("Qty")} type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td className="p-2"><Input aria-label={t("Unit price")} prefix="AED" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="0.00" /></td>
              <td className="p-2"><Select aria-label={t("VAT")} value={l.taxCode} onChange={(e) => setLine(i, { taxCode: e.target.value as TaxCode })}>{["SR", "ZR", "EX", "OS"].map((k) => <option key={k} value={k}>{tax(k)}</option>)}</Select></td>
              <td className="p-2 pt-4 text-end num text-sm">{fmt(tt.lines[i]?.net ?? 0)}</td>
              <td className="p-2 pt-3">{lines.length > 1 && <IconButton label={t("Remove line")} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="hover:!text-rose-600 hover:!bg-rose-50"><Trash2 size={15} /></IconButton>}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="px-3 py-2 bg-slate-50/70 border-t border-slate-100"><button className="btn-ghost !text-xs !py-1" onClick={() => setLines([...lines, { desc: "", qty: 1, price: "", taxCode: lines[0].taxCode, account: rev }])}><Plus size={13} />{t("Add line")}</button></div>
      </div>
      <div className="flex flex-wrap justify-between gap-4 mt-5">
        <ul className="text-xs space-y-1.5 max-w-md">{hints.filter((h) => !h.ok).map((h) => <li key={h.msg} className="flex gap-1.5 text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{t(h.msg)}</li>)}{hints.every((h) => h.ok) && <li className="flex gap-1.5 text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5"><CheckCircle2 size={13} className="shrink-0 mt-0.5" />{t("AI checks: TRN, VAT rate, export / zero-rating look consistent")}</li>}</ul>
        <div className="text-sm w-full sm:w-64 space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="flex justify-between"><span className="text-slate-500">{t("Net")}</span><span className="num">{fmt(tt.net)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("VAT 5%")}</span><span className="num">{fmt(tt.vat)}</span></div>
          <div className="flex justify-between font-semibold text-base border-t border-slate-200 pt-1.5"><span>{t("Total AED")}</span><span className="num">{fmt(tt.total)}</span></div>
        </div>
      </div>
    </Modal>
  );
}
