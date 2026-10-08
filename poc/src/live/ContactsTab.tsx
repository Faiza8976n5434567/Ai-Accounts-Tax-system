/** Customers and suppliers for one client (P2-01). */
import { useCallback, useMemo, useState } from "react";
import { Contact as ContactIcon, FileDown, FileUp, Pencil, Plus } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { contactProblems, emptyContact, fromContact, listContacts, saveContact, trnStatus, type Contact, type ContactInput, type ContactKind } from "../lib/contacts";
import { friendlyDbError } from "../lib/journals";
import type { Account, Emirate } from "../lib/clients";
import { listEmirates } from "../lib/clients";
import { useLoad } from "./hooks";
import { downloadContactsTemplate, importContacts, parseContactsSheet, type ContactImportRow } from "../lib/contactsImport";
import { readStatementFile } from "../lib/bankImport";
import { useToast } from "./toast";

type Filter = "all" | "customer" | "supplier" | "inactive";
const KIND_LABEL: Record<ContactKind, string> = { customer: "Customer", supplier: "Supplier", both: "Customer & supplier" };
const TAX_CODES: [string, string][] = [["", "— none —"], ["SR", "Standard rated 5%"], ["ZR", "Zero rated"], ["EX", "Exempt"], ["OS", "Out of scope"], ["RCS", "Reverse charge"], ["BLK", "Blocked input VAT"]];

export function ContactsTab({ orgId, accounts, canEdit }: { orgId: string; accounts: Account[]; canEdit: boolean }) {
  const fetchContacts = useCallback(() => listContacts(orgId), [orgId]);
  const { data, error, reload } = useLoad(fetchContacts);
  const { data: emirates } = useLoad(listEmirates);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | ContactKind | null>(null);
  const [importing, setImporting] = useState(false);

  const contacts = useMemo(() => data ?? [], [data]);
  const shown = useMemo(() => contacts.filter((c) => {
    if (filter === "inactive" ? c.is_active : !c.is_active) return false;
    if (filter === "customer" && c.kind === "supplier") return false;
    if (filter === "supplier" && c.kind === "customer") return false;
    const s = q.trim().toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || (c.trn ?? "").includes(s) || (c.email ?? "").toLowerCase().includes(s);
  }), [contacts, filter, q]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`])), [accounts]);

  return (
    <>
      <Card title="Customers & suppliers" icon={<ContactIcon size={16} />} pad={false}
        sub="One list for both. A TRN must be 15 digits starting with 1. Contacts are never deleted — deactivate them instead."
        actions={canEdit && <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setImporting(true)}><FileUp size={15} />Import from Excel</button>
          <button className="btn-ghost" onClick={() => setEditing("supplier")}><Plus size={15} />Supplier</button>
          <button className="btn-primary bg-emerald-600" onClick={() => setEditing("customer")}><Plus size={15} />Customer</button>
        </div>}>
        <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
          {(["all", "customer", "supplier", "inactive"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
              {f === "all" ? "All active" : f === "customer" ? "Customers" : f === "supplier" ? "Suppliers" : "Inactive"}
            </button>
          ))}
          <input aria-label="Search contacts" placeholder="Search name, TRN or email" className="ms-auto rounded-xl border border-slate-200 px-3 py-1.5 text-sm w-64 max-w-full" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load contacts.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Name</th><th className="th">Type</th><th className="th">TRN</th><th className="th">Location</th><th className="th">Terms</th><th className="th">Default account</th>{canEdit && <th className="th"><span className="sr-only">Edit</span></th>}</tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {data && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>{contacts.length ? "No contacts match." : "No customers or suppliers yet."}</td></tr>}
            {shown.map((c) => {
              const t = trnStatus(c);
              return (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="td"><div className="font-medium">{c.name}{c.is_related_party && <Badge tone="indigo" className="ms-2">Related party</Badge>}</div>{c.email && <div className="text-xs text-slate-500">{c.email}</div>}</td>
                  <td className="td">{KIND_LABEL[c.kind]}</td>
                  <td className="td">{t === "valid" ? <span className="font-mono text-xs">{c.trn}</span> : t === "missing" ? <Badge tone="amber">No TRN</Badge> : <Badge>Foreign</Badge>}</td>
                  <td className="td">{c.country_code}{c.emirate_code && ` · ${c.emirate_code}`}</td>
                  <td className="td">{c.payment_terms_days} days</td>
                  <td className="td text-xs text-slate-600">{c.default_account_id ? accountName.get(c.default_account_id) : ""}{c.default_tax_code && ` · ${c.default_tax_code}`}</td>
                  {canEdit && <td className="td text-end"><button aria-label={`Edit ${c.name}`} className="btn-ghost !py-1 !px-2" onClick={() => setEditing(c)}><Pencil size={13} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>
      {editing && <ContactForm orgId={orgId} contact={typeof editing === "string" ? null : editing} kind={typeof editing === "string" ? editing : editing.kind}
        accounts={accounts} emirates={emirates ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {importing && <ImportContacts orgId={orgId} onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
    </>
  );
}

function ContactForm({ orgId, contact, kind, accounts, emirates, onClose, onSaved }: {
  orgId: string; contact: Contact | null; kind: ContactKind; accounts: Account[]; emirates: Emirate[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<ContactInput>(contact ? fromContact(contact) : emptyContact(kind));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const isSupplier = f.kind !== "customer";
  // Default account: income for customers, expense/asset for suppliers; control accounts are never a default.
  const accountChoices = accounts.filter((a) => a.is_active && !a.is_control && (isSupplier ? a.type === "expense" || a.type === "asset" : a.type === "revenue"));

  const save = async () => {
    const problems = contactProblems(f);
    if (problems.length) { setError(problems[0]); return; }
    setBusy(true); setError(null);
    try { await saveContact(orgId, contact?.id ?? null, f); toast(contact ? "Contact updated" : `${f.name.trim()} added`); onSaved(); }
    catch (e) { setError(friendlyDbError(e).replace("That code is already used in this client's chart of accounts.", "A contact with this name already exists for this client.")); }
    finally { setBusy(false); }
  };
  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  const text = (k: keyof ContactInput, label: string, wide = false, placeholder = "") => (
    <label className={wide ? "sm:col-span-2" : undefined}><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <input className={cls} placeholder={placeholder} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} /></label>
  );
  return (
    <Modal open onClose={onClose} wide title={contact ? `Edit ${contact.name}` : kind === "customer" ? "New customer" : "New supplier"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("name", "Name (as on their trade licence or invoice)", true)}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Type</span>
          <select className={cls} value={f.kind} onChange={(e) => set("kind", e.target.value as ContactKind)}>
            <option value="customer">Customer</option><option value="supplier">Supplier</option><option value="both">Customer & supplier</option>
          </select></label>
        {text("trn", "TRN (15 digits, if VAT registered)", false, "100…")}
        {text("countryCode", "Country (2 letters)", false, "AE")}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Emirate (UAE only)</span>
          <select className={cls} value={f.emirateCode} disabled={f.countryCode.toUpperCase() !== "AE"} onChange={(e) => set("emirateCode", e.target.value)}>
            <option value="">—</option>{emirates.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
          </select></label>
        {text("email", "Email")}
        {text("phone", "Phone")}
        {text("address", "Address", true)}
        {text("paymentTermsDays", "Payment terms (days; blank = firm default)")}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Default tax code</span>
          <select className={cls} value={f.defaultTaxCode} onChange={(e) => set("defaultTaxCode", e.target.value)}>{TAX_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Default account ({isSupplier ? "expense or asset" : "income"}) — pre-fills new {isSupplier ? "bills" : "invoices"}</span>
          <select className={cls} value={f.defaultAccountId} onChange={(e) => set("defaultAccountId", e.target.value)}>
            <option value="">— none —</option>{accountChoices.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isRelatedParty} onChange={(e) => set("isRelatedParty", e.target.checked)} />Related party (Corporate Tax transfer pricing)</label>
        {contact && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />Active</label>}
      </div>
    </Modal>
  );
}

// ── Import from the Excel template (P2-07) ──────────────────────────────────────────────
function ImportContacts({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ContactImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: { row: number; name: string; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setRows(null); setResult(null);
    try {
      const parsed = parseContactsSheet(await readStatementFile(f));
      if (parsed.errors.length) setError(parsed.errors.join(" ")); else setRows(parsed.rows);
    } catch { setError("This file could not be read. Use the template (.xlsx) or a CSV with the same columns."); }
  };
  const go = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try { const r = await importContacts(orgId, rows); setResult(r); toast(`${r.imported} contact(s) imported`); }
    catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide onClose={result ? onDone : onClose} title="Import customers & suppliers"
      footer={result ? <button className="btn-primary bg-emerald-600" onClick={onDone}>Done</button> : <>
        <button className="btn-ghost me-auto" onClick={() => void downloadContactsTemplate().catch(() => toast("The template could not be created", "err"))}><FileDown size={15} />Download template</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={!rows || busy} onClick={() => void go()}><FileUp size={15} />{busy ? "Importing…" : `Import ${rows?.length ?? ""}`}</button></>}>
      {!result && <>
        <p className="text-sm text-slate-600 mb-3">Fill the <b>Contacts</b> sheet of the template (see its Instructions sheet), then choose the file. Contacts that already exist (same name or TRN) are skipped and never changed. If any row has a problem, nothing is imported and every problem is listed.</p>
        <input aria-label="Contacts file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void pick(e.target.files?.[0])} />
        {rows && <p className="mt-3 text-sm text-slate-700">{rows.length} row(s) ready to import.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700 whitespace-pre-line">{error.replace(/; (?=Row \d)/g, "\n")}</p>}
      </>}
      {result && <>
        <p className="text-sm text-slate-800"><b>{result.imported}</b> contact(s) imported.</p>
        {result.skipped.length > 0 && <>
          <p className="mt-3 text-sm text-slate-700">{result.skipped.length} skipped because they already exist:</p>
          <ul className="mt-1 text-xs text-slate-600 list-disc ps-5">{result.skipped.map((s) => <li key={s.row}>Row {s.row}: {s.name} — {s.reason}</li>)}</ul>
        </>}
      </>}
    </Modal>
  );
}
