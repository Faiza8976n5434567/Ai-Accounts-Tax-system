/** Journals and the approval queue for one client (P1-14 · Spec 02 R1–R3 · D-26). */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpenCheck, CheckCircle2, FilePlus2, Landmark, RotateCcw, Send, Undo2, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import type { Account } from "../lib/clients";
import {
  approveJournal, deleteDraft, friendlyDbError, journalActions, lineTotals, listJournals, requestReversal, sendBack,
  SOURCE_LABEL, STATUS_LABEL, submitJournal, withdrawJournal, type Journal, type JournalAction, type JournalSource,
} from "../lib/journals";
import { JournalEditor } from "./JournalEditor";
import { useToast } from "./toast";

const STATUS_TONE: Record<string, string> = { draft: "slate", pending: "amber", posted: "emerald", reversed: "rose" };
type Filter = "all" | "pending" | "draft" | "posted";

export function JournalsTab({ orgId, accounts, perms, booksStart, approvalsOnly }: { orgId: string; accounts: Account[]; perms: string[]; booksStart: string; approvalsOnly?: boolean }) {
  const auth = useAuth()!;
  const toast = useToast();
  const [journals, setJournals] = useState<Journal[] | null>(null);
  const [filter, setFilter] = useState<Filter>(approvalsOnly ? "pending" : "all");
  const [open, setOpen] = useState<Journal | null>(null);
  const [editing, setEditing] = useState<{ journal: Journal | null; source: JournalSource } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setJournals(await listJournals(orgId)); setError(null); } catch { setError("Could not load journals."); }
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`])), [accounts]);
  const pendingReversalOf = useMemo(() => new Set((journals ?? []).filter((j) => j.source === "reversal" && j.status === "pending").map((j) => j.reversal_of)), [journals]);
  const shown = (journals ?? []).filter((j) => filter === "all" || j.status === filter || (filter === "posted" && j.status === "reversed"));
  const hasOpening = (journals ?? []).some((j) => j.source === "opening");
  const pendingCount = (journals ?? []).filter((j) => j.status === "pending").length;

  const done = async (msg: string) => { toast(msg); setOpen(null); await reload(); };
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); await done(msg); } catch (e) { toast(friendlyDbError(e), "err"); } };

  return (
    <>
      <Card title={approvalsOnly ? "Waiting for approval" : "Journals"} icon={<BookOpenCheck size={16} />} pad={false}
        sub={approvalsOnly ? "Approve or send back journals prepared by someone else — you can never approve your own (maker-checker)" : "Drafts, journals waiting for approval, and posted journals. Posted journals are never edited — only reversed."}
        actions={!approvalsOnly && perms.includes("prepare") && <div className="flex gap-2">
          {!hasOpening && <button className="btn-ghost" onClick={() => setEditing({ journal: null, source: "opening" })}><Landmark size={15} />Opening balances</button>}
          <button className="btn-primary bg-emerald-600" onClick={() => setEditing({ journal: null, source: "manual" })}><FilePlus2 size={15} />New journal</button>
        </div>}>
        {!approvalsOnly && (
          <div className="px-5 pb-3 flex flex-wrap gap-1.5">
            {(["all", "pending", "draft", "posted"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
                {f === "all" ? "All" : f === "pending" ? `Waiting for approval${pendingCount ? ` (${pendingCount})` : ""}` : f === "draft" ? "Drafts" : "Posted"}
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">{error}</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead><tr><th className="th">Number</th><th className="th">Date</th><th className="th">Description</th><th className="th">Type</th><th className="th">Status</th><th className="th">Prepared by</th><th className="th text-end">Amount (AED)</th></tr></thead>
          <tbody>
            {journals === null && <tr><td className="td text-slate-500" colSpan={7}>Loading…</td></tr>}
            {journals && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>{approvalsOnly ? "Nothing is waiting for approval." : "No journals here yet."}</td></tr>}
            {shown.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpen(j)}>
                <td className="td font-mono text-xs">{j.journal_no ?? <span className="text-slate-400">—</span>}</td>
                <td className="td">{shortDate(j.entry_date)}</td>
                <td className="td max-w-xs truncate">{j.memo}</td>
                <td className="td">{SOURCE_LABEL[j.source]}</td>
                <td className="td"><Badge tone={STATUS_TONE[j.status]} dot>{STATUS_LABEL[j.status]}</Badge></td>
                <td className="td text-slate-600">{j.preparer ?? "—"}{j.prepared_by === auth.userId && <span className="text-xs text-slate-400"> (you)</span>}</td>
                <td className="td text-end num">{fmt(lineTotals(j.lines).debit)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {open && <JournalView journal={open} accountName={accountName} actions={journalActions(open, auth.userId, perms, pendingReversalOf.has(open.id))}
        onClose={() => setOpen(null)}
        onAction={async (a, reason, date) => {
          if (a === "edit") { setEditing({ journal: open, source: open.source }); setOpen(null); return; }
          if (a === "submit") return run(() => submitJournal(open.id), "Sent for approval");
          if (a === "withdraw") return run(() => withdrawJournal(open.id), "Withdrawn to draft");
          if (a === "delete") return run(() => deleteDraft(open.id), "Draft deleted");
          if (a === "approve") return run(async () => { const no = await approveJournal(open.id); toast(`Posted as ${no}`); }, open.source === "reversal" ? "Reversal approved and posted" : "Approved and posted");
          if (a === "send_back" || a === "cancel_reversal") return run(() => sendBack(open.id, reason!), a === "send_back" ? "Sent back to the preparer" : "Reversal request cancelled");
          if (a === "request_reversal") return run(() => requestReversal(open.id, reason!, date!), "Reversal requested — another Firm Admin must approve it");
        }} />}

      {editing && <JournalEditor orgId={orgId} accounts={accounts} journal={editing.journal} source={editing.source}
        defaultDate={editing.source === "opening" ? booksStart : new Date().toISOString().slice(0, 10)}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

const ACTION_UI: Record<JournalAction, { label: string; icon: ReactNode; tone: "primary" | "ghost" | "danger"; needsReason?: string }> = {
  approve: { label: "Approve and post", icon: <CheckCircle2 size={15} />, tone: "primary" },
  submit: { label: "Submit for approval", icon: <Send size={15} />, tone: "primary" },
  edit: { label: "Edit", icon: <FilePlus2 size={15} />, tone: "ghost" },
  withdraw: { label: "Withdraw to draft", icon: <Undo2 size={15} />, tone: "ghost" },
  send_back: { label: "Send back", icon: <XCircle size={15} />, tone: "danger", needsReason: "Why is it being sent back? The preparer will see this in the audit trail." },
  cancel_reversal: { label: "Cancel reversal request", icon: <XCircle size={15} />, tone: "danger", needsReason: "Why is the reversal being cancelled?" },
  delete: { label: "Delete draft", icon: <XCircle size={15} />, tone: "danger" },
  request_reversal: { label: "Request reversal", icon: <RotateCcw size={15} />, tone: "danger", needsReason: "Why must this journal be reversed? A second Firm Admin will approve the reversal." },
};

function JournalView({ journal: j, accountName, actions, onClose, onAction }: {
  journal: Journal; accountName: Map<string, string>; actions: JournalAction[];
  onClose: () => void; onAction: (a: JournalAction, reason?: string, date?: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState<JournalAction | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const t = lineTotals(j.lines);
  const go = async (a: JournalAction) => {
    if (ACTION_UI[a].needsReason && asking !== a) { setAsking(a); return; }
    setBusy(true); await onAction(a, reason.trim(), date); setBusy(false);
  };
  const btn = (a: JournalAction) => {
    const u = ACTION_UI[a];
    const cls = u.tone === "primary" ? "btn-primary bg-emerald-600" : u.tone === "danger" ? "btn-danger" : "btn-ghost";
    const disabled = busy || (asking === a && !reason.trim());
    return <button key={a} className={cls} disabled={disabled} onClick={() => void go(a)}>{u.icon}{u.label}</button>;
  };

  return (
    <Modal open wide onClose={onClose} title={`${j.journal_no ?? "Journal"} · ${SOURCE_LABEL[j.source]}`}
      footer={<><button className="btn-ghost me-auto" onClick={onClose}>Close</button>{actions.map(btn)}</>}>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <div><dt className="text-xs text-slate-500">Status</dt><dd><Badge tone={STATUS_TONE[j.status]} dot>{STATUS_LABEL[j.status]}</Badge></dd></div>
        <div><dt className="text-xs text-slate-500">Date</dt><dd>{shortDate(j.entry_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Prepared by</dt><dd>{j.preparer ?? "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Approved by</dt><dd>{j.approver ?? "—"}</dd></div>
      </dl>
      {j.memo && <p className="text-sm text-slate-700 mb-3">{j.memo}</p>}
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">Account</th><th className="th">Description</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th></tr></thead>
        <tbody>
          {j.lines.map((l) => <tr key={l.id}><td className="td">{accountName.get(l.account_id) ?? "—"}</td><td className="td text-slate-600">{l.description}</td>
            <td className="td text-end num">{l.debit ? fmt(l.debit) : ""}</td><td className="td text-end num">{l.credit ? fmt(l.credit) : ""}</td></tr>)}
          <tr className="font-semibold"><td className="td" colSpan={2}>Total</td><td className="td text-end num">{fmt(t.debit)}</td><td className="td text-end num">{fmt(t.credit)}</td></tr>
        </tbody>
      </table></div>
      {asking && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1.5">{ACTION_UI[asking].needsReason}</span>
            <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {asking === "request_reversal" && <label className="block mt-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Reversal date (its period must be open)</span>
            <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
          <p className="text-xs text-slate-500 mt-2">Then click “{ACTION_UI[asking].label}” again to confirm.</p>
        </div>
      )}
    </Modal>
  );
}
