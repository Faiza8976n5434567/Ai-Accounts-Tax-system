/** P4-08 · Import a received e-invoice (PINT AE file downloaded from the client's ASP portal) as a draft purchase bill. */
import { useState } from "react";
import { FileCode2 } from "lucide-react";
import { Badge, Modal } from "../components/ui";
import { inboundChecks, PURCHASE_CODE, readPint, toPurchaseDoc, type PintRead } from "../lib/pint-read";
import { importEinvoice } from "../lib/einvoicing";
import { BILL_TAX_CODES, type BillWithDetails } from "../lib/bills";
import { emptyContact, listContacts, saveContact, type Contact } from "../lib/contacts";
import { friendlyDbError } from "../lib/journals";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import type { Account, Client } from "../lib/clients";
import { useToast } from "./toast";

export function ImportEinvoice({ client, accounts, contacts, bills, onClose, onImported }: {
  client: Client; accounts: Account[]; contacts: Contact[]; bills: BillWithDetails[]; onClose: () => void; onImported: (billId: string) => void;
}) {
  const toast = useToast();
  const [xml, setXml] = useState<string | null>(null);
  const [read, setRead] = useState<PintRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ accountId: string; taxCode: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const expense = accounts.filter((a) => a.is_active && !a.is_control && (a.type === "expense" || a.type === "asset"));

  const supplier = read ? contacts.find((c) => c.kind !== "customer" && c.trn && c.trn === read.supplier.trn)
    ?? contacts.find((c) => c.kind !== "customer" && c.name.trim().toLowerCase() === read.supplier.name.trim().toLowerCase()) : undefined;
  const original = read?.kind === "creditnote" && read.preceding ? bills.find((b) => b.doc_type === "bill" && b.status === "posted" && b.supplier_invoice_no === read.preceding!.number && (!supplier || b.contact_id === supplier.id)) : undefined;
  const checks = read ? inboundChecks(read, client.trn) : null;
  const blocking = [...(checks?.errors ?? []), ...(read?.kind === "creditnote" && read.preceding && !original ? [`The original bill ${read.preceding.number} is not posted in this client — import it first.`] : [])];

  const pick = async (f: File | undefined) => {
    setError(null); setRead(null); setXml(null);
    if (!f) return;
    if (f.size > 2_000_000) { setError("The file is larger than 2 MB."); return; }
    try {
      const text = await f.text();
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("This file is not valid XML.");
      const r = readPint(doc);
      const def = (supplierDefault: string | null | undefined) => supplierDefault && expense.some((a) => a.id === supplierDefault) ? supplierDefault : "";
      const sup = contacts.find((c) => c.kind !== "customer" && c.trn && c.trn === r.supplier.trn);
      setLines(r.lines.map((l) => ({ accountId: def(sup?.default_account_id), taxCode: PURCHASE_CODE[l.category] ?? "SR" })));
      setXml(text); setRead(r);
    } catch (e) { setError(e instanceof Error ? e.message : "The file could not be read."); }
  };

  const go = async () => {
    if (!read || !xml) return;
    if (lines.some((l) => !l.accountId)) { setError("Choose an expense or asset account for every line."); return; }
    setBusy(true); setError(null);
    try {
      let supplierId = supplier?.id;
      if (!supplierId) {                                                         // create the supplier from the e-invoice
        const c = emptyContact("supplier");
        await saveContact(client.id, null, { ...c, name: read.supplier.name, trn: read.supplier.trn ?? "", countryCode: read.supplier.countryCode ?? "AE",
          emirateCode: read.supplier.countryCode === "AE" ? read.supplier.emirate ?? "" : "", addressLine1: read.supplier.addressLine1 ?? "", city: read.supplier.city ?? "", regId: read.supplier.regId ?? "" });
        supplierId = (await listContacts(client.id)).find((x) => x.name.trim().toLowerCase() === read.supplier.name.trim().toLowerCase())?.id;
        if (!supplierId) throw new Error("The supplier could not be created.");
      }
      const id = await importEinvoice(client.id, xml, { einv_uuid: read.uuid, doc_kind: read.kind, document_number: read.number, supplier_trn: read.supplier.trn, buyer_trn: read.buyer.trn },
        toPurchaseDoc(read, supplierId, lines, original?.id));
      toast(`${read.kind === "creditnote" ? "Debit note" : "Bill"} ${read.number} created as a draft — review and submit it`);
      onImported(id);
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm";
  return (
    <Modal open wide onClose={onClose} title="Import a received e-invoice"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={!read || blocking.length > 0 || busy} onClick={() => void go()}><FileCode2 size={15} />{busy ? "Importing…" : read?.kind === "creditnote" ? "Create draft debit note" : "Create draft bill"}</button></>}>
      <p className="text-sm text-slate-600 mb-3">Download the supplier's e-invoice (PINT AE file, .xml) from this client's ASP portal and choose it here. The app reads it, you check it, and a <b>draft</b> bill is created for the normal review and approval. The original file is kept, and the same e-invoice cannot be imported twice.</p>
      <input aria-label="E-invoice file" type="file" accept=".xml,application/xml,text/xml" onChange={(e) => void pick(e.target.files?.[0])} />
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {read && checks && <>
        {blocking.length > 0 && <ul className="mt-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 text-rose-900 px-4 py-2 text-sm list-disc ps-8">{blocking.map((x) => <li key={x}>{x}</li>)}</ul>}
        {checks.warnings.length > 0 && <ul className="mt-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-4 py-2 text-sm list-disc ps-8">{checks.warnings.map((x) => <li key={x}>{x}</li>)}</ul>}
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-xs text-slate-500">{read.kind === "creditnote" ? "Supplier credit note" : "Supplier invoice"}</dt><dd className="font-mono text-xs">{read.number}</dd></div>
          <div><dt className="text-xs text-slate-500">Date / due</dt><dd>{shortDate(read.issueDate)}{read.dueDate && ` · ${shortDate(read.dueDate)}`}</dd></div>
          <div><dt className="text-xs text-slate-500">Supplier</dt><dd>{read.supplier.name}</dd><dd className="text-xs text-slate-500">TRN {read.supplier.trn ?? "—"}</dd>
            <dd>{supplier ? <Badge tone="emerald">Matches {supplier.name}</Badge> : <Badge tone="amber">New — will be added as a supplier</Badge>}</dd></div>
          <div><dt className="text-xs text-slate-500">Total ({read.currency})</dt><dd className="num">{fmt(read.totals.net)} + VAT {fmt(read.totals.vat)} = <b>{fmt(read.totals.payable)}</b></dd></div>
          {original && <div><dt className="text-xs text-slate-500">Credits bill</dt><dd className="font-mono text-xs">{original.supplier_invoice_no}</dd></div>}
        </dl>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">Line</th><th className="th text-end">Net</th><th className="th text-end">VAT on file</th><th className="th">Account</th><th className="th">Tax code</th></tr></thead>
          <tbody>{read.lines.map((l, i) => (
            <tr key={i}><td className="td"><div>{l.name}</div><div className="text-xs text-slate-500">{l.quantity} {l.unitCode} · {l.category}{l.ratePct ? ` ${l.ratePct}%` : ""}{l.hsCode ? ` · HS ${l.hsCode}` : ""}{l.sacCode ? ` · SAC ${l.sacCode}` : ""}</div></td>
              <td className="td text-end num">{fmt(l.net)}</td><td className="td text-end num">{l.vat === null ? "—" : fmt(l.vat)}</td>
              <td className="td"><select aria-label={`Line ${i + 1} account`} className={cls} value={lines[i]?.accountId ?? ""} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, accountId: e.target.value } : x)))}>
                <option value="">Choose…</option>{expense.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
              <td className="td"><select aria-label={`Line ${i + 1} tax code`} className={cls} value={lines[i]?.taxCode ?? "SR"} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, taxCode: e.target.value } : x)))}>
                {BILL_TAX_CODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td></tr>
          ))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-slate-500">The bill calculates VAT itself; if it differs from the supplier's VAT on the file, the review shows it before approval.</p>
      </>}
    </Modal>
  );
}
