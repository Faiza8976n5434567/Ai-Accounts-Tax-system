/** Receipts, supplier payments and refunds; open items with ageing; Customer Credits and Supplier advances
 *  (P2-04 · D-11, D-34 → D-37). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, FilePlus2, Landmark, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt, fmtPlain, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { listContacts, type Contact } from "../lib/contacts";
import { listEmirates, type Account, type Client, type Emirate } from "../lib/clients";
import {
  advanceVat, daysOverdue, deletePayment, KIND, listCredits, requestPaymentReversal, listOpenDocuments, listPayments, postPayment, savePayment, sendBackPayment, settlement,
  smallDifferenceLimit, submitPayment, suggestAllocations, type CreditBalance, type OpenDocument, type PaymentDraft, type PaymentKind, type PaymentWithDetails,
} from "../lib/payments";
import { supabase } from "../lib/supabase";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const STATUS: Record<string, [string, string]> = { draft: ["Draft", "slate"], pending: ["Waiting for approval", "amber"], posted: ["Posted", "emerald"] };
type View = "payments" | "open" | "credits";

export function PaymentsTab({ client, accounts, perms }: { client: Client; accounts: Account[]; perms: string[] }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetchPayments = useCallback(() => listPayments(client.id), [client.id]);
  const fetchOpen = useCallback(() => listOpenDocuments(client.id), [client.id]);
  const fetchCredits = useCallback(() => listCredits(client.id), [client.id]);
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data, error, reload } = useLoad(fetchPayments);
  const { data: open, reload: reloadOpen } = useLoad(fetchOpen);
  const { data: credits, reload: reloadCredits } = useLoad(fetchCredits);
  const { data: contacts } = useLoad(fetchContacts);
  const { data: emirates } = useLoad(listEmirates);
  const fetchLimit = useCallback(() => smallDifferenceLimit(client.firm_id), [client.firm_id]);
  const { data: limit } = useLoad(fetchLimit);
  const [view, setView] = useState<View>("payments");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ payment: PaymentWithDetails | null; kind: PaymentKind } | null>(null);
  const today = useToday();

  const payments = useMemo(() => data ?? [], [data]);
  const shownPayment = payments.find((p) => p.id === openId) ?? null;
  const canPrepare = perms.includes("prepare"), canApprove = perms.includes("approve_document");
  const refreshAll = () => { reload(); reloadOpen(); reloadCredits(); };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); setOpenId(null); refreshAll(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };
  const names = new Map((contacts ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <Card title="Receipts & payments" icon={<Landmark size={16} />} pad={false}
        sub="Money in from customers and out to suppliers, settled against invoices and bills. Overpayments are held as Customer Credits or Supplier advances and used automatically on the next invoice or bill."
        actions={canPrepare && <div className="flex flex-wrap gap-2">
          <button className="btn-primary bg-emerald-600" onClick={() => setEditing({ payment: null, kind: "customer_receipt" })}><ArrowDownLeft size={15} />Receipt</button>
          <button className="btn-ghost" onClick={() => setEditing({ payment: null, kind: "supplier_payment" })}><ArrowUpRight size={15} />Supplier payment</button>
          <button className="btn-ghost" onClick={() => setEditing({ payment: null, kind: "customer_refund" })}><Undo2 size={15} />Refund</button>
        </div>}>
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {([["payments", "Receipts & payments"], ["open", "Open invoices & bills"], ["credits", "Credits & advances"]] as [View, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${view === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{l}</button>
          ))}
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load payments.</p>}

        {view === "payments" && <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Number</th><th className="th">Date</th><th className="th">Type</th><th className="th">Customer / supplier</th><th className="th">Status</th><th className="th text-end">Amount</th><th className="th text-end">Credit left</th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {data && payments.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No receipts or payments yet.</td></tr>}
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpenId(p.id)}>
                <td className="td font-mono text-xs">{p.payment_no ?? <span className="text-slate-400">—</span>}</td>
                <td className="td">{shortDate(p.payment_date)}</td>
                <td className="td"><Badge tone={KIND[p.kind].moneyIn ? "emerald" : "indigo"}>{KIND[p.kind].label}</Badge></td>
                <td className="td">{p.contact}</td>
                <td className="td">{p.reversed ? <Badge tone="rose" dot>Reversed</Badge> : <Badge tone={STATUS[p.status][1]} dot>{STATUS[p.status][0]}</Badge>}</td>
                <td className="td text-end num font-medium">{p.currency} {fmt(p.amount_fcy)}</td>
                <td className="td text-end num">{fmtCredit(credits ?? [], p.id)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}

        {view === "open" && <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Type</th><th className="th">Document</th><th className="th">Customer / supplier</th><th className="th">Due</th><th className="th">Overdue</th><th className="th text-end">Total</th><th className="th text-end">Open</th></tr></thead>
          <tbody>
            {!open && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {open && open.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Nothing open — everything is settled.</td></tr>}
            {(open ?? []).map((d) => {
              const late = daysOverdue(d.due_date!, today);
              return (
                <tr key={d.id}>
                  <td className="td">{d.doc_kind === "sales_invoice" ? "Owed to us" : "We owe"}</td>
                  <td className="td font-mono text-xs">{d.doc_no}</td>
                  <td className="td">{names.get(d.contact_id!) ?? ""}</td>
                  <td className="td">{shortDate(d.due_date!)}</td>
                  <td className="td">{late > 0 ? <Badge tone={late > 90 ? "rose" : late > 30 ? "amber" : "slate"}>{late} days</Badge> : <span className="text-xs text-slate-500">not due</span>}</td>
                  <td className="td text-end num">{d.currency} {fmt(d.total_fcy!)}</td>
                  <td className="td text-end num font-medium">{d.currency} {fmt(d.open_fcy!)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>}

        {view === "credits" && <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead><tr><th className="th">From</th><th className="th">Date</th><th className="th">Customer / supplier</th><th className="th">Kind</th><th className="th text-end">Available</th></tr></thead>
          <tbody>
            {credits && credits.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No unused credits or advances.</td></tr>}
            {(credits ?? []).map((c) => (
              <tr key={c.payment_id}>
                <td className="td font-mono text-xs">{c.payment_no}</td><td className="td">{shortDate(c.payment_date!)}</td><td className="td">{names.get(c.contact_id!) ?? ""}</td>
                <td className="td">{c.kind === "customer_receipt" ? "Customer credit (2150)" : "Supplier advance (1160)"}</td>
                <td className="td text-end num font-medium">{c.currency} {fmt(c.left_fcy!)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      </Card>

      {shownPayment && <PaymentView p={shownPayment} names={names} open={open ?? []} me={auth.userId} canPrepare={canPrepare} canApprove={canApprove} onClose={() => setOpenId(null)}
        onEdit={() => { setEditing({ payment: shownPayment, kind: shownPayment.kind }); setOpenId(null); }}
        onSubmit={() => act(() => submitPayment(shownPayment.id), "Sent for approval")}
        onDelete={() => act(() => deletePayment(shownPayment.id), "Draft deleted")}
        onApprove={() => act(async () => toast(`Posted as ${await postPayment(shownPayment.id)}`), "Journal posted")}
        onSendBack={(reason) => act(() => sendBackPayment(shownPayment.id, reason), "Sent back to the preparer")}
        canReverse={perms.includes("reverse_journal")}
        onReverse={(reason) => act(() => requestPaymentReversal(shownPayment.journal_id!, reason, today), "Reversal requested — a second Firm Admin approves it under Approvals")} />}

      {editing && contacts && open && credits && emirates && <PaymentEditor orgId={client.id} kind={editing.kind} payment={editing.payment} accounts={accounts} contacts={contacts}
        emirates={emirates} headOffice={client.emirate_code} open={open} credits={credits} limit={limit ?? 100} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); refreshAll(); setOpenId(id); }} />}
    </>
  );
}

function fmtCredit(credits: CreditBalance[], id: string) {
  const c = credits.find((x) => x.payment_id === id);
  return c ? `${c.currency} ${fmt(c.left_fcy!)}` : "";
}

// ── View ────────────────────────────────────────────────────────────────────────────────
function PaymentView({ p, names, open, me, canPrepare, canApprove, canReverse, onClose, onEdit, onSubmit, onDelete, onApprove, onSendBack, onReverse }: {
  p: PaymentWithDetails; names: Map<string, string>; open: OpenDocument[]; me: string; canPrepare: boolean; canApprove: boolean; canReverse: boolean;
  onClose: () => void; onEdit: () => void; onSubmit: () => void; onDelete: () => void; onApprove: () => void; onSendBack: (reason: string) => void;
  onReverse: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [revReason, setRevReason] = useState<string | null>(null);
  const [docNos, setDocNos] = useState<Map<string, string>>(new Map());
  const mine = p.prepared_by === me;
  const k = KIND[p.kind];
  useEffect(() => {
    let live = true;
    const inv = p.allocations.map((a) => a.sales_invoice_id).filter((x): x is string => !!x);
    const bills = p.allocations.map((a) => a.purchase_bill_id).filter((x): x is string => !!x);
    void Promise.all([
      inv.length ? supabase!.from("sales_invoices").select("id, invoice_no").in("id", inv) : Promise.resolve({ data: [] as { id: string; invoice_no: string | null }[] }),
      bills.length ? supabase!.from("purchase_bills").select("id, supplier_invoice_no").in("id", bills) : Promise.resolve({ data: [] as { id: string; supplier_invoice_no: string }[] }),
    ]).then(([a, b]) => {
      if (!live) return;
      const m = new Map<string, string>();
      for (const r of a.data ?? []) m.set(r.id, r.invoice_no ?? "");
      for (const r of b.data ?? []) m.set(r.id, r.supplier_invoice_no);
      setDocNos(m);
    });
    return () => { live = false; };
  }, [p.allocations]);
  const docLabel = (id: string) => docNos.get(id) ?? open.find((d) => d.id === id)?.doc_no ?? "…";

  return (
    <Modal open wide onClose={onClose} title={`${k.label} ${p.payment_no ?? "(draft)"} · ${p.contact}`}
      footer={<>
        <button className="btn-ghost me-auto" onClick={onClose}>Close</button>
        {p.status === "draft" && canPrepare && <><button className="btn-danger" onClick={onDelete}><Trash2 size={15} />Delete</button><button className="btn-ghost" onClick={onEdit}><FilePlus2 size={15} />Edit</button><button className="btn-primary bg-emerald-600" onClick={onSubmit}><Send size={15} />Submit for approval</button></>}
        {p.status === "pending" && canPrepare && <button className="btn-ghost" onClick={onEdit}><Undo2 size={15} />Edit</button>}
        {p.status === "pending" && canApprove && <>
          <button className="btn-danger" disabled={reason !== null && !reason.trim()} onClick={() => reason === null ? setReason("") : onSendBack(reason.trim())}><XCircle size={15} />Send back</button>
          {!mine && <button className="btn-primary bg-emerald-600" onClick={onApprove}><CheckCircle2 size={15} />Approve and post</button>}
        </>}
        {p.status === "posted" && !p.reversed && canReverse && <button className="btn-danger" disabled={revReason !== null && !revReason.trim()}
          onClick={() => revReason === null ? setRevReason("") : onReverse(revReason.trim())}><Undo2 size={15} />Reverse…</button>}
      </>}>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <div><dt className="text-xs text-slate-500">Status</dt><dd>{p.reversed ? <Badge tone="rose" dot>Reversed</Badge> : <Badge tone={STATUS[p.status][1]} dot>{STATUS[p.status][0]}</Badge>}</dd></div>
        <div><dt className="text-xs text-slate-500">Date</dt><dd>{shortDate(p.payment_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Amount</dt><dd className="num">{p.currency} {fmt(p.amount_fcy)}</dd></div>
        <div><dt className="text-xs text-slate-500">Bank charges</dt><dd className="num">{p.currency} {fmt(p.bank_charges_fcy)}</dd></div>
        <div><dt className="text-xs text-slate-500">Prepared by</dt><dd>{p.preparer ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Approved by</dt><dd>{p.approver ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Reference</dt><dd>{p.reference ?? "—"}</dd></div>
        {p.currency !== "AED" && <div><dt className="text-xs text-slate-500">Rate</dt><dd>{Number(p.fx_rate)}</dd></div>}
      </dl>
      {mine && p.status === "pending" && <p className="mb-3 text-xs text-slate-500">You prepared this, so someone else must approve it (maker-checker).</p>}
      {p.vat_advance && <p className="mb-3 rounded-xl bg-sky-50 ring-1 ring-sky-200 text-sky-900 px-4 py-2 text-sm">
        <b>Advance for a specific supply</b> (D-58) · emirate {p.advance_emirate} · {p.status === "posted" ? <>VAT declared on receipt: <b>AED {fmt(p.advance_vat)}</b></> : "VAT is declared when approved"}.
        It is taken back automatically when the advance is used on the customer's invoice, or refunded.</p>}
      {k.refund ? <p className="text-sm text-slate-600">Paid out of the {k.customer ? "customer's credits" : "supplier's advances"}, oldest first.</p>
        : p.auto_allocate && p.status !== "posted" ? <p className="text-sm text-slate-600">Automatic: settles {names.get(p.contact_id) ?? "the contact"}'s oldest open {k.customer ? "invoices" : "bills"} first when approved; anything left becomes a {k.customer ? "Customer Credit" : "Supplier advance"}.</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[480px]">
            <thead><tr><th className="th">Settles</th><th className="th text-end">Amount ({p.currency})</th><th className="th text-end">AED</th></tr></thead>
            <tbody>{p.allocations.filter((a) => !a.refund_id && !a.credit_amount).map((a) => (
              <tr key={a.id}><td className="td font-mono text-xs">{docLabel((a.sales_invoice_id ?? a.purchase_bill_id)!)}</td><td className="td text-end num">{fmt(a.amount_fcy)}</td><td className="td text-end num">{p.status === "posted" ? fmt(a.amount) : ""}</td></tr>
            ))}</tbody>
          </table></div>}
      {p.status === "posted" && (p.writeoff !== 0 || p.credit_aed > 0 || p.fx_difference !== 0) && (
        <ul className="mt-3 text-xs text-slate-600 space-y-0.5">
          {p.writeoff !== 0 && <li>Small difference written off (D-34): AED {fmt(Math.abs(p.writeoff))}</li>}
          {p.credit_aed > 0 && <li>Left as {k.customer ? "Customer Credit" : "Supplier advance"}: AED {fmt(p.credit_aed)}</li>}
          {p.fx_difference !== 0 && <li>Exchange {p.fx_difference > 0 ? "gain" : "loss"} (D-37): AED {fmt(Math.abs(p.fx_difference))}</li>}
        </ul>)}
      {reason !== null && <label className="block mt-4"><span className="block text-xs font-medium text-slate-600 mb-1.5">Why is it being sent back? Then click “Send back” again.</span>
        <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
      {revReason !== null && <label className="block mt-4"><span className="block text-xs font-medium text-slate-600 mb-1.5">Why should it be reversed (D-40)? Then click “Reverse…” again. A second Firm Admin approves it; the {KIND[p.kind].customer ? "invoices" : "bills"} it settled reopen.</span>
        <textarea aria-label="Reversal reason" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={revReason} onChange={(e) => setRevReason(e.target.value)} /></label>}
    </Modal>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────────────────
function PaymentEditor({ orgId, kind: initialKind, payment, accounts, contacts, emirates, headOffice, open, credits, limit, onClose, onSaved }: {
  orgId: string; kind: PaymentKind; payment: PaymentWithDetails | null; accounts: Account[]; contacts: Contact[]; emirates: Emirate[]; headOffice: string;
  open: OpenDocument[]; credits: CreditBalance[]; limit: number;
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const today = useToday();
  const banks = accounts.filter((a) => (a.subtype === "bank" || a.subtype === "cash") && a.is_active);
  const [kind, setKind] = useState<PaymentKind>(payment?.kind ?? initialKind);
  const k = KIND[kind];
  const [contactId, setContactId] = useState(payment?.contact_id ?? "");
  const [bankId, setBankId] = useState(payment?.bank_account_id ?? banks[0]?.id ?? "");
  const [date, setDate] = useState(payment?.payment_date ?? today);
  const [currency, setCurrency] = useState<"AED" | "USD">((payment?.currency as "AED" | "USD") ?? "AED");
  const [amount, setAmount] = useState(payment ? fmtPlain(payment.amount_fcy) : "");
  const [charges, setCharges] = useState(payment && payment.bank_charges_fcy ? fmtPlain(payment.bank_charges_fcy) : "");
  const [reference, setReference] = useState(payment?.reference ?? "");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [auto, setAuto] = useState(payment ? payment.auto_allocate : true);
  const [manual, setManual] = useState<Record<string, string>>(() => Object.fromEntries((payment?.allocations ?? []).map((a) => [(a.sales_invoice_id ?? a.purchase_bill_id)!, fmtPlain(a.amount_fcy)])));
  const [usdRate, setUsdRate] = useState("3.6725");
  const [advance, setAdvance] = useState(payment?.vat_advance ?? false);                       // D-58
  const [advEmirate, setAdvEmirate] = useState(payment?.advance_emirate ?? headOffice);
  const [vatBp, setVatBp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (currency === "AED") return;
    let live = true;
    void supabase!.rpc("config_value", { p_key: "fx.usd_aed", p_on: date }).then((r) => { if (live) setUsdRate(String(r.data ?? "3.6725")); });
    return () => { live = false; };
  }, [currency, date]);
  const rate = currency === "USD" ? usdRate : "1";
  useEffect(() => {
    let live = true;
    void supabase!.rpc("config_value", { p_key: "vat.rate_bp", p_on: date }).then((r) => { if (live) setVatBp(Number(r.data ?? 0)); });
    return () => { live = false; };
  }, [date]);
  const isAdvance = advance && kind === "customer_receipt";

  const people = contacts.filter((c) => (k.customer ? c.kind !== "supplier" : c.kind !== "customer") && (c.is_active || c.id === contactId));
  const docs = open.filter((d) => d.contact_id === contactId && d.currency === currency && d.doc_kind === (k.customer ? "sales_invoice" : "purchase_bill") && (d.open_fcy ?? 0) > 0);
  const available = credits.filter((c) => c.contact_id === contactId && c.currency === currency && c.kind === (k.customer ? "customer_receipt" : "supplier_payment"))
    .reduce((s, c) => s + (c.left_fcy ?? 0), 0);
  const amountFils = parseAedToFils(amount || "0");
  const chargesFils = parseAedToFils(charges || "0");
  const plan = auto ? suggestAllocations(docs.map((d) => ({ id: d.id!, doc_date: d.doc_date!, doc_no: d.doc_no!, open_fcy: d.open_fcy! })), amountFils ?? 0, limit, rate)
    : docs.flatMap((d) => { const v = parseAedToFils(manual[d.id!] || "0"); return v && v > 0 ? [{ id: d.id!, amount: v }] : []; });
  const allocated = plan.reduce((s, a) => s + a.amount, 0);
  const result = k.refund ? null : settlement(amountFils ?? 0, allocated, limit, rate);

  const save = async (submit: boolean) => {
    setError(null);
    if (!contactId) { setError(`Choose the ${k.customer ? "customer" : "supplier"}.`); return; }
    if (!bankId) { setError("Choose the bank account."); return; }
    if (amountFils === null || amountFils <= 0) { setError("Enter an amount above zero (at most 2 decimals)."); return; }
    if (chargesFils === null || chargesFils < 0 || chargesFils >= amountFils) { setError("Bank charges must be zero or less than the amount."); return; }
    if (k.refund && amountFils > available) { setError(`The refund is more than the ${k.customer ? "customer credit" : "supplier advance"} available (${currency} ${fmt(available)}).`); return; }
    const over = !auto && docs.find((d) => (parseAedToFils(manual[d.id!] || "0") ?? 0) > (d.open_fcy ?? 0));
    if (over) { setError(`The amount for ${over.doc_no} is more than its open balance (${fmt(over.open_fcy!)}).`); return; }
    if (!isAdvance && result?.error) { setError(result.error); return; }
    const doc: PaymentDraft = {
      kind, contact_id: contactId, bank_account_id: bankId, payment_date: date, currency, amount: amountFils, bank_charges: chargesFils,
      reference, notes, allocations: k.refund || auto || isAdvance ? null : plan.map((a) => ({ document_id: a.id, amount: a.amount })),
      vat_advance: isAdvance, advance_emirate: isAdvance ? advEmirate : null,
    };
    setBusy(true);
    try {
      const id = await savePayment(orgId, payment?.id ?? null, doc);
      if (submit) await submitPayment(id);
      onSaved(id);
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  const title = payment ? `Edit ${k.label.toLowerCase()}` : `New ${k.label.toLowerCase()}`;
  return (
    <Modal open wide onClose={onClose} title={title}
      footer={<>
        <span className="me-auto text-sm text-slate-700">{!k.refund && result && !result.error && <>
          Settles {currency} {fmt(allocated)}{result.writeoff !== 0 && ` · written off ${fmt(Math.abs(result.writeoff))}`}{result.credit > 0 && ` · ${k.customer ? "customer credit" : "supplier advance"} ${fmt(result.credit)}`}</>}</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-ghost" disabled={busy} onClick={() => void save(false)}>Save draft</button>
        <button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save(true)}><Send size={15} />Submit for approval</button>
      </>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Type</span>
          <select aria-label="Type" className={cls} value={kind} disabled={!!payment} onChange={(e) => { setKind(e.target.value as PaymentKind); setContactId(""); setManual({}); }}>
            {(Object.keys(KIND) as PaymentKind[]).map((x) => <option key={x} value={x}>{KIND[x].label}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">{k.customer ? "Customer" : "Supplier"}</span>
          <select aria-label="Contact" className={cls} value={contactId} onChange={(e) => { setContactId(e.target.value); setManual({}); }}>
            <option value="">Choose…</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Date</span><input aria-label="Date" type="date" className={cls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Bank account</span>
          <select aria-label="Bank account" className={cls} value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Currency</span>
          <select aria-label="Currency" className={cls} value={currency} onChange={(e) => { setCurrency(e.target.value as "AED" | "USD"); setManual({}); }}><option value="AED">AED</option><option value="USD">USD (at {currency === "USD" ? rate : "3.6725"})</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{k.customer && !k.refund ? "Amount the customer paid" : k.refund ? "Refund amount" : k.moneyIn ? "Amount received" : "Amount paid to the supplier"}</span>
          <input aria-label="Amount" inputMode="decimal" className={`${cls} text-end`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{k.moneyIn ? "Bank charges deducted (D-34)" : "Bank charges on top (D-34)"}</span>
          <input aria-label="Bank charges" inputMode="decimal" className={`${cls} text-end`} value={charges} onChange={(e) => setCharges(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Reference (bank / cheque no.)</span><input aria-label="Reference" className={cls} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label className="sm:col-span-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Notes</span><input aria-label="Notes" className={cls} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      {k.moneyIn && amountFils !== null && chargesFils ? <p className="mb-3 text-xs text-slate-500">The bank account receives {currency} {fmt(Math.max(0, amountFils - chargesFils))}; the {fmt(chargesFils)} charge goes to 6400 Bank charges.</p> : null}

      {kind === "customer_receipt" && <div className="mb-4 rounded-xl ring-1 ring-slate-200 px-4 py-3 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={advance} onChange={(e) => setAdvance(e.target.checked)} />
          <span><b>Advance for a specific supply</b> — VAT is due now, on receipt (Federal Decree-Law No. 8 of 2017, Art 25–26; D-58). Leave unticked for an ordinary overpayment or deposit, which stays a Customer Credit with no VAT.</span></label>
        {isAdvance && <div className="mt-3 grid gap-3 sm:grid-cols-3 items-end">
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Emirate of the supply (VAT box)</span>
            <select aria-label="Emirate of the supply" className={cls} value={advEmirate} onChange={(e) => setAdvEmirate(e.target.value)}>
              {emirates.map((e) => <option key={e.code} value={e.code}>{e.name}{e.code === headOffice ? " (head office)" : ""}</option>)}</select></label>
          <p className="sm:col-span-2 text-slate-700">{currency === "AED" && amountFils
            ? <>VAT due now: <b>AED {fmt(advanceVat(amountFils, vatBp))}</b> (amount × {vatBp / 100}/{100 + vatBp / 100}). It is taken back automatically when the advance is used on the invoice, so the VAT is counted once.</>
            : <>VAT is worked out on the AED amount when the receipt is approved; it is taken back automatically when the advance is used on the invoice.</>}</p>
        </div>}
      </div>}

      {contactId && !isAdvance && (k.refund ? (
        <p className="text-sm text-slate-700">{k.customer ? "Customer credit" : "Supplier advance"} available: <b>{currency} {fmt(available)}</b>. The refund uses the oldest credits first.</p>
      ) : (<>
        <div className="flex items-center gap-4 mb-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={auto} onChange={() => setAuto(true)} />Automatic — oldest {k.customer ? "invoices" : "bills"} first</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={!auto} onChange={() => setAuto(false)} />I'll choose</label>
        </div>
        {docs.length === 0 ? <p className="text-sm text-slate-500">No open {k.customer ? "invoices" : "bills"} in {currency} — the whole amount becomes a {k.customer ? "Customer Credit (D-11)" : "Supplier advance (D-36)"}.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr><th className="th">{k.customer ? "Invoice" : "Bill"}</th><th className="th">Date</th><th className="th">Due</th><th className="th text-end">Open ({currency})</th><th className="th text-end w-40">Settle now</th></tr></thead>
            <tbody>{docs.map((d) => (
              <tr key={d.id}>
                <td className="td font-mono text-xs">{d.doc_no}</td><td className="td">{shortDate(d.doc_date!)}</td><td className="td">{shortDate(d.due_date!)}</td>
                <td className="td text-end num">{fmt(d.open_fcy!)}</td>
                <td className="td">{auto ? <div className="text-end num">{fmt(plan.find((a) => a.id === d.id)?.amount ?? 0)}</div>
                  : <input aria-label={`Settle ${d.doc_no}`} inputMode="decimal" className={`${cls} !py-1.5 text-end`} value={manual[d.id!] ?? ""} placeholder="0.00"
                      onChange={(e) => setManual((m) => ({ ...m, [d.id!]: e.target.value }))} onDoubleClick={() => setManual((m) => ({ ...m, [d.id!]: fmtPlain(d.open_fcy!) }))} />}</td>
              </tr>
            ))}</tbody>
          </table></div>)}
        {available > 0 && <p className="mt-2 text-xs text-slate-500">This {k.customer ? "customer already has a credit" : "supplier already has an advance"} of {currency} {fmt(available)} — it is used automatically on the next {k.customer ? "invoice" : "bill"}.</p>}
        {result?.error && <p className="mt-2 text-xs text-rose-700">{result.error}</p>}
        <p className="mt-2 text-xs text-slate-500">Differences up to AED {fmt(limit)} are written off to 6190 so the document closes (D-34). Larger overpayments are kept as a {k.customer ? "Customer Credit" : "Supplier advance"}.</p>
      </>))}
    </Modal>
  );
}
