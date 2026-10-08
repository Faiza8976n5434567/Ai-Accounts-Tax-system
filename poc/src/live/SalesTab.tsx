/** Sales invoices and credit notes for one client (P2-02 · D-10, D-21, D-22, D-29, D-30). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FilePlus2, Plus, Printer, ReceiptText, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt, fmtPlain, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { listContacts, type Contact } from "../lib/contacts";
import type { Account, Client, Emirate, TaxPeriod } from "../lib/clients";
import { listEmirates } from "../lib/clients";
import {
  creditRemaining, deleteInvoice, documentTotals, lineAmounts, listInvoices, parseQuantity, postInvoice, SALES_TAX_CODES, saveInvoice,
  sendBackInvoice, submitInvoice, taxDateWarnings, type InvoiceDraft, type InvoiceWithLines,
} from "../lib/invoices";
import { supabase } from "../lib/supabase";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";
import { InvoicePrint } from "./InvoicePrint";

const STATUS: Record<string, [string, string]> = { draft: ["Draft", "slate"], pending: ["Waiting for approval", "amber"], posted: ["Posted", "emerald"] };
type Filter = "all" | "draft" | "pending" | "posted" | "credit_note";
const money = (fils: number, currency = "AED") => `${currency} ${fmt(fils)}`;

/** Rules in force on a date, for the live preview (the database recalculates on posting). */
async function rulesOn(date: string) {
  const get = async (key: string) => (await supabase!.rpc("config_value", { p_key: key, p_on: date })).data;
  const [vat, fx, days] = await Promise.all([get("vat.rate_bp"), get("fx.usd_aed"), get("vat.invoice_issue_days")]);
  return { vatBp: Number(vat ?? 0), usdAed: String(fx ?? "1"), issueDays: Number(days ?? 14) };
}

export function SalesTab({ client, accounts, taxPeriods, perms }: { client: Client; accounts: Account[]; taxPeriods: TaxPeriod[]; perms: string[] }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetchInvoices = useCallback(() => listInvoices(client.id), [client.id]);
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data, error, reload } = useLoad(fetchInvoices);
  const { data: contacts } = useLoad(fetchContacts);
  const { data: emirates } = useLoad(listEmirates);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<InvoiceWithLines | null>(null);
  const [editing, setEditing] = useState<{ invoice: InvoiceWithLines | null; creditFor: InvoiceWithLines | null } | null>(null);
  const [printing, setPrinting] = useState<InvoiceWithLines | null>(null);

  const invoices = useMemo(() => data ?? [], [data]);
  const shown = invoices.filter((i) => filter === "all" || (filter === "credit_note" ? i.doc_type === "credit_note" : i.status === filter));
  const canPrepare = perms.includes("prepare"), canApprove = perms.includes("approve_document");

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); setOpen(null); reload(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };

  return (
    <>
      <Card title="Sales invoices & credit notes" icon={<ReceiptText size={16} />} pad={false}
        sub="Prepared, then approved by someone else. Approval gives the number (INV-/CN-) and posts the journal. Posted invoices are corrected only by credit notes."
        actions={canPrepare && <button className="btn-primary bg-emerald-600" onClick={() => setEditing({ invoice: null, creditFor: null })}><Plus size={15} />New invoice</button>}>
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {(["all", "draft", "pending", "posted", "credit_note"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
              {f === "all" ? "All" : f === "credit_note" ? "Credit notes" : STATUS[f][0]}{f === "pending" && invoices.some((i) => i.status === "pending") ? ` (${invoices.filter((i) => i.status === "pending").length})` : ""}
            </button>
          ))}
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load invoices.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[860px]">
          <thead><tr><th className="th">Number</th><th className="th">Date</th><th className="th">Customer</th><th className="th">Type</th><th className="th">Status</th><th className="th text-end">Net</th><th className="th text-end">VAT</th><th className="th text-end">Total (AED)</th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={8}>Loading…</td></tr>}
            {data && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>No invoices here yet.</td></tr>}
            {shown.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpen(i)}>
                <td className="td font-mono text-xs">{i.invoice_no ?? <span className="text-slate-400">—</span>}</td>
                <td className="td">{shortDate(i.issue_date)}</td>
                <td className="td">{i.customer}</td>
                <td className="td">{i.doc_type === "invoice" ? "Invoice" : <Badge tone="rose">Credit note</Badge>}{i.currency !== "AED" && <Badge className="ms-1.5">{i.currency}</Badge>}</td>
                <td className="td"><Badge tone={STATUS[i.status][1]} dot>{STATUS[i.status][0]}</Badge></td>
                <td className="td text-end num">{fmt(i.net_total)}</td><td className="td text-end num">{fmt(i.vat_total)}</td><td className="td text-end num font-medium">{fmt(i.gross_total)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {open && <InvoiceView inv={open} all={invoices} accounts={accounts} me={auth.userId} canPrepare={canPrepare} canApprove={canApprove} onClose={() => setOpen(null)}
        onPrint={() => { setPrinting(open); setOpen(null); }}
        onEdit={() => { setEditing({ invoice: open, creditFor: null }); setOpen(null); }}
        onCredit={() => { setEditing({ invoice: null, creditFor: open }); setOpen(null); }}
        onSubmit={() => act(() => submitInvoice(open.id), "Sent for approval")}
        onDelete={() => act(() => deleteInvoice(open.id), "Draft deleted")}
        onApprove={() => act(async () => toast(`Posted as ${await postInvoice(open.id)}`), "Journal posted")}
        onSendBack={(reason) => act(() => sendBackInvoice(open.id, reason), "Sent back to the preparer")} />}

      {printing && <InvoicePrint inv={printing} original={invoices.find((x) => x.id === printing.original_invoice_id)} client={client}
        customer={contacts?.find((c) => c.id === printing.contact_id)} emirates={emirates ?? []} onClose={() => setPrinting(null)} />}

      {editing && contacts && emirates && <InvoiceEditor client={client} accounts={accounts} contacts={contacts} emirates={emirates} taxPeriods={taxPeriods}
        invoice={editing.invoice} creditFor={editing.creditFor} all={invoices} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────────────────
function InvoiceView({ inv, all, accounts, me, canPrepare, canApprove, onClose, onPrint, onEdit, onCredit, onSubmit, onDelete, onApprove, onSendBack }: {
  inv: InvoiceWithLines; all: InvoiceWithLines[]; accounts: Account[]; me: string; canPrepare: boolean; canApprove: boolean;
  onClose: () => void; onPrint: () => void; onEdit: () => void; onCredit: () => void; onSubmit: () => void; onDelete: () => void; onApprove: () => void; onSendBack: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const accName = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]));
  const mine = inv.prepared_by === me;
  const remaining = inv.doc_type === "invoice" && inv.status === "posted" ? creditRemaining(inv, all) : null;
  const original = inv.original_invoice_id ? all.find((x) => x.id === inv.original_invoice_id) : undefined;
  return (
    <Modal open wide onClose={onClose} title={`${inv.doc_type === "invoice" ? "Invoice" : "Credit note"} ${inv.invoice_no ?? "(draft)"} · ${inv.customer}`}
      footer={<>
        <button className="btn-ghost me-auto" onClick={onClose}>Close</button>
        <button className="btn-ghost" onClick={onPrint}><Printer size={15} />Print / PDF</button>
        {inv.status === "draft" && canPrepare && <><button className="btn-danger" onClick={onDelete}><Trash2 size={15} />Delete</button><button className="btn-ghost" onClick={onEdit}><FilePlus2 size={15} />Edit</button><button className="btn-primary bg-emerald-600" onClick={onSubmit}><Send size={15} />Submit for approval</button></>}
        {inv.status === "pending" && canPrepare && <button className="btn-ghost" onClick={onEdit}><Undo2 size={15} />Edit</button>}
        {inv.status === "pending" && canApprove && <>
          <button className="btn-danger" disabled={reason !== null && !reason.trim()} onClick={() => reason === null ? setReason("") : onSendBack(reason.trim())}><XCircle size={15} />Send back</button>
          {!mine && <button className="btn-primary bg-emerald-600" onClick={onApprove}><CheckCircle2 size={15} />Approve and post</button>}
        </>}
        {remaining && remaining.net > 0 && canPrepare && <button className="btn-ghost" onClick={onCredit}><Undo2 size={15} />Credit note…</button>}
      </>}>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <div><dt className="text-xs text-slate-500">Status</dt><dd><Badge tone={STATUS[inv.status][1]} dot>{STATUS[inv.status][0]}</Badge></dd></div>
        <div><dt className="text-xs text-slate-500">Invoice date</dt><dd>{shortDate(inv.issue_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Due</dt><dd>{shortDate(inv.due_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Supply / emirate</dt><dd>{inv.supply_date ? shortDate(inv.supply_date) : "—"} · {inv.supply_emirate}</dd></div>
        <div><dt className="text-xs text-slate-500">Prepared by</dt><dd>{inv.preparer ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Approved by</dt><dd>{inv.approver ?? "—"}</dd></div>
        {inv.currency !== "AED" && <div><dt className="text-xs text-slate-500">Currency</dt><dd>{inv.currency} at {Number(inv.fx_rate)}</dd></div>}
        {original && <div><dt className="text-xs text-slate-500">Credits invoice</dt><dd className="font-mono text-xs">{original.invoice_no}</dd></div>}
      </dl>
      {mine && inv.status === "pending" && <p className="mb-3 text-xs text-slate-500">You prepared this, so someone else must approve it (maker-checker).</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
        <thead><tr><th className="th">Description</th><th className="th">Account</th><th className="th text-end">Qty</th><th className="th text-end">Unit price{inv.prices_include_vat ? " (incl. VAT)" : ""}</th><th className="th">Tax</th><th className="th text-end">Net (AED)</th><th className="th text-end">VAT (AED)</th></tr></thead>
        <tbody>{inv.lines.map((l) => (
          <tr key={l.id}><td className="td">{l.description}</td><td className="td text-xs text-slate-600">{accName.get(l.account_id)}</td><td className="td text-end num">{Number(l.quantity)}</td>
            <td className="td text-end num">{inv.currency} {fmt(l.unit_price)}</td><td className="td">{l.tax_code}</td><td className="td text-end num">{fmt(l.net)}</td><td className="td text-end num">{fmt(l.vat)}</td></tr>
        ))}
          <tr className="font-semibold"><td className="td" colSpan={5}>Total {inv.currency !== "AED" && <span className="font-normal text-slate-500">({money(inv.gross_total_fcy, inv.currency)})</span>}</td><td className="td text-end num">{fmt(inv.net_total)}</td><td className="td text-end num">{fmt(inv.vat_total)}</td></tr>
          <tr className="font-semibold"><td className="td" colSpan={6}>Amount due (AED)</td><td className="td text-end num">{fmt(inv.gross_total)}</td></tr>
        </tbody>
      </table></div>
      {remaining && <p className="mt-3 text-xs text-slate-500">Still available to credit: net {fmt(remaining.net)}, VAT {fmt(remaining.vat)} (D-30).</p>}
      {reason !== null && <label className="block mt-4"><span className="block text-xs font-medium text-slate-600 mb-1.5">Why is it being sent back? Then click “Send back” again.</span>
        <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
    </Modal>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────────────────
type EditLine = { description: string; quantity: string; price: string; accountId: string; taxCode: string };

function InvoiceEditor({ client, accounts, contacts, emirates, taxPeriods, invoice, creditFor, all, onClose, onSaved }: {
  client: Client; accounts: Account[]; contacts: Contact[]; emirates: Emirate[]; taxPeriods: TaxPeriod[];
  invoice: InvoiceWithLines | null; creditFor: InvoiceWithLines | null; all: InvoiceWithLines[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const today = useToday();
  const base = invoice ?? creditFor;
  const isCredit = (invoice?.doc_type ?? (creditFor ? "credit_note" : "invoice")) === "credit_note";
  const customers = contacts.filter((c) => c.kind !== "supplier" && (c.is_active || c.id === base?.contact_id));
  const income = accounts.filter((a) => a.type === "revenue" && a.is_active && !a.is_control);
  const [contactId, setContactId] = useState(base?.contact_id ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? today);
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [supplyDate, setSupplyDate] = useState(invoice?.supply_date ?? "");
  const [emirate, setEmirate] = useState(base?.supply_emirate ?? client.emirate_code);
  const [currency, setCurrency] = useState<"AED" | "USD">((base?.currency as "AED" | "USD") ?? "AED");
  const [ref, setRef] = useState(invoice?.customer_reference ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [inclVat, setInclVat] = useState(invoice?.prices_include_vat ?? creditFor?.prices_include_vat ?? false);
  const [lines, setLines] = useState<EditLine[]>(() => (invoice ?? (creditFor ? null : null))?.lines.map((l) => ({ description: l.description, quantity: String(Number(l.quantity)), price: fmtPlain(l.unit_price), accountId: l.account_id, taxCode: l.tax_code }))
    ?? (creditFor ? creditFor.lines.map((l) => ({ description: `Credit: ${l.description}`, quantity: String(Number(l.quantity)), price: fmtPlain(l.unit_price), accountId: l.account_id, taxCode: l.tax_code })) : [{ description: "", quantity: "1", price: "", accountId: "", taxCode: "SR" }]));
  const [rules, setRules] = useState<{ vatBp: number; usdAed: string; issueDays: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; rulesOn(issueDate).then((r) => { if (live) setRules(r); }, () => {}); return () => { live = false; }; }, [issueDate]);

  const contact = contacts.find((c) => c.id === contactId);
  const pickContact = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c?.default_account_id || c?.default_tax_code) setLines((ls) => ls.map((l) => (l.accountId || !c ? l : { ...l, accountId: c.default_account_id ?? "", taxCode: c.default_tax_code && SALES_TAX_CODES.some(([k]) => k === c.default_tax_code) ? c.default_tax_code : l.taxCode })));
  };
  const setLine = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const fx = currency === "USD" ? rules?.usdAed ?? "3.6725" : "1";
  const calc = lines.map((l) => {
    const q = parseQuantity(l.quantity), p = parseAedToFils(l.price);
    return q !== null && p !== null && p > 0 ? lineAmounts(q, p, l.taxCode === "SR" ? rules?.vatBp ?? 0 : 0, fx, inclVat) : null;
  });
  const totals = documentTotals(calc.filter((c): c is NonNullable<typeof c> => c !== null));
  const remaining = creditFor ? creditRemaining(creditFor, all) : null;
  const warnings = taxDateWarnings(issueDate, supplyDate || null, taxPeriods.filter((t) => t.kind === "vat"), rules?.issueDays ?? 14);

  const save = async (submit: boolean) => {
    setError(null);
    if (!contactId) { setError("Choose the customer."); return; }
    const bad = lines.findIndex((l, i) => !l.description.trim() || !l.accountId || calc[i] === null);
    if (bad >= 0) { setError(`Line ${bad + 1}: enter a description, quantity, a price above zero (at most 2 decimals) and an income account.`); return; }
    if (remaining && (totals.net > remaining.net || totals.vat > remaining.vat)) { setError(`This credit note is more than what is left on the invoice (net ${fmt(remaining.net)}, VAT ${fmt(remaining.vat)}) — D-30.`); return; }
    const doc: InvoiceDraft = {
      doc_type: isCredit ? "credit_note" : "invoice", contact_id: contactId, issue_date: issueDate, due_date: dueDate || null, supply_date: supplyDate || null,
      supply_emirate: emirate, currency, original_invoice_id: isCredit ? (invoice?.original_invoice_id ?? creditFor?.id ?? null) : null,
      customer_reference: ref, notes, prices_include_vat: inclVat,
      lines: lines.map((l) => ({ description: l.description.trim(), quantity: l.quantity.trim().replace(/,/g, ""), unit_price: parseAedToFils(l.price)!, account_id: l.accountId, tax_code: l.taxCode })),
    };
    setBusy(true);
    try {
      const id = await saveInvoice(client.id, invoice?.id ?? null, doc);
      if (submit) await submitInvoice(id);
      toast(submit ? "Sent for approval — someone else must approve it" : "Draft saved");
      onSaved();
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  return (
    <Modal open wide onClose={onClose} title={isCredit ? `Credit note for ${creditFor?.invoice_no ?? all.find((x) => x.id === invoice?.original_invoice_id)?.invoice_no ?? ""}` : invoice ? "Edit invoice" : "New invoice"}
      footer={<>
        <span className="me-auto text-sm text-slate-700">Net {fmt(totals.net)} · VAT {fmt(totals.vat)} · <b>Total AED {fmt(totals.gross)}</b>{currency !== "AED" && ` (${currency} ${fmt(totals.grossFcy)})`}</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-ghost" disabled={busy} onClick={() => void save(false)}>Save draft</button>
        <button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save(true)}><Send size={15} />Submit for approval</button>
      </>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {warnings.length > 0 && <ul className="mb-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-4 py-2 text-xs list-disc ps-8">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Customer</span>
          <select aria-label="Customer" className={cls} value={contactId} disabled={isCredit} onChange={(e) => pickContact(e.target.value)}>
            <option value="">Choose customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.trn ? ` · TRN ${c.trn}` : ""}</option>)}
          </select>
          {contact && !contact.trn && contact.country_code === "AE" && <span className="text-xs text-amber-700">No TRN on file — fine for an unregistered customer.</span>}</label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Currency</span>
          <select aria-label="Currency" className={cls} value={currency} disabled={isCredit} onChange={(e) => setCurrency(e.target.value as "AED" | "USD")}><option value="AED">AED</option><option value="USD">USD (at {rules?.usdAed ?? "3.6725"})</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{isCredit ? "Credit note date" : "Invoice date (tax date, D-29)"}</span>
          <input type="date" className={cls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Due date (blank = customer terms)</span>
          <input type="date" className={cls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Supply date (optional)</span>
          <input type="date" className={cls} value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Emirate of supply (VAT box, D-10)</span>
          <select aria-label="Emirate of supply" className={cls} value={emirate} onChange={(e) => setEmirate(e.target.value)}>{emirates.map((e) => <option key={e.code} value={e.code}>{e.name}{e.code === client.emirate_code ? " (head office)" : ""}</option>)}</select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Customer reference / PO</span><input className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Notes</span><input className={cls} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="sm:col-span-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={inclVat} disabled={isCredit} onChange={(e) => setInclVat(e.target.checked)} />
          <span><b>Prices include VAT</b> — type what the customer pays; the app works out the VAT inside it (amount × 5/105, per line) and the amount before VAT (D-54).</span></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
        <thead><tr><th className="th w-[28%]">Description</th><th className="th w-20">Qty</th><th className="th w-32">Unit price ({currency}{inclVat ? ", incl. VAT" : ""})</th><th className="th">Income account</th><th className="th w-36">Tax</th><th className="th text-end">Net</th><th className="th text-end">VAT</th><th className="th w-8"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={i}>
            <td className="td"><input aria-label={`Line ${i + 1} description`} className={`${cls} !py-1.5`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className={`${cls} !py-1.5 text-end`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" className={`${cls} !py-1.5 text-end`} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></td>
            <td className="td"><select aria-label={`Line ${i + 1} account`} className={`${cls} !py-1.5`} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
              <option value="">Choose…</option>{income.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
            <td className="td"><select aria-label={`Line ${i + 1} tax code`} className={`${cls} !py-1.5`} value={l.taxCode} onChange={(e) => setLine(i, { taxCode: e.target.value })}>
              {SALES_TAX_CODES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
            <td className="td text-end num">{calc[i] ? fmt(calc[i]!.net) : ""}</td><td className="td text-end num">{calc[i] ? fmt(calc[i]!.vat) : ""}</td>
            <td className="td"><button aria-label={`Remove line ${i + 1}`} className="text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, k) => k !== i) : ls)}><Trash2 size={15} /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="btn-ghost mt-3 !py-1.5" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", price: "", accountId: contact?.default_account_id ?? "", taxCode: "SR" }])}><Plus size={14} />Add line</button>
      {currency !== "AED" && <p className="mt-2 text-xs text-slate-500">Each line is converted to AED at {fx} first; VAT is calculated on the AED amount (D-21). The books are in AED.</p>}
      {remaining && <p className="mt-2 text-xs text-slate-500">Still available to credit on {creditFor?.invoice_no}: net {fmt(remaining.net)}, VAT {fmt(remaining.vat)}.</p>}
    </Modal>
  );
}
