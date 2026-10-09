/** E-invoicing for one client (D-63): its ASP, and every posted sales document with its e-invoice status — ready to send,
 *  needs fixing, sent (waiting for the ASP), rejected (queue), accepted. Hand-off is manual for every ASP today:
 *  download the PINT AE file, upload it to the client's ASP portal, record the ASP's answer here. */
import { useCallback, useMemo, useState } from "react";
import { FileCode2, Plug, Send } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { buildPint } from "../lib/pint";
import { downloadEinvoice, einvoiceReadiness, toPintDoc } from "../lib/einvoice-ready";
import { ASP_STATUS, einvState, listAspProviders, listSubmissions, recordResult, recordSent, saveClientAsp, STATE_LABEL, type EinvState, type Submission } from "../lib/einvoicing";
import { listInvoices, type InvoiceWithLines } from "../lib/invoices";
import { listContacts } from "../lib/contacts";
import { friendlyDbError } from "../lib/journals";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import { supabase } from "../lib/supabase";
import type { Client } from "../lib/clients";
import { useLoad } from "./hooks";
import { useToast } from "./toast";

const ORDER: EinvState[] = ["to_send", "rejected", "needs_fixing", "sent", "accepted", "not_in_scope"];

export function EinvoicingTab({ client, perms, onClientSaved }: { client: Client; perms: string[]; onClientSaved: () => void }) {
  const toast = useToast();
  const fetchInvoices = useCallback(() => listInvoices(client.id), [client.id]);
  const fetchContacts = useCallback(() => listContacts(client.id), [client.id]);
  const fetchSubs = useCallback(() => listSubmissions(client.id), [client.id]);
  const { data: invoices } = useLoad(fetchInvoices);
  const { data: contacts } = useLoad(fetchContacts);
  const { data: subs, reload: reloadSubs } = useLoad(fetchSubs);
  const { data: asps } = useLoad(listAspProviders);
  const [filter, setFilter] = useState<EinvState | "all">("all");
  const [changingAsp, setChangingAsp] = useState(false);
  const [sending, setSending] = useState<InvoiceWithLines | null>(null);
  const [answering, setAnswering] = useState<{ inv: InvoiceWithLines; sub: Submission } | null>(null);
  const [showFix, setShowFix] = useState<string | null>(null);
  const canPrepare = perms.includes("prepare"), canManage = perms.includes("manage_client");
  const asp = asps?.find((a) => a.id === client.asp_provider_id);

  const rows = useMemo(() => (invoices ?? []).filter((i) => i.status === "posted").map((inv) => {
    const customer = contacts?.find((c) => c.id === inv.contact_id);
    const readiness = einvoiceReadiness(inv, client, customer);
    const mine = (subs ?? []).filter((s) => s.sales_invoice_id === inv.id);
    return { inv, customer, readiness, subs: mine, state: einvState(readiness, mine), last: [...mine].sort((a, b) => b.attempt - a.attempt)[0] };
  }), [invoices, contacts, subs, client]);
  const counts = Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.state === s).length])) as Record<EinvState, number>;
  const shown = rows.filter((r) => filter === "all" || r.state === filter).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || b.inv.issue_date.localeCompare(a.inv.issue_date));

  const pintFor = async (inv: InvoiceWithLines) => {
    const customer = contacts!.find((c) => c.id === inv.contact_id)!;
    const rate = Number((await supabase!.rpc("config_value", { p_key: "vat.rate_bp", p_on: inv.issue_date })).data ?? 0);
    return toPintDoc(inv, client, customer, rate, invoices?.find((x) => x.id === inv.original_invoice_id));
  };
  const download = async (inv: InvoiceWithLines) => { try { downloadEinvoice(await pintFor(inv)); } catch { toast("The e-invoice file could not be created", "err"); } };

  return (
    <>
      <Card title="ASP for this client" icon={<Plug size={16} />}
        sub="The Accredited Service Provider that delivers this client's e-invoices over Peppol and reports them to the FTA (D-63). Hand-off is manual for every ASP today; automatic connections are added one ASP at a time."
        actions={canManage && <button className="btn-ghost" onClick={() => setChangingAsp(true)}><Plug size={15} />{asp ? "Change" : "Choose ASP"}</button>}>
        {asp ? <dl className="grid sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-xs text-slate-500">ASP</dt><dd className="font-medium">{asp.name}</dd>{asp.website && <dd><a className="text-xs text-emerald-700 underline" href={asp.website} target="_blank" rel="noreferrer">{asp.website.replace(/^https?:\/\//, "")}</a></dd>}</div>
          <div><dt className="text-xs text-slate-500">Accreditation</dt><dd>{asp.accreditation_no ?? <Badge tone="amber">Final assessment — not yet accredited</Badge>}</dd></div>
          <div><dt className="text-xs text-slate-500">Status</dt><dd><Badge tone={client.asp_status === "live" ? "emerald" : "amber"} dot>{ASP_STATUS.find(([v]) => v === client.asp_status)?.[1]}</Badge>{client.asp_live_from && <span className="ms-2 text-xs text-slate-500">from {shortDate(client.asp_live_from)}</span>}</dd></div>
          <div><dt className="text-xs text-slate-500">Client's account at the ASP</dt><dd>{client.asp_account_ref ?? "—"}</dd><dd className="text-xs text-slate-500">Connection: {asp.connector === "manual" ? "manual (upload the file)" : "automatic"}</dd></div>
        </dl> : <p className="text-sm text-slate-600">No ASP chosen yet. {canManage ? "Choose one from the Ministry of Finance's list of accredited providers." : "A Firm Admin chooses it."}</p>}
      </Card>

      <Card className="mt-5" title="E-invoices" icon={<FileCode2 size={16} />} pad={false}
        sub="Posted sales invoices and credit notes. Download the PINT AE file, upload it to the ASP's portal, then record what the ASP answered. Rejected ones stay here until fixed and sent again.">
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {(["all", ...ORDER] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
              {f === "all" ? `All (${rows.length})` : `${STATE_LABEL[f][0]} (${counts[f]})`}</button>
          ))}
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px]">
          <thead><tr><th className="th">Document</th><th className="th">Date</th><th className="th">Customer</th><th className="th text-end">Total (AED)</th><th className="th">E-invoice</th><th className="th">ASP reference</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!invoices && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {invoices && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>Nothing here.</td></tr>}
            {shown.map((r) => (
              <tr key={r.inv.id} className="align-top hover:bg-slate-50/70">
                <td className="td font-mono text-xs">{r.inv.invoice_no}{r.inv.doc_type === "credit_note" && <Badge className="ms-1">Credit note</Badge>}</td>
                <td className="td">{shortDate(r.inv.issue_date)}</td>
                <td className="td">{r.inv.customer}</td>
                <td className="td text-end num">{fmt(r.inv.gross_total)}</td>
                <td className="td"><Badge tone={STATE_LABEL[r.state][1]} dot>{STATE_LABEL[r.state][0]}</Badge>
                  {r.subs.length > 1 && <span className="ms-1 text-xs text-slate-500">attempt {r.last.attempt}</span>}
                  {r.last?.status === "rejected" && <div className="mt-1 text-xs text-rose-700">{r.last.rejection_reason}</div>}
                  {r.state === "needs_fixing" && (showFix === r.inv.id
                    ? <ul className="mt-1 list-disc ps-5 text-xs text-amber-900">{r.readiness.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                    : <button className="block mt-1 text-xs text-amber-800 underline cursor-pointer" onClick={() => setShowFix(r.inv.id)}>What to fix ({r.readiness.problems.length})</button>)}</td>
                <td className="td text-xs">{r.last?.asp_reference ?? ""}</td>
                <td className="td text-end whitespace-nowrap">
                  {["to_send", "rejected", "sent", "accepted"].includes(r.state) && <button className="btn-ghost !py-1 !px-2" title="Download the PINT AE file" onClick={() => void download(r.inv)}><FileCode2 size={13} />File</button>}
                  {canPrepare && (r.state === "to_send" || r.state === "rejected") && <button className="btn-primary bg-emerald-600 !py-1 !px-2 ms-1" disabled={!asp} title={asp ? "" : "Choose the client's ASP first"} onClick={() => setSending(r.inv)}><Send size={13} />{r.state === "rejected" ? "Resend…" : "Mark as sent…"}</button>}
                  {canPrepare && r.state === "sent" && <button className="btn-ghost !py-1 !px-2 ms-1" onClick={() => setAnswering({ inv: r.inv, sub: r.last })}>Record answer…</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {changingAsp && asps && <AspForm client={client} asps={asps} onClose={() => setChangingAsp(false)} onSaved={() => { setChangingAsp(false); onClientSaved(); }} />}
      {sending && <SendForm inv={sending} aspName={asp?.name ?? ""} onClose={() => setSending(null)}
        onConfirm={async (ref) => {
          try { await recordSent(sending.id, buildPint(await pintFor(sending)), ref); toast(`${sending.invoice_no} recorded as sent to ${asp?.name}`); setSending(null); reloadSubs(); }
          catch (e) { toast(friendlyDbError(e), "err"); }
        }} onDownload={() => void download(sending)} />}
      {answering && <AnswerForm inv={answering.inv} onClose={() => setAnswering(null)}
        onConfirm={async (status, reason, ref) => {
          try { await recordResult(answering.sub.id, status, reason, ref); toast(status === "accepted" ? "Recorded as accepted" : "Recorded as rejected — it is in the rejection queue"); setAnswering(null); reloadSubs(); }
          catch (e) { toast(friendlyDbError(e), "err"); }
        }} />}
    </>
  );
}

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const lbl = (t: string) => <span className="block text-xs font-medium text-slate-600 mb-1.5">{t}</span>;

function AspForm({ client, asps, onClose, onSaved }: { client: Client; asps: { id: string; name: string; status: string; accreditation_no: string | null }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [aspId, setAspId] = useState(client.asp_provider_id ?? "");
  const [ref, setRef] = useState(client.asp_account_ref ?? "");
  const [status, setStatus] = useState(client.asp_status);
  const [liveFrom, setLiveFrom] = useState(client.asp_live_from ?? "");
  const [busy, setBusy] = useState(false);
  const accredited = asps.filter((a) => a.status === "accredited"), pending = asps.filter((a) => a.status === "final_assessment");
  const save = async () => {
    setBusy(true);
    try { await saveClientAsp(client.id, { asp_provider_id: aspId || null, asp_account_ref: ref.trim() || null, asp_status: status, asp_live_from: liveFrom || null }); toast("ASP saved"); onSaved(); }
    catch (e) { toast(friendlyDbError(e), "err"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`ASP for ${client.legal_name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>Save</button></>}>
      <div className="grid gap-3">
        <label>{lbl("Accredited Service Provider (Ministry of Finance list)")}
          <select aria-label="ASP" className={cls} value={aspId} onChange={(e) => setAspId(e.target.value)}>
            <option value="">— none —</option>
            <optgroup label="Accredited">{accredited.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.accreditation_no})</option>)}</optgroup>
            <optgroup label="Final assessment — not yet accredited">{pending.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
          </select></label>
        <label>{lbl("Client's account or customer ID at the ASP")}<input aria-label="ASP account" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label>{lbl("Onboarding status")}
          <select aria-label="ASP status" className={cls} value={status} onChange={(e) => setStatus(e.target.value)}>{ASP_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>{lbl("Live from (when e-invoicing starts for this client)")}<input aria-label="Live from" type="date" className={cls} value={liveFrom} onChange={(e) => setLiveFrom(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function SendForm({ inv, aspName, onClose, onConfirm, onDownload }: { inv: InvoiceWithLines; aspName: string; onClose: () => void; onConfirm: (ref: string) => Promise<void>; onDownload: () => void }) {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Send ${inv.invoice_no} to ${aspName}`}
      footer={<><button className="btn-ghost me-auto" onClick={onDownload}><FileCode2 size={15} />Download file</button><button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(ref); setBusy(false); }}><Send size={15} />Record as sent</button></>}>
      <ol className="list-decimal ps-5 text-sm text-slate-700 space-y-1 mb-3">
        <li>Download the PINT AE file.</li><li>Upload it in {aspName}'s portal for this client.</li><li>Enter the reference the ASP gives (if any) and record it as sent.</li>
      </ol>
      <label>{lbl("ASP's reference (optional)")}<input aria-label="ASP reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
      <p className="mt-2 text-xs text-slate-500">The app keeps a fingerprint (SHA-256) of the file, so the record shows exactly which file was handed over.</p>
    </Modal>
  );
}

function AnswerForm({ inv, onClose, onConfirm }: { inv: InvoiceWithLines; onClose: () => void; onConfirm: (status: "accepted" | "rejected", reason: string, ref: string) => Promise<void> }) {
  const [status, setStatus] = useState<"accepted" | "rejected">("accepted");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`ASP's answer for ${inv.invoice_no}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-emerald-600" disabled={busy || (status === "rejected" && !reason.trim())} onClick={async () => { setBusy(true); await onConfirm(status, reason, ref); setBusy(false); }}>Record</button></>}>
      <div className="flex gap-4 text-sm mb-3">
        <label className="flex items-center gap-1.5"><input type="radio" checked={status === "accepted"} onChange={() => setStatus("accepted")} />Accepted</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={status === "rejected"} onChange={() => setStatus("rejected")} />Rejected</label>
      </div>
      {status === "rejected" && <label className="block mb-3">{lbl("Reason the ASP gave (e.g. the rule ID and message)")}<textarea aria-label="Rejection reason" className={cls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
      <label>{lbl("ASP's reference (optional)")}<input aria-label="ASP reference" className={cls} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
    </Modal>
  );
}
