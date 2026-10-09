/** Purchase bills and debit notes for one client (P2-03 · D-31, D-32, D-33 · F-17 checks and risk). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, FilePlus2, Paperclip, Plus, Send, ShoppingCart, Trash2, Undo2, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { ImportEinvoice } from "./ImportEinvoice";
import { fmt, fmtPlain, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { listContacts, type Contact } from "../lib/contacts";
import type { Account, Client } from "../lib/clients";
import { documentTotals, lineAmounts, parseQuantity } from "../lib/invoices";
import {
  attachmentUrl, attachToBill, BILL_TAX_CODES, billTotals, supplierInvoiceTotal, debitRemaining, deleteBill, listBills, postBill, saveBill, sendBackBill, submitBill,
  uploadProblem, VAT_BEARING, type BillDraft, type BillWithDetails,
} from "../lib/bills";
import { supabase } from "../lib/supabase";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const STATUS: Record<string, [string, string]> = { draft: ["Draft", "slate"], pending: ["Waiting for approval", "amber"], posted: ["Posted", "emerald"] };
const RISK: Record<string, [string, string]> = { low: ["Low", "emerald"], medium: ["Medium", "amber"], high: ["High", "rose"] };
type Filter = "all" | "draft" | "pending" | "posted" | "debit_note" | "high";

async function rulesOn(date: string) {
  const get = async (key: string) => (await supabase!.rpc("config_value", { p_key: key, p_on: date })).data;
  const [vat, fx, full] = await Promise.all([get("vat.rate_bp"), get("fx.usd_aed"), get("vat.full_invoice_threshold")]);
  return { vatBp: Number(vat ?? 0), usdAed: String(fx ?? "1"), fullInvoice: Number(full ?? 1000000) };
}

export function BillsTab({ client, accounts, perms }: { client: Client; accounts: Account[]; perms: string[] }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetchBills = useCallback(() => listBills(client.id), [client.id]);
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data, error, reload } = useLoad(fetchBills);
  const { data: contacts, reload: reloadContacts } = useLoad(fetchContacts);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ bill: BillWithDetails | null; debitFor: BillWithDetails | null } | null>(null);

  const bills = useMemo(() => data ?? [], [data]);
  const open = bills.find((b) => b.id === openId) ?? null;
  const shown = bills.filter((b) => filter === "all" || (filter === "debit_note" ? b.doc_type === "debit_note" : filter === "high" ? b.risk_level === "high" && b.status !== "posted" : b.status === filter));
  const canPrepare = perms.includes("prepare"), canApprove = perms.includes("approve_document"), canUpload = perms.includes("upload");

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); setOpenId(null); reload(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };

  return (
    <>
      <Card title="Purchase bills & debit notes" icon={<ShoppingCart size={16} />} pad={false}
        sub="Enter the supplier's invoice; the compliance checks run on saving. Someone else approves and posts. Input VAT is only recovered when the checks pass (or the approver overrides with a reason)."
        actions={canPrepare && <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => setImporting(true)}><FileCode2 size={15} />Import e-invoice</button><button className="btn-primary bg-emerald-600" onClick={() => setEditing({ bill: null, debitFor: null })}><Plus size={15} />New bill</button></div>}>
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {(["all", "draft", "pending", "posted", "debit_note", "high"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
              {f === "all" ? "All" : f === "debit_note" ? "Debit notes" : f === "high" ? "High risk" : STATUS[f][0]}
              {f === "pending" && bills.some((b) => b.status === "pending") ? ` (${bills.filter((b) => b.status === "pending").length})` : ""}
            </button>
          ))}
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load bills.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[900px]">
          <thead><tr><th className="th">Supplier invoice</th><th className="th">Date</th><th className="th">Supplier</th><th className="th">Status</th><th className="th">Checks</th>
            <th className="th text-end">Net</th><th className="th text-end">VAT recovered</th><th className="th text-end">Payable (AED)</th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={8}>Loading…</td></tr>}
            {data && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>No bills here yet.</td></tr>}
            {shown.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpenId(b.id)}>
                <td className="td font-mono text-xs">{b.supplier_invoice_no}{b.doc_type === "debit_note" && <Badge tone="rose" className="ms-1.5">Debit note</Badge>}{b.attachments.length > 0 && <Paperclip size={12} className="inline ms-1.5 text-slate-400" aria-label="Has attachment" />}</td>
                <td className="td">{shortDate(b.bill_date)}</td>
                <td className="td">{b.supplier}{b.currency !== "AED" && <Badge className="ms-1.5">{b.currency}</Badge>}</td>
                <td className="td"><Badge tone={STATUS[b.status][1]} dot>{STATUS[b.status][0]}</Badge></td>
                <td className="td"><Badge tone={RISK[b.risk_level][1]}>{RISK[b.risk_level][0]} risk</Badge></td>
                <td className="td text-end num">{fmt(b.net_total)}</td><td className="td text-end num">{fmt(b.recoverable_vat)}</td><td className="td text-end num font-medium">{fmt(b.payable_total)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {open && <BillView bill={open} all={bills} accounts={accounts} me={auth.userId} orgId={client.id} canPrepare={canPrepare} canApprove={canApprove} canUpload={canUpload}
        onClose={() => setOpenId(null)} onChanged={reload}
        onEdit={() => { setEditing({ bill: open, debitFor: null }); setOpenId(null); }}
        onDebit={() => { setEditing({ bill: null, debitFor: open }); setOpenId(null); }}
        onSubmit={() => act(() => submitBill(open.id), "Sent for approval")}
        onDelete={() => act(() => deleteBill(open.id), "Draft deleted")}
        onApprove={(override) => act(async () => toast(`Posted as ${await postBill(open.id, override)}`), "Journal posted")}
        onSendBack={(reason) => act(() => sendBackBill(open.id, reason), "Sent back to the preparer")} />}

      {importing && contacts && <ImportEinvoice client={client} accounts={accounts} contacts={contacts} bills={bills} onClose={() => setImporting(false)}
        onImported={(id) => { setImporting(false); reload(); reloadContacts(); setOpenId(id); }} />}
      {editing && contacts && <BillEditor orgId={client.id} accounts={accounts} contacts={contacts} bill={editing.bill} debitFor={editing.debitFor} all={bills}
        onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); reload(); setOpenId(id); }} />}
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────────────────
function BillView({ bill, all, accounts, me, orgId, canPrepare, canApprove, canUpload, onClose, onChanged, onEdit, onDebit, onSubmit, onDelete, onApprove, onSendBack }: {
  bill: BillWithDetails; all: BillWithDetails[]; accounts: Account[]; me: string; orgId: string; canPrepare: boolean; canApprove: boolean; canUpload: boolean;
  onClose: () => void; onChanged: () => void; onEdit: () => void; onDebit: () => void; onSubmit: () => void; onDelete: () => void;
  onApprove: (override?: string) => void; onSendBack: (reason: string) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const accName = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]));
  const mine = bill.prepared_by === me;
  const remaining = bill.doc_type === "bill" && bill.status === "posted" ? debitRemaining(bill, all) : null;
  const original = bill.original_bill_id ? all.find((x) => x.id === bill.original_bill_id) : undefined;
  const failed = bill.checks.filter((c) => !c.passed);
  const vatAtStake = bill.doc_type === "bill" && !bill.vat_recoverable_by_checks && bill.lines.some((l) => l.tax_code === "SR" && l.vat > 0);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = uploadProblem(file);
    if (problem) { toast(problem, "err"); return; }
    setUploading(true);
    try { await attachToBill(orgId, bill.id, file); toast("Document attached"); onChanged(); }
    catch (e) { toast(friendlyDbError(e), "err"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const view = async (path: string) => {
    try { window.open(await attachmentUrl(path), "_blank", "noopener"); } catch (e) { toast(friendlyDbError(e), "err"); }
  };

  return (
    <Modal open wide onClose={onClose} title={`${bill.doc_type === "bill" ? "Bill" : "Debit note"} ${bill.supplier_invoice_no} · ${bill.supplier}`}
      footer={<>
        <button className="btn-ghost me-auto" onClick={onClose}>Close</button>
        {bill.status === "draft" && canPrepare && <><button className="btn-danger" onClick={onDelete}><Trash2 size={15} />Delete</button><button className="btn-ghost" onClick={onEdit}><FilePlus2 size={15} />Edit</button><button className="btn-primary bg-emerald-600" onClick={onSubmit}><Send size={15} />Submit for approval</button></>}
        {bill.status === "pending" && canPrepare && <button className="btn-ghost" onClick={onEdit}><Undo2 size={15} />Edit</button>}
        {bill.status === "pending" && canApprove && <>
          <button className="btn-danger" disabled={reason !== null && !reason.trim()} onClick={() => reason === null ? setReason("") : onSendBack(reason.trim())}><XCircle size={15} />Send back</button>
          {!mine && <button className="btn-primary bg-emerald-600" disabled={override !== null && !override.trim()} onClick={() => onApprove(override?.trim() || undefined)}><CheckCircle2 size={15} />Approve and post</button>}
        </>}
        {remaining && remaining.net > 0 && canPrepare && <button className="btn-ghost" onClick={onDebit}><Undo2 size={15} />Debit note…</button>}
      </>}>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <div><dt className="text-xs text-slate-500">Status</dt><dd><Badge tone={STATUS[bill.status][1]} dot>{STATUS[bill.status][0]}</Badge></dd></div>
        <div><dt className="text-xs text-slate-500">Invoice date (tax date)</dt><dd>{shortDate(bill.bill_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Due</dt><dd>{shortDate(bill.due_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Risk</dt><dd><Badge tone={RISK[bill.risk_level][1]}>{RISK[bill.risk_level][0]} · {bill.risk_score}</Badge></dd></div>
        <div><dt className="text-xs text-slate-500">Prepared by</dt><dd>{bill.preparer ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Approved by</dt><dd>{bill.approver ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Supplier TRN on invoice</dt><dd className="font-mono text-xs">{bill.supplier_trn_on_invoice ?? "—"}</dd></div>
        {bill.currency !== "AED" && <div><dt className="text-xs text-slate-500">Currency</dt><dd>{bill.currency} at {Number(bill.fx_rate)}</dd></div>}
        {original && <div><dt className="text-xs text-slate-500">Debit note on bill</dt><dd className="font-mono text-xs">{original.supplier_invoice_no}</dd></div>}
      </dl>
      {mine && bill.status === "pending" && <p className="mb-3 text-xs text-slate-500">You prepared this, so someone else must approve it (maker-checker).</p>}

      <section aria-label="Compliance checks" className="mb-4 rounded-xl ring-1 ring-slate-200 p-3">
        <div className="text-xs font-semibold text-slate-700 mb-2">Compliance checks {failed.length === 0 ? "— all passed" : `— ${failed.length} to review`}</div>
        <ul className="grid gap-1 sm:grid-cols-2 text-xs">
          {bill.checks.map((c) => (
            <li key={c.id} className="flex gap-1.5">
              {c.passed ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-px" /> : c.severity === "error" ? <XCircle size={14} className="text-rose-600 shrink-0 mt-px" /> : <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-px" />}
              <span><span className={c.passed ? "text-slate-600" : "text-slate-900 font-medium"}>{c.label}</span>{c.detail && <span className="block text-slate-500">{c.detail}</span>}</span>
            </li>
          ))}
        </ul>
        {vatAtStake && <p className="mt-2 text-xs text-rose-700">Input VAT of AED {fmt(bill.lines.filter((l) => l.tax_code === "SR").reduce((s, l) => s + l.vat, 0))} will not be recovered — it is added to the cost (D-32).</p>}
        {bill.vat_override_reason && <p className="mt-2 text-xs text-slate-600">Recovered anyway by the approver: “{bill.vat_override_reason}”</p>}
      </section>

      <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
        <thead><tr><th className="th">Description</th><th className="th">Account</th><th className="th text-end">Qty</th><th className="th text-end">Unit price</th><th className="th">Tax</th><th className="th text-end">Net (AED)</th><th className="th text-end">VAT (AED)</th></tr></thead>
        <tbody>{bill.lines.map((l) => (
          <tr key={l.id}><td className="td">{l.description}</td><td className="td text-xs text-slate-600">{accName.get(l.account_id)}</td><td className="td text-end num">{Number(l.quantity)}</td>
            <td className="td text-end num">{bill.currency} {fmt(l.unit_price)}</td><td className="td">{l.tax_code}</td><td className="td text-end num">{fmt(l.net)}</td><td className="td text-end num">{fmt(l.vat)}</td></tr>
        ))}
          <tr className="font-semibold"><td className="td" colSpan={5}>Total</td><td className="td text-end num">{fmt(bill.net_total)}</td><td className="td text-end num">{fmt(bill.vat_total)}</td></tr>
          <tr><td className="td" colSpan={6}>Input VAT recovered</td><td className="td text-end num">{fmt(bill.recoverable_vat)}</td></tr>
          <tr className="font-semibold"><td className="td" colSpan={6}>Payable to supplier (AED){bill.currency !== "AED" && <span className="font-normal text-slate-500"> · {bill.currency} {fmt(bill.payable_total_fcy)}</span>}</td><td className="td text-end num">{fmt(bill.payable_total)}</td></tr>
        </tbody>
      </table></div>
      {remaining && <p className="mt-3 text-xs text-slate-500">Still available for debit notes: net {fmt(remaining.net)}, VAT {fmt(remaining.vat)}.</p>}

      <section aria-label="Attachments" className="mt-4">
        <div className="text-xs font-semibold text-slate-700 mb-1.5">Supplier's invoice (evidence)</div>
        {bill.attachments.length === 0 && <p className="text-xs text-slate-500">No document attached yet.</p>}
        <ul className="text-sm space-y-1">{bill.attachments.map((a) => (
          <li key={a.id}><button className="text-indigo-700 hover:underline cursor-pointer" onClick={() => void view(a.storage_path)}><Paperclip size={13} className="inline me-1" />{a.file_name}</button>
            <span className="text-xs text-slate-500"> · {Math.ceil(a.size_bytes / 1024)} KB</span></li>
        ))}</ul>
        {canUpload && <label className="btn-ghost !py-1.5 mt-2 inline-flex cursor-pointer"><Paperclip size={14} />{uploading ? "Uploading…" : "Attach PDF / image"}
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} /></label>}
      </section>

      {bill.status === "pending" && canApprove && !mine && vatAtStake && (
        <div className="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={override !== null} onChange={(e) => setOverride(e.target.checked ? "" : null)} />Recover the input VAT anyway (approver override, D-32)</label>
          {override !== null && <label className="block mt-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Reason (kept in the audit trail)</span>
            <textarea aria-label="Override reason" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={override} onChange={(e) => setOverride(e.target.value)} /></label>}
        </div>
      )}
      {reason !== null && <label className="block mt-4"><span className="block text-xs font-medium text-slate-600 mb-1.5">Why is it being sent back? Then click “Send back” again.</span>
        <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
    </Modal>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────────────────
type EditLine = { description: string; quantity: string; price: string; accountId: string; taxCode: string };

function BillEditor({ orgId, accounts, contacts, bill, debitFor, all, onClose, onSaved }: {
  orgId: string; accounts: Account[]; contacts: Contact[]; bill: BillWithDetails | null; debitFor: BillWithDetails | null; all: BillWithDetails[];
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const today = useToday();
  const base = bill ?? debitFor;
  const isDebit = (bill?.doc_type ?? (debitFor ? "debit_note" : "bill")) === "debit_note";
  const suppliers = contacts.filter((c) => c.kind !== "customer" && (c.is_active || c.id === base?.contact_id));
  const costAccounts = accounts.filter((a) => (a.type === "expense" || a.type === "asset") && a.is_active && !a.is_control);
  const toLine = (l: BillWithDetails["lines"][number], prefix = "") => ({ description: prefix + l.description, quantity: String(Number(l.quantity)), price: fmtPlain(l.unit_price), accountId: l.account_id, taxCode: l.tax_code });
  const [contactId, setContactId] = useState(base?.contact_id ?? "");
  const [number, setNumber] = useState(bill?.supplier_invoice_no ?? "");
  const [billDate, setBillDate] = useState(bill?.bill_date ?? today);
  const [dueDate, setDueDate] = useState(bill?.due_date ?? "");
  const [currency, setCurrency] = useState<"AED" | "USD">((base?.currency as "AED" | "USD") ?? "AED");
  const [trnOnInvoice, setTrnOnInvoice] = useState(bill?.supplier_trn_on_invoice ?? debitFor?.supplier_trn_on_invoice ?? "");
  const [heading, setHeading] = useState(bill?.has_tax_invoice_heading ?? true);
  const [recipient, setRecipient] = useState(bill?.shows_recipient_details ?? false);
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [lines, setLines] = useState<EditLine[]>(() => bill?.lines.map((l) => toLine(l))
    ?? debitFor?.lines.map((l) => toLine(l, "Return/adjustment: ")) ?? [{ description: "", quantity: "1", price: "", accountId: "", taxCode: "SR" }]);
  const [rules, setRules] = useState<{ vatBp: number; usdAed: string; fullInvoice: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; rulesOn(billDate).then((r) => { if (live) setRules(r); }, () => {}); return () => { live = false; }; }, [billDate]);

  const contact = contacts.find((c) => c.id === contactId);
  const foreign = !!contact && contact.country_code !== "AE";
  const pickContact = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c && !trnOnInvoice) setTrnOnInvoice(c.trn ?? "");
    if (c?.default_account_id || c?.default_tax_code) setLines((ls) => ls.map((l) => (l.accountId ? l : { ...l, accountId: c.default_account_id ?? "", taxCode: c.default_tax_code && BILL_TAX_CODES.some(([k]) => k === c.default_tax_code) ? c.default_tax_code : l.taxCode })));
  };
  const setLine = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const fx = currency === "USD" ? rules?.usdAed ?? "3.6725" : "1";
  const calc = lines.map((l) => {
    const q = parseQuantity(l.quantity), p = parseAedToFils(l.price);
    return q !== null && p !== null && p > 0 ? lineAmounts(q, p, VAT_BEARING.has(l.taxCode) ? rules?.vatBp ?? 0 : 0, fx) : null;
  });
  const srRecoverable = foreign || (heading && !!(trnOnInvoice.trim() || contact?.trn));
  const totals = billTotals(lines.flatMap((l, i) => (calc[i] ? [{ taxCode: l.taxCode, ...calc[i]! }] : [])), isDebit ? (debitFor ?? all.find((x) => x.id === bill?.original_bill_id))?.vat_recoverable_by_checks ?? true : srRecoverable);
  const fcy = documentTotals(calc.filter((c): c is NonNullable<typeof c> => c !== null));
  const remaining = debitFor ? debitRemaining(debitFor, all) : null;
  const vatCharged = lines.some((l, i) => (l.taxCode === "SR" || l.taxCode === "BLK") && (calc[i]?.vat ?? 0) > 0);
  const hints: string[] = [];
  if (!isDebit && !foreign && vatCharged && !srRecoverable) hints.push("Without a supplier TRN and a document headed 'Tax Invoice', the input VAT will not be recovered (D-32). The approver may override with a reason.");
  if (foreign && lines.some((l) => l.taxCode === "SR")) hints.push("This supplier is outside the UAE — use Reverse charge for imported services or goods (Art 48).");

  const save = async (submit: boolean) => {
    setError(null);
    if (!contactId) { setError("Choose the supplier."); return; }
    if (!number.trim()) { setError("Enter the supplier's invoice number."); return; }
    if (trnOnInvoice.trim() && !/^1\d{14}$/.test(trnOnInvoice.trim())) { setError("A TRN is 15 digits starting with 1."); return; }
    const bad = lines.findIndex((l, i) => !l.description.trim() || !l.accountId || calc[i] === null);
    if (bad >= 0) { setError(`Line ${bad + 1}: enter a description, quantity, a price above zero (at most 2 decimals) and an expense or asset account.`); return; }
    if (remaining && (totals.net > remaining.net || totals.vat > remaining.vat)) { setError(`This debit note is more than what is left on the bill (net ${fmt(remaining.net)}, VAT ${fmt(remaining.vat)}).`); return; }
    const doc: BillDraft = {
      doc_type: isDebit ? "debit_note" : "bill", contact_id: contactId, supplier_invoice_no: number.trim(), bill_date: billDate, due_date: dueDate || null, currency,
      original_bill_id: isDebit ? (bill?.original_bill_id ?? debitFor?.id ?? null) : null, supplier_trn_on_invoice: trnOnInvoice.trim(), has_tax_invoice_heading: heading, shows_recipient_details: recipient, notes,
      lines: lines.map((l) => ({ description: l.description.trim(), quantity: l.quantity.trim().replace(/,/g, ""), unit_price: parseAedToFils(l.price)!, account_id: l.accountId, tax_code: l.taxCode })),
    };
    setBusy(true);
    try {
      const id = await saveBill(orgId, bill?.id ?? null, doc);
      if (submit) await submitBill(id);
      toast(submit ? "Sent for approval — someone else must approve it" : "Draft saved — see the compliance checks");
      onSaved(id);
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  return (
    <Modal open wide onClose={onClose} title={isDebit ? `Debit note on ${debitFor?.supplier_invoice_no ?? all.find((x) => x.id === bill?.original_bill_id)?.supplier_invoice_no ?? ""}` : bill ? "Edit bill" : "New bill"}
      footer={<>
        <span className="me-auto text-sm text-slate-700">Net {fmt(totals.net)} · VAT {fmt(totals.vat)} (recovered {fmt(totals.recoverable)}) · <b>Payable AED {fmt(totals.payable)}</b>{currency !== "AED" && ` (${currency} ${fmt(fcy.grossFcy)})`}</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-ghost" disabled={busy} onClick={() => void save(false)}>Save draft</button>
        <button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save(true)}><Send size={15} />Submit for approval</button>
      </>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {hints.length > 0 && <ul className="mb-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-4 py-2 text-xs list-disc ps-8">{hints.map((w) => <li key={w}>{w}</li>)}</ul>}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Supplier</span>
          <select aria-label="Supplier" className={cls} value={contactId} disabled={isDebit} onChange={(e) => pickContact(e.target.value)}>
            <option value="">Choose supplier…</option>{suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.trn ? ` · TRN ${c.trn}` : c.country_code !== "AE" ? ` · ${c.country_code}` : ""}</option>)}
          </select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Supplier's invoice number</span>
          <input aria-label="Supplier's invoice number" className={cls} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{isDebit ? "Debit note date" : "Invoice date (tax date, D-31)"}</span>
          <input aria-label="Bill date" type="date" className={cls} value={billDate} onChange={(e) => setBillDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Due date (blank = supplier terms)</span>
          <input aria-label="Due date" type="date" className={cls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Currency</span>
          <select aria-label="Currency" className={cls} value={currency} disabled={isDebit} onChange={(e) => setCurrency(e.target.value as "AED" | "USD")}><option value="AED">AED</option><option value="USD">USD (at {rules?.usdAed ?? "3.6725"})</option></select></label>
        {!foreign && <>
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Supplier TRN shown on the invoice</span>
            <input aria-label="Supplier TRN on invoice" className={cls} inputMode="numeric" value={trnOnInvoice} onChange={(e) => setTrnOnInvoice(e.target.value)} /></label>
          {!isDebit && <label className="sm:col-span-2 flex items-center gap-2 text-sm pt-5"><input type="checkbox" checked={heading} onChange={(e) => setHeading(e.target.checked)} />The document is headed “Tax Invoice” (Art 59)</label>}
          {!isDebit && vatCharged && supplierInvoiceTotal(lines.flatMap((l, i) => (calc[i] ? [{ taxCode: l.taxCode, ...calc[i]! }] : []))) > (rules?.fullInvoice ?? 1000000) &&
            <label className="sm:col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={recipient} onChange={(e) => setRecipient(e.target.checked)} />
              Full tax invoice: shows our name, address and TRN (over AED {fmt(rules?.fullInvoice ?? 1000000)}, D-46)</label>}
        </>}
        <label className="sm:col-span-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Notes</span><input aria-label="Notes" className={cls} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[860px]">
        <thead><tr><th className="th w-[26%]">Description</th><th className="th w-20">Qty</th><th className="th w-32">Unit price ({currency})</th><th className="th">Expense / asset account</th><th className="th w-44">Tax</th><th className="th text-end">Net</th><th className="th text-end">VAT</th><th className="th w-8"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={i}>
            <td className="td"><input aria-label={`Line ${i + 1} description`} className={`${cls} !py-1.5`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className={`${cls} !py-1.5 text-end`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
            <td className="td"><input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" className={`${cls} !py-1.5 text-end`} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></td>
            <td className="td"><select aria-label={`Line ${i + 1} account`} className={`${cls} !py-1.5`} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
              <option value="">Choose…</option>{costAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
            <td className="td"><select aria-label={`Line ${i + 1} tax code`} className={`${cls} !py-1.5`} value={l.taxCode} onChange={(e) => setLine(i, { taxCode: e.target.value })}>
              {BILL_TAX_CODES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
            <td className="td text-end num">{calc[i] ? fmt(calc[i]!.net) : ""}</td><td className="td text-end num">{calc[i] ? fmt(calc[i]!.vat) : ""}</td>
            <td className="td"><button aria-label={`Remove line ${i + 1}`} className="text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, k) => k !== i) : ls)}><Trash2 size={15} /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="btn-ghost mt-3 !py-1.5" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", price: "", accountId: contact?.default_account_id ?? "", taxCode: contact?.default_tax_code ?? "SR" }])}><Plus size={14} />Add line</button>
      <p className="mt-2 text-xs text-slate-500">VAT is always recalculated at the rate in force on the invoice date, per line, half-up (D-33). Blocked VAT (e.g. entertainment) is added to the cost. Attach the supplier's PDF after saving.</p>
    </Modal>
  );
}
