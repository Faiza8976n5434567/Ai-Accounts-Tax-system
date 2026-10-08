/** Profit & loss, balance sheet, ageing and customer/supplier statements (P2-06 · D-28 · RPT-01 → 04). Every
 *  account figure opens its general ledger (Principle 10); Excel and Print/PDF use exactly the rows on screen. */
import { useCallback, useState, type ReactNode } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Badge, Card } from "../components/ui";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import { listContacts } from "../lib/contacts";
import type { Client } from "../lib/clients";
import { fyStart } from "../lib/live-reports";
import { SOURCE_LABEL } from "../lib/journals";
import {
  ageing, ageingBuckets, ageingByContact, balanceSheet, bsLayout, contactStatement, downloadXlsx, pnlLayout, profitAndLoss, xlsxRow, type Cell,
} from "../lib/financial";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const inputCls = "rounded-xl border border-slate-200 px-3 py-1.5 text-sm bg-white";
const neg = (f: number) => (f < 0 ? `(${fmt(-f)})` : fmt(f));
const DateBox = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label><span className="block text-xs font-medium text-slate-600 mb-1">{label}</span><input aria-label={label} type="date" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} /></label>
);
function ExportButtons({ onExcel }: { onExcel: () => Promise<void> }) {
  const toast = useToast();
  return <div className="flex gap-2 no-print">
    <button className="btn-ghost" onClick={() => void onExcel().catch(() => toast("The Excel file could not be created", "err"))}><FileSpreadsheet size={15} />Excel</button>
    <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} />Print / PDF</button>
  </div>;
}
/** The printable header: client name and the report's title and date. */
const PrintHead = ({ client, title, when }: { client: Client; title: string; when: string }) => (
  <div className="px-5 pt-1 pb-3"><div className="text-lg font-semibold text-slate-900">{client.legal_name}</div><div className="text-sm text-slate-600">{title} · {when}</div></div>
);
const Row = ({ label, amount, strong, indent, onClick }: { label: ReactNode; amount: number | null; strong?: boolean; indent?: boolean; onClick?: () => void }) => (
  <tr className={`${onClick ? "hover:bg-slate-50/70 cursor-pointer" : ""} ${strong ? "font-semibold" : ""}`} onClick={onClick}>
    <td className={`td ${indent ? "ps-8" : ""}`}>{label}</td><td className="td text-end num">{amount === null ? "" : neg(amount)}</td>
  </tr>
);

// ── Profit & loss ───────────────────────────────────────────────────────────────────────
export function PnlView({ client, onLedger }: { client: Client; onLedger: (accountId: string, from: string, to: string) => void }) {
  const today = useToday();
  const [from, setFrom] = useState(fyStart(today, client.fy_start_month));
  const [to, setTo] = useState(today);
  const fetch = useCallback(() => (from <= to ? profitAndLoss(client.id, from, to) : Promise.resolve([])), [client.id, from, to]);
  const { data } = useLoad(fetch);
  const r = pnlLayout(data ?? []);
  const excel = () => downloadXlsx(`${client.legal_name} - Profit and loss ${from} to ${to}.xlsx`, "Profit and loss", [
    xlsxRow([client.legal_name]), xlsxRow([`Profit and loss ${shortDate(from)} – ${shortDate(to)} (AED)`]), [],
    ...r.sections.flatMap((s) => s.rows.length ? [xlsxRow([s.title]), ...s.rows.map((x) => xlsxRow([`  ${x.code} ${x.name}`, { fils: x.amount }])), xlsxRow([`Total ${s.title.toLowerCase()}`, { fils: s.total }])] : []),
    [], xlsxRow(["Gross profit", { fils: r.grossProfit }]), xlsxRow(["Profit before tax", { fils: r.beforeTax }]), xlsxRow(["Net profit / (loss)", { fils: r.netProfit }]),
  ] as Cell[][]);
  return (
    <Card title="Profit & loss" pad={false} actions={<div className="flex flex-wrap items-end gap-3 no-print"><DateBox label="From" value={from} onChange={setFrom} /><DateBox label="To" value={to} onChange={setTo} /><ExportButtons onExcel={excel} /></div>}
      sub="Income and expenses of the period. Click an account to see the postings behind it.">
      <div className="print-area">
        <PrintHead client={client} title="Profit and loss (AED)" when={`${shortDate(from)} – ${shortDate(to)}`} />
        <table className="w-full max-w-3xl"><tbody>
          {!data && <tr><td className="td text-slate-500">Loading…</td></tr>}
          {r.sections.map((s, i) => s.rows.length > 0 && (
            <SectionRows key={s.title} title={s.title} total={s.total}>
              {s.rows.map((x) => <Row key={x.account_id} indent label={<><span className="font-mono text-xs text-slate-500 me-2">{x.code}</span>{x.name}</>} amount={x.amount} onClick={() => onLedger(x.account_id, from, to)} />)}
              {i === 1 && <Row strong label="Gross profit" amount={r.grossProfit} />}
            </SectionRows>
          ))}
          {data && data.length > 0 && <>
            <Row strong label="Profit before tax" amount={r.beforeTax} />
            <tr className="font-semibold bg-slate-50"><td className="td">Net profit / (loss) for the period</td><td className="td text-end num">{neg(r.netProfit)}</td></tr>
          </>}
          {data && data.length === 0 && <tr><td className="td text-slate-500">No income or expenses in this period.</td></tr>}
        </tbody></table>
      </div>
    </Card>
  );
}
const SectionRows = ({ title, total, children }: { title: string; total: number; children: ReactNode }) => (
  <>
    <tr><td className="td pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500" colSpan={2}>{title}</td></tr>
    {children}
    <Row strong label={`Total ${title.toLowerCase()}`} amount={total} />
  </>
);

// ── Balance sheet ───────────────────────────────────────────────────────────────────────
export function BalanceSheetView({ client, onLedger }: { client: Client; onLedger: (accountId: string, from: string, to: string) => void }) {
  const today = useToday();
  const [asOf, setAsOf] = useState(today);
  const fetch = useCallback(() => balanceSheet(client.id, asOf), [client.id, asOf]);
  const { data } = useLoad(fetch);
  const r = bsLayout(data ?? []);
  const yearStart = fyStart(asOf, client.fy_start_month);
  const label = (x: { code: string | null; name: string }) => (x.code ? `${x.code} ${x.name}` : x.name);
  const excel = () => downloadXlsx(`${client.legal_name} - Balance sheet ${asOf}.xlsx`, "Balance sheet", [
    xlsxRow([client.legal_name]), xlsxRow([`Balance sheet at ${shortDate(asOf)} (AED)`]), [],
    ...(["assets", "liabilities", "equity"] as const).flatMap((k) => [xlsxRow([k[0].toUpperCase() + k.slice(1)]),
      ...r[k].groups.flatMap((g) => [xlsxRow([`  ${g.name}`]), ...g.rows.map((x) => xlsxRow([`    ${label(x)}`, { fils: x.amount }]))]), xlsxRow([`Total ${k}`, { fils: r[k].total }]), []]),
    xlsxRow(["Total liabilities and equity", { fils: r.liabilities.total + r.equity.total }]),
  ] as Cell[][]);
  const section = (k: "assets" | "liabilities" | "equity", title: string) => (
    <>
      <tr><td className="td pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500" colSpan={2}>{title}</td></tr>
      {r[k].groups.map((g) => (
        <GroupRows key={g.name} name={g.name}>
          {g.rows.map((x) => <Row key={x.account_id ?? x.row_kind} indent label={x.code ? <><span className="font-mono text-xs text-slate-500 me-2">{x.code}</span>{x.name}</> : <i>{x.name}</i>}
            amount={x.amount} onClick={x.account_id ? () => onLedger(x.account_id!, yearStart, asOf) : undefined} />)}
        </GroupRows>
      ))}
      <Row strong label={`Total ${title.toLowerCase()}`} amount={r[k].total} />
    </>
  );
  return (
    <Card title="Balance sheet" pad={false} actions={<div className="flex flex-wrap items-end gap-3 no-print"><DateBox label="As at" value={asOf} onChange={setAsOf} /><ExportButtons onExcel={excel} /></div>}
      sub="Assets, liabilities and equity at the date. Earlier years' results stay in equity until the year-end closing (D-28).">
      <div className="print-area">
        <PrintHead client={client} title="Balance sheet (AED)" when={`at ${shortDate(asOf)}`} />
        <table className="w-full max-w-3xl"><tbody>
          {!data && <tr><td className="td text-slate-500">Loading…</td></tr>}
          {data && <>{section("assets", "Assets")}{section("liabilities", "Liabilities")}{section("equity", "Equity")}
            <tr className="font-semibold bg-slate-50"><td className="td">Total liabilities and equity {r.balanced ? <Badge tone="emerald" dot className="ms-2 no-print">Balanced</Badge> : <Badge tone="rose" dot className="ms-2">Out of balance</Badge>}</td>
              <td className="td text-end num">{neg(r.liabilities.total + r.equity.total)}</td></tr></>}
        </tbody></table>
      </div>
    </Card>
  );
}
const GroupRows = ({ name, children }: { name: string; children: ReactNode }) => (
  <><tr><td className="td ps-4 text-sm font-medium text-slate-700" colSpan={2}>{name}</td></tr>{children}</>
);

// ── Ageing ──────────────────────────────────────────────────────────────────────────────
export function AgeingView({ client }: { client: Client }) {
  const today = useToday();
  const [side, setSide] = useState<"customer" | "supplier">("customer");
  const [asOf, setAsOf] = useState(today);
  const fetch = useCallback(() => ageing(client.id, side, asOf), [client.id, side, asOf]);
  const fetchBuckets = useCallback(() => ageingBuckets(client.firm_id), [client.firm_id]);
  const { data } = useLoad(fetch);
  const { data: buckets } = useLoad(fetchBuckets);
  const b = buckets ?? [];
  const r = ageingByContact(data ?? [], b);
  const sign = side === "customer" ? 1 : -1;                      // suppliers: what we owe, shown positive
  const title = side === "customer" ? "Customer ageing (receivables)" : "Supplier ageing (payables)";
  const excel = () => downloadXlsx(`${client.legal_name} - ${side === "customer" ? "AR" : "AP"} ageing ${asOf}.xlsx`, "Ageing", [
    xlsxRow([client.legal_name]), xlsxRow([`${title} at ${shortDate(asOf)} (AED)`]), [],
    xlsxRow([side === "customer" ? "Customer" : "Supplier", ...b.map((x) => x.label), "Total"]),
    ...r.list.map((c) => xlsxRow([c.contact, ...c.buckets.map((v) => ({ fils: v * sign })), { fils: c.total * sign }])),
    xlsxRow(["Total", ...r.totals.map((v) => ({ fils: v * sign })), { fils: r.total * sign }]),
  ] as Cell[][]);
  return (
    <Card title={title} pad={false}
      actions={<div className="flex flex-wrap items-end gap-3 no-print">
        <label><span className="block text-xs font-medium text-slate-600 mb-1">Show</span>
          <select aria-label="Customers or suppliers" className={inputCls} value={side} onChange={(e) => setSide(e.target.value as "customer" | "supplier")}><option value="customer">Customers</option><option value="supplier">Suppliers</option></select></label>
        <DateBox label="As at" value={asOf} onChange={setAsOf} /><ExportButtons onExcel={excel} /></div>}
      sub="Open invoices or bills at the date, by days past the due date (buckets are a firm setting). The total equals the control account (ARAP-02/03).">
      <div className="print-area">
        <PrintHead client={client} title={`${title} (AED)`} when={`at ${shortDate(asOf)}`} />
        <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">{side === "customer" ? "Customer" : "Supplier"}</th>{b.map((x) => <th key={x.label} className="th text-end">{x.label}</th>)}<th className="th text-end">Total</th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={b.length + 2}>Loading…</td></tr>}
            {data && r.list.length === 0 && <tr><td className="td text-slate-500" colSpan={b.length + 2}>Nothing open at this date.</td></tr>}
            {r.list.map((c) => <tr key={c.contact}><td className="td">{c.contact}</td>{c.buckets.map((v, i) => <td key={i} className="td text-end num">{v ? neg(v * sign) : ""}</td>)}<td className="td text-end num font-medium">{neg(c.total * sign)}</td></tr>)}
            {r.list.length > 0 && <tr className="font-semibold bg-slate-50"><td className="td">Total</td>{r.totals.map((v, i) => <td key={i} className="td text-end num">{neg(v * sign)}</td>)}<td className="td text-end num">{neg(r.total * sign)}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </Card>
  );
}

// ── Customer / supplier statement ───────────────────────────────────────────────────────
export function StatementView({ client }: { client: Client }) {
  const today = useToday();
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data: contacts } = useLoad(fetchContacts);
  const [side, setSide] = useState<"customer" | "supplier">("customer");
  const [contactId, setContactId] = useState("");
  const [from, setFrom] = useState(fyStart(today, client.fy_start_month));
  const [to, setTo] = useState(today);
  const fetch = useCallback(() => (contactId && from <= to ? contactStatement(client.id, contactId, side, from, to) : Promise.resolve(null)), [client.id, contactId, side, from, to]);
  const { data } = useLoad(fetch);
  const people = (contacts ?? []).filter((c) => (side === "customer" ? c.kind !== "supplier" : c.kind !== "customer"));
  const contact = people.find((c) => c.id === contactId);
  const closing = data && data.length ? data[data.length - 1].balance : 0;
  const bal = (v: number) => side === "customer" ? (v < 0 ? `${fmt(-v)} in your favour` : fmt(v)) : (v < 0 ? `${fmt(-v)} advance` : fmt(v));
  const excel = () => downloadXlsx(`${client.legal_name} - Statement ${contact?.name ?? ""} ${to}.xlsx`, "Statement", [
    xlsxRow([client.legal_name]), xlsxRow([`Statement of account — ${contact?.name ?? ""}`]), xlsxRow([`${shortDate(from)} – ${shortDate(to)} (AED)`]), [],
    xlsxRow(["Date", "Reference", "Details", "Debit", "Credit", "Balance"]),
    ...(data ?? []).map((x) => xlsxRow([shortDate(x.entry_date), x.journal_no ?? "", x.row_kind === "opening" ? "Balance brought forward" : (x.description ?? x.memo ?? ""),
      x.debit ? { fils: x.debit } : null, x.credit ? { fils: x.credit } : null, { fils: x.balance }])),
  ] as Cell[][]);
  return (
    <Card title="Statement of account" pad={false}
      actions={<div className="flex flex-wrap items-end gap-3 no-print">
        <label><span className="block text-xs font-medium text-slate-600 mb-1">For</span>
          <select aria-label="Customer or supplier statement" className={inputCls} value={side} onChange={(e) => { setSide(e.target.value as "customer" | "supplier"); setContactId(""); }}><option value="customer">Customer</option><option value="supplier">Supplier</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1">{side === "customer" ? "Customer" : "Supplier"}</span>
          <select aria-label="Statement contact" className={`${inputCls} max-w-64`} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Choose…</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <DateBox label="From" value={from} onChange={setFrom} /><DateBox label="To" value={to} onChange={setTo} />
        {contactId && <ExportButtons onExcel={excel} />}</div>}
      sub="Everything posted for one customer or supplier, with the balance brought forward — print it as a PDF to send.">
      {!contactId ? <p className="px-5 pb-5 text-sm text-slate-500">Choose a {side}.</p> : (
        <div className="print-area">
          <div className="px-5 pt-1 pb-3 flex flex-wrap justify-between gap-4">
            <div><div className="text-lg font-semibold text-slate-900">{client.legal_name}</div>{client.address && <div className="text-xs text-slate-600 whitespace-pre-line">{client.address}</div>}{client.trn && <div className="text-xs text-slate-600">TRN {client.trn}</div>}</div>
            <div className="text-end"><div className="text-sm font-semibold">Statement of account</div><div className="text-sm">{contact?.name}</div><div className="text-xs text-slate-600">{shortDate(from)} – {shortDate(to)} · AED</div></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Date</th><th className="th">Reference</th><th className="th">Details</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th><th className="th text-end">Balance</th></tr></thead>
            <tbody>
              {!data && <tr><td className="td text-slate-500" colSpan={6}>Loading…</td></tr>}
              {(data ?? []).map((x, i) => x.row_kind === "opening"
                ? <tr key="bf" className="bg-slate-50"><td className="td">{shortDate(x.entry_date)}</td><td className="td" colSpan={4}>Balance brought forward</td><td className="td text-end num">{bal(x.balance)}</td></tr>
                : <tr key={i}><td className="td">{shortDate(x.entry_date)}</td><td className="td font-mono text-xs">{x.journal_no}</td>
                    <td className="td text-sm">{x.source ? `${SOURCE_LABEL[x.source]} · ` : ""}{x.description ?? x.memo}</td>
                    <td className="td text-end num">{x.debit ? fmt(x.debit) : ""}</td><td className="td text-end num">{x.credit ? fmt(x.credit) : ""}</td><td className="td text-end num">{bal(x.balance)}</td></tr>)}
              {data && <tr className="font-semibold bg-slate-50"><td className="td" colSpan={5}>{side === "customer" ? "Balance due" : "Balance owed"} at {shortDate(to)}</td><td className="td text-end num">{bal(closing)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </Card>
  );
}

