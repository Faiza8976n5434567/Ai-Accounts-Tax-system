/** Printable tax invoice / credit note (P2-02 · Exec. Reg. Art 59). Use the browser's Print → Save as PDF. */
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import type { Client, Emirate } from "../lib/clients";
import type { Contact } from "../lib/contacts";
import type { InvoiceWithLines } from "../lib/invoices";
import { supabase } from "../lib/supabase";

const RATE_LABEL: Record<string, string> = { ZR: "0%", EX: "Exempt", OS: "Out of scope" };

export function InvoicePrint({ inv, original, client, customer, emirates, onClose }: {
  inv: InvoiceWithLines; original?: InvoiceWithLines; client: Client; customer?: Contact; emirates: Emirate[]; onClose: () => void;
}) {
  const [vatPct, setVatPct] = useState<string>("");
  useEffect(() => {
    let live = true;
    supabase?.rpc("config_value", { p_key: "vat.rate_bp", p_on: inv.issue_date }).then(({ data }) => { if (live) setVatPct(`${fmt(Number(data ?? 0)).replace(/\.00$/, "")}%`); }, () => {});
    return () => { live = false; };
  }, [inv.issue_date]);

  const credit = inv.doc_type === "credit_note";
  const title = `${client.vat_registered ? "Tax " : ""}${credit ? "Credit Note" : "Invoice"}`;
  const usd = inv.currency !== "AED";
  const emirate = emirates.find((e) => e.code === inv.supply_emirate)?.name ?? inv.supply_emirate;

  return (
    <div className="print-area fixed inset-0 z-[80] overflow-auto bg-slate-100 print:bg-white">
      <div className="no-print sticky top-0 flex justify-end gap-2 p-3 bg-slate-100/90 backdrop-blur">
        <button className="btn-primary bg-emerald-600" onClick={() => window.print()}><Printer size={15} />Print / Save as PDF</button>
        <button className="btn-ghost" onClick={onClose}><X size={15} />Close</button>
      </div>
      <article className="mx-auto my-4 max-w-[800px] bg-white p-10 shadow-lg print:shadow-none print:my-0 text-[13px] text-slate-900">
        {inv.status !== "posted" && <p className="mb-4 rounded bg-amber-100 px-3 py-2 text-center font-semibold text-amber-900">DRAFT — not yet approved; not a valid {title.toLowerCase()}</p>}
        <header className="flex justify-between gap-6 border-b border-slate-300 pb-5">
          <div>
            <div className="text-lg font-bold">{client.legal_name}</div>
            {client.trade_name && client.trade_name !== client.legal_name && <div className="text-slate-600">{client.trade_name}</div>}
            <div className="whitespace-pre-line text-slate-700">{client.address ?? "Address not set — add it under Overview → Edit details"}</div>
            {client.trn && <div className="mt-1">TRN: <span className="font-mono">{client.trn}</span></div>}
          </div>
          <div className="text-end">
            <div className="text-2xl font-bold tracking-tight">{title}</div>
            <div className="mt-1 font-mono">{inv.invoice_no ?? "—"}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{credit ? "Credited to" : "Bill to"}</div>
            <div className="font-semibold">{inv.customer}</div>
            {customer?.address && <div className="whitespace-pre-line text-slate-700">{customer.address}</div>}
            {customer && customer.country_code !== "AE" && <div className="text-slate-700">Country: {customer.country_code}</div>}
            {customer?.trn && <div className="mt-1">TRN: <span className="font-mono">{customer.trn}</span></div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 content-start text-end">
            <dt className="text-slate-500">Date of issue</dt><dd>{shortDate(inv.issue_date)}</dd>
            {inv.supply_date && inv.supply_date !== inv.issue_date && <><dt className="text-slate-500">Date of supply</dt><dd>{shortDate(inv.supply_date)}</dd></>}
            {!credit && <><dt className="text-slate-500">Due date</dt><dd>{shortDate(inv.due_date)}</dd></>}
            {credit && original && <><dt className="text-slate-500">Original invoice</dt><dd className="font-mono">{original.invoice_no} ({shortDate(original.issue_date)})</dd></>}
            {inv.customer_reference && <><dt className="text-slate-500">Your reference</dt><dd>{inv.customer_reference}</dd></>}
            <dt className="text-slate-500">Place of supply</dt><dd>{emirate}</dd>
          </dl>
        </section>

        <table className="w-full border-collapse">
          <thead><tr className="border-y border-slate-300 text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="py-2">Description</th><th className="py-2 text-end">Qty</th><th className="py-2 text-end">Unit price ({inv.currency})</th>
            <th className="py-2 text-end">Taxable amount (AED)</th><th className="py-2 text-end">VAT rate</th><th className="py-2 text-end">VAT (AED)</th></tr></thead>
          <tbody>{inv.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              <td className="py-2 pe-3">{l.description}</td><td className="py-2 text-end">{Number(l.quantity)}</td><td className="py-2 text-end">{fmt(l.unit_price)}</td>
              <td className="py-2 text-end">{fmt(l.net)}</td><td className="py-2 text-end">{l.tax_code === "SR" ? vatPct : RATE_LABEL[l.tax_code]}</td><td className="py-2 text-end">{fmt(l.vat)}</td>
            </tr>
          ))}</tbody>
        </table>

        <section className="mt-4 ms-auto w-80">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1">
            <dt>Total excluding VAT</dt><dd className="text-end">AED {fmt(inv.net_total)}</dd>
            <dt>VAT{vatPct && ` (${vatPct})`}</dt><dd className="text-end">AED {fmt(inv.vat_total)}</dd>
            <dt className="border-t border-slate-300 pt-1 font-bold">{credit ? "Total credited" : "Total payable"}</dt><dd className="border-t border-slate-300 pt-1 text-end font-bold">AED {fmt(inv.gross_total)}</dd>
            {usd && <><dt className="text-slate-600">Total in {inv.currency}</dt><dd className="text-end text-slate-600">{inv.currency} {fmt(inv.gross_total_fcy)}</dd></>}
          </dl>
          {usd && <p className="mt-2 text-xs text-slate-600">Amounts converted at 1 {inv.currency} = {Number(inv.fx_rate)} AED; VAT is calculated and payable in AED.</p>}
        </section>

        {inv.notes && <p className="mt-6 text-slate-700">{inv.notes}</p>}
        <footer className="mt-10 border-t border-slate-200 pt-3 text-xs text-slate-500">
          {client.legal_name}{client.trn && ` · TRN ${client.trn}`}{client.licence_no && ` · Licence ${client.licence_no}`}
        </footer>
      </article>
    </div>
  );
}
