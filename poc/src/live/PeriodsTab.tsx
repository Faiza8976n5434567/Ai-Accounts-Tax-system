/** Accounting periods (lock / reopen — Firm Admin, reason required to reopen) and tax deadlines (P1-14 · R3). */
import { useState } from "react";
import { CalendarRange, Landmark, Lock, LockOpen } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { shortDate } from "../lib/email";
import { friendlyDbError, lockPeriod, reopenPeriod } from "../lib/journals";
import type { AccountingPeriod, TaxPeriod } from "../lib/clients";
import { useToast } from "./toast";

const monthName = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function PeriodsTab({ periods, taxPeriods, perms, reload }: { periods: AccountingPeriod[]; taxPeriods: TaxPeriod[]; perms: string[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [acting, setActing] = useState<{ period: AccountingPeriod; action: "lock" | "reopen" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const confirm = async () => {
    if (!acting) return;
    setBusy(true);
    try {
      if (acting.action === "lock") await lockPeriod(acting.period.id, reason);
      else await reopenPeriod(acting.period.id, reason);
      toast(`${monthName(acting.period.start_date)} ${acting.action === "lock" ? "locked" : "reopened"}`);
      setActing(null); setReason(""); await reload();
    } catch (e) { toast(friendlyDbError(e), "err"); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Accounting periods" sub="A locked month rejects every posting. Only a Firm Admin can lock or reopen, and reopening needs a reason (audit-logged)." icon={<CalendarRange size={16} />} pad={false}>
        <div className="overflow-x-auto max-h-[65vh]"><table className="w-full">
          <thead className="sticky top-0"><tr><th className="th">Month</th><th className="th">Status</th><th className="th"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>{periods.map((p) => (
            <tr key={p.id}>
              <td className="td">{monthName(p.start_date)}</td>
              <td className="td">{p.status === "locked" ? <Badge tone="amber" dot>Locked</Badge> : <Badge tone="emerald" dot>Open</Badge>}
                {p.status === "open" && p.reopen_reason && <span className="ms-2 text-xs text-slate-500" title={p.reopen_reason}>reopened</span>}</td>
              <td className="td text-end">
                {p.status === "open" && perms.includes("lock_period") && <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => setActing({ period: p, action: "lock" })}><Lock size={13} />Lock</button>}
                {p.status === "locked" && perms.includes("reopen_period") && <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => setActing({ period: p, action: "reopen" })}><LockOpen size={13} />Reopen</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="Tax periods and deadlines" sub="From the VAT stagger and financial year; due dates come from the versioned tax rules" icon={<Landmark size={16} />} pad={false}>
        <div className="overflow-x-auto max-h-[65vh]"><table className="w-full">
          <thead className="sticky top-0"><tr><th className="th">Return</th><th className="th">Period</th><th className="th">Due</th></tr></thead>
          <tbody>{taxPeriods.map((t) => (
            <tr key={t.id} className={t.due_date < today ? "text-slate-400" : undefined}>
              <td className="td">{t.kind === "vat" ? "VAT 201" : "Corporate Tax"}</td>
              <td className="td">{shortDate(t.start_date)} – {shortDate(t.end_date)}</td>
              <td className="td font-medium">{shortDate(t.due_date)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Modal open={!!acting} onClose={() => { setActing(null); setReason(""); }} title={acting ? `${acting.action === "lock" ? "Lock" : "Reopen"} ${monthName(acting.period.start_date)}?` : ""}
        footer={<><button className="btn-ghost" onClick={() => { setActing(null); setReason(""); }}>Cancel</button>
          <button className="btn-primary bg-emerald-600" disabled={busy || (acting?.action === "reopen" && !reason.trim())} onClick={() => void confirm()}>{acting?.action === "lock" ? "Lock period" : "Reopen period"}</button></>}>
        <p className="text-sm text-slate-600 mb-3">{acting?.action === "lock" ? "No journal can be posted into this month while it is locked." : "Postings into this month will be possible again. The reason is kept in the audit trail."}</p>
        <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1.5">Reason{acting?.action === "lock" ? " (optional)" : ""}</span>
          <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </Modal>
    </div>
  );
}
