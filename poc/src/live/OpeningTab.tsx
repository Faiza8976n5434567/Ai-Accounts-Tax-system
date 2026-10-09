/** Opening balances for a client moving from another system (D-52): the opening journal + the old system's unpaid
 *  invoices and bills as opening documents; account 3999 must end at zero. */
import { useCallback, useState } from "react";
import { CheckCircle2, FileDown, FileUp, Plus, Trash2, Waypoints } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { fmt, parseAedToFils } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { readStatementFile } from "../lib/bankImport";
import type { Client } from "../lib/clients";
import { listContacts } from "../lib/contacts";
import {
  deleteOpeningDocument, downloadOpeningTemplate, openingStatus, parseOpeningSheet, postOpeningDocuments, saveOpeningDocuments, type OpeningRow,
} from "../lib/opening";
import type { ClientTab } from "./routes";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function OpeningTab({ client, perms, openTab }: { client: Client; perms: string[]; openTab: (t: ClientTab) => void }) {
  const toast = useToast();
  const fetch = useCallback(() => openingStatus(client.id), [client.id]);
  const { data, reload } = useLoad(fetch);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [posting, setPosting] = useState(false);
  const canPrepare = perms.includes("prepare"), canPost = perms.includes("post_journal");
  const docs = data?.documents ?? [];
  const waiting = docs.filter((d) => d.status === "pending");
  const sum = (k: "customer" | "supplier", status?: string) => docs.filter((d) => d.kind === k && (!status || d.status === status)).reduce((s, d) => s + d.amount, 0);
  const bal = data?.clearing_balance ?? 0;
  return (
    <>
      <Card title="Opening balances (moving from another system)" icon={<Waypoints size={16} />}
        sub="1 · Enter the old trial balance at the cut-off as the opening journal, with customer and supplier balances on 3999 Opening balance clearing. 2 · Enter each unpaid invoice and bill below. 3 · A Firm Admin posts them. 3999 must end at exactly 0.00.">
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Opening journal</div>
            {data && (data.opening_journals > 0 ? <Badge tone="emerald" dot>Posted</Badge> : <button className="text-indigo-700 hover:underline cursor-pointer" onClick={() => openTab("journals")}>Not yet — Journals → Opening balances</button>)}</div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Opening documents</div>
            <div>Customers AED {fmt(sum("customer"))} · Suppliers AED {fmt(sum("supplier"))}</div>
            {waiting.length > 0 && <div className="text-xs text-amber-700">{waiting.length} waiting to be posted</div>}</div>
          <div className={`rounded-xl p-3 ${bal === 0 ? "bg-emerald-50" : "bg-amber-50"}`}><div className="text-xs text-slate-500">3999 Opening balance clearing</div>
            <div className={`font-semibold num ${bal === 0 ? "text-emerald-700" : "text-amber-800"}`}>{fmt(bal)} {bal === 0 ? "✓ matches the trial balance" : ""}</div>
            {bal !== 0 && <div className="text-xs text-slate-600">{bal > 0 ? "More receivables in the trial balance than in the documents (or payables missing)." : "More payables in the trial balance than in the documents (or receivables missing)."}</div>}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canPrepare && <><button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={15} />Add one</button>
            <button className="btn-ghost" onClick={() => setImporting(true)}><FileUp size={15} />Import from Excel</button></>}
          {canPost && waiting.length > 0 && <button className="btn-primary bg-emerald-600" onClick={() => setPosting(true)}><CheckCircle2 size={15} />Post {waiting.length} opening document(s)</button>}
        </div>
      </Card>

      <Card title="Opening documents" className="mt-4" pad={false} sub="Old numbers and real dates; the amount still open (incl. VAT). No VAT is recalculated — it was declared in the old system.">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead><tr><th className="th">Type</th><th className="th">Customer / supplier</th><th className="th">Old number</th><th className="th">Date</th><th className="th">Due</th><th className="th text-end">Open amount</th><th className="th">Status</th><th className="th"><span className="sr-only">Delete</span></th></tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={8}>Loading…</td></tr>}
            {data && docs.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>None yet.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id}><td className="td">{d.kind === "customer" ? "Owed to us" : "We owe"}</td><td className="td">{d.contact}</td><td className="td font-mono text-xs">{d.number}</td>
                <td className="td">{shortDate(d.date)}</td><td className="td">{shortDate(d.due_date)}</td><td className="td text-end num">{fmt(d.amount)}</td>
                <td className="td"><Badge tone={d.status === "posted" ? "emerald" : "amber"} dot>{d.status === "posted" ? "Posted" : "Waiting"}</Badge></td>
                <td className="td text-end">{d.status === "pending" && canPrepare && <button aria-label={`Delete ${d.number}`} className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  onClick={() => void deleteOpeningDocument(d.id).then(() => { toast("Deleted"); reload(); }, (e) => toast(friendlyDbError(e), "err"))}><Trash2 size={15} /></button>}</td></tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {adding && <AddOne client={client} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast("Saved — waiting to be posted"); reload(); }} />}
      {importing && <ImportOpening orgId={client.id} onClose={() => setImporting(false)} onSaved={(n) => { setImporting(false); toast(`${n} opening document(s) saved`); reload(); }} />}
      {posting && <PostThem orgId={client.id} onClose={() => setPosting(false)} onDone={(n) => { setPosting(false); toast(`${n} opening document(s) posted`); reload(); }} />}
    </>
  );
}

function AddOne({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => void }) {
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const { data: contacts } = useLoad(fetchContacts);
  const [f, setF] = useState({ kind: "customer" as "customer" | "supplier", contact: "", number: "", date: "", due: "", amount: "" });
  const [error, setError] = useState<string | null>(null);
  const people = (contacts ?? []).filter((c) => (f.kind === "customer" ? c.kind !== "supplier" : c.kind !== "customer"));
  const save = async () => {
    setError(null);
    const amount = parseAedToFils(f.amount);
    if (!f.contact || !f.number.trim() || !f.date || amount === null || amount <= 0) { setError("Choose the customer/supplier and enter the old number, date and open amount."); return; }
    const row: OpeningRow = { row: 1, kind: f.kind, contact_name: people.find((c) => c.id === f.contact)?.name ?? "", number: f.number.trim(), date: f.date, due_date: f.due || null, amount };
    try { await saveOpeningDocuments(client.id, [row]); onSaved(); } catch (e) { setError(friendlyDbError(e)); }
  };
  return (
    <Modal open onClose={onClose} title="Add an opening invoice or bill"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" onClick={() => void save()}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Type</span>
          <select aria-label="Type" className={cls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "customer" | "supplier", contact: "" })}>
            <option value="customer">Unpaid sales invoice (customer)</option><option value="supplier">Unpaid bill (supplier)</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{f.kind === "customer" ? "Customer" : "Supplier"}</span>
          <select aria-label="Contact" className={cls} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}>
            <option value="">Choose…</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Old number</span><input aria-label="Old number" className={cls} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Open amount (AED, incl. VAT)</span><input aria-label="Open amount" inputMode="decimal" className={`${cls} text-end`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Document date</span><input aria-label="Document date" type="date" className={cls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Due date</span><input aria-label="Due date" type="date" className={cls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

function ImportOpening({ orgId, onClose, onSaved }: { orgId: string; onClose: () => void; onSaved: (n: number) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<OpeningRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setRows(null);
    try { const p = parseOpeningSheet(await readStatementFile(file)); if (p.errors.length) setError(p.errors.join("\n")); else setRows(p.rows); }
    catch { setError("This file could not be read. Use the template (.xlsx) or a CSV with the same columns."); }
  };
  return (
    <Modal open wide onClose={onClose} title="Import opening invoices and bills"
      footer={<><button className="btn-ghost me-auto" onClick={() => void downloadOpeningTemplate().catch(() => toast("The template could not be created", "err"))}><FileDown size={15} />Download template</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={!rows || busy} onClick={() => { setBusy(true); void saveOpeningDocuments(orgId, rows!).then(onSaved, (e) => setError(friendlyDbError(e).replace(/; (?=Row \d)/g, "\n"))).finally(() => setBusy(false)); }}>
          <FileUp size={15} />{busy ? "Saving…" : `Save ${rows?.length ?? ""}`}</button></>}>
      <p className="text-sm text-slate-600 mb-3">One row per unpaid invoice or bill at the cut-off, with the amount still open. The customers and suppliers must exist first (Customers & suppliers → Import from Excel). If any row has a problem, nothing is saved.</p>
      <input aria-label="Opening documents file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void pick(e.target.files?.[0])} />
      {rows && <p className="mt-3 text-sm">{rows.length} row(s) ready · customers AED {fmt(rows.filter((r) => r.kind === "customer").reduce((s, r) => s + r.amount, 0))} · suppliers AED {fmt(rows.filter((r) => r.kind === "supplier").reduce((s, r) => s + r.amount, 0))}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 whitespace-pre-line">{error}</p>}
    </Modal>
  );
}

function PostThem({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: (n: number) => void }) {
  const today = useToday();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Post the opening documents"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={!date} onClick={() => void postOpeningDocuments(orgId, date).then(onDone, (e) => setError(friendlyDbError(e)))}><CheckCircle2 size={15} />Post</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">Each document moves its amount from 3999 to receivables or payables, dated the conversion date — the same date as the opening journal (the last day before the first period you re-key). You cannot post documents you entered yourself.</p>
      <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Conversion date</span><input aria-label="Conversion date" type="date" className={cls} max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </Modal>
  );
}
