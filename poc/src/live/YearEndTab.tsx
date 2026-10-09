/** Year-end close for one client (P5-05 · D-75 → D-77): the checklist, the closing journal to retained earnings,
 *  approval by another Firm Admin (posts it and locks the year). */
import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, Lock, Undo2 } from "lucide-react";
import { Badge, Card } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { fmt } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import type { AccountingPeriod, Client } from "../lib/clients";
import { cancelYearClose, closeYear, completeYearClose, fyEnds, resultLabel, yearEndStatus, type YearEndStatus } from "../lib/year-end";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function YearEndTab({ client, periods, perms, onChanged }: { client: Client; periods: AccountingPeriod[]; perms: string[]; onChanged: () => void }) {
  const today = useToday();
  const ends = fyEnds(periods, client.fy_start_month);
  const [fyEnd, setFyEnd] = useState<string | null>(null);
  const chosen = fyEnd ?? ends.find((e) => e < today) ?? ends[0];   // the latest ended year
  if (!chosen) return <Card title="Year-end close"><p className="text-sm text-slate-600">This client has no complete financial year of periods yet.</p></Card>;
  return <YearView key={chosen} client={client} ends={ends} fyEnd={chosen} perms={perms} onPick={setFyEnd} onChanged={onChanged} />;
}

function YearView({ client, ends, fyEnd, perms, onPick, onChanged }: { client: Client; ends: string[]; fyEnd: string; perms: string[]; onPick: (e: string) => void; onChanged: () => void }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetch = useCallback(() => yearEndStatus(client.id, fyEnd), [client.id, fyEnd]);
  const { data: s, error, reload } = useLoad<YearEndStatus>(fetch);
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); reload(); onChanged(); } catch (e) { toast(friendlyDbError(e), "err"); } };
  const pending = s?.closes.find((c) => c.status === "draft" || c.status === "pending");
  const posted = s?.closes.filter((c) => c.status === "posted") ?? [];
  const canPrepare = perms.includes("prepare"), canApprove = perms.includes("lock_period");
  const res = s ? resultLabel(s.net_result) : null;

  return (
    <>
      <Card title="Year-end close" icon={<Lock size={16} />} pad={false}
        sub="Check the year, then close it: a closing journal moves the year's income and expenses to Retained earnings, and its approval locks every month of the year. Reports keep showing the year's profit and loss."
        actions={<label><span className="block text-xs font-medium text-slate-600 mb-1">Financial year ending</span>
          <select aria-label="Financial year" className={cls} value={fyEnd} onChange={(e) => onPick(e.target.value)}>
            {ends.map((e) => <option key={e} value={e}>{shortDate(e)}</option>)}</select></label>}>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load the year-end status.</p>}
        {!s && !error && <p className="px-5 pb-4 text-sm text-slate-500">Checking…</p>}
        {s && <div className="px-5 pb-4">
          <div className="text-sm text-slate-700 mb-3">{shortDate(s.fy_start)} – {shortDate(s.fy_end)} · {s.periods.locked} of {s.periods.total} months locked
            {posted.length > 0 && <Badge tone="emerald" className="ms-2">Closed{posted.length > 1 ? ` (${posted.length} closing journals)` : ""}</Badge>}
            {!s.ended && <Badge tone="sky" className="ms-2">Year still running</Badge>}</div>
          <ul className="space-y-2">
            {s.checks.map((c) => (
              <li key={c.code} className="flex items-start gap-2 text-sm">
                {c.ok ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" /> : c.blocking ? <CircleX size={17} className="text-rose-600 shrink-0 mt-0.5" /> : <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />}
                <div><span className={c.ok ? "text-slate-700" : c.blocking ? "text-rose-800 font-medium" : "text-amber-800"}>{c.label}</span>
                  {!c.ok && <span className="ms-2 text-xs text-slate-500">{c.blocking ? "must be fixed" : "check before closing"}</span>}
                  {c.detail && <div className="text-xs text-slate-600">{c.detail}</div>}</div>
              </li>
            ))}
          </ul>
        </div>}
      </Card>

      {s && (s.to_close.length > 0 || pending) && (
        <Card title={pending ? "Closing journal waiting for approval" : "Closing journal (preview)"} className="mt-4" pad={false}
          sub={`Dated ${shortDate(s.fy_end)}: each income and expense account to nil; the result to 3200 Retained earnings.`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Account</th><th className="th text-end">Debit</th><th className="th text-end">Credit</th></tr></thead>
            <tbody>
              {s.to_close.map((l) => <tr key={l.account_id}><td className="td text-sm"><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
                <td className="td text-end num">{l.dc < 0 ? fmt(-l.dc) : ""}</td><td className="td text-end num">{l.dc > 0 ? fmt(l.dc) : ""}</td></tr>)}
              {res && s.net_result !== 0 && <tr className="font-semibold bg-slate-50"><td className="td text-sm">3200 Retained earnings — {res.label.toLowerCase()}</td>
                <td className="td text-end num">{s.net_result < 0 ? fmt(res.amount) : ""}</td><td className="td text-end num">{s.net_result > 0 ? fmt(res.amount) : ""}</td></tr>}
            </tbody>
          </table></div>
          {posted.length > 0 && s.to_close.length > 0 && !pending && <p className="px-5 pt-2 text-sm text-amber-800">The year was closed before and has changed since (reopened). Closing again posts only this difference.</p>}
          <div className="px-5 py-3 flex flex-wrap items-center gap-2">
            {!pending && canPrepare && <button className="btn-primary bg-emerald-600" disabled={!s.ready || !s.ended}
              title={!s.ended ? "The year has not ended yet" : !s.ready ? "Fix the items marked in red first" : undefined}
              onClick={() => void act(() => closeYear(client.id, s.fy_end), "Closing journal prepared — another Firm Admin approves it")}><Lock size={15} />Prepare closing journal</button>}
            {pending && canApprove && pending.prepared_by !== auth.userId && <button className="btn-primary bg-emerald-600"
              onClick={() => void act(() => completeYearClose(pending.id), "Year closed — the closing journal is posted and the year is locked")}><CheckCircle2 size={15} />Approve, post and lock the year</button>}
            {pending && pending.prepared_by === auth.userId && <span className="text-xs text-slate-500">You prepared this closing journal, so another Firm Admin must approve it.</span>}
            {pending && canPrepare && <button className="btn-ghost" onClick={() => void act(() => cancelYearClose(pending.id), "Closing journal cancelled")}><Undo2 size={15} />Cancel</button>}
          </div>
        </Card>
      )}
      {s && s.to_close.length === 0 && posted.length > 0 && <p className="mt-4 text-sm text-emerald-700">The year is closed: every income and expense account is nil after the closing journal{posted.length > 1 ? "s" : ""} ({posted.map((c) => c.journal_no).join(", ")}).</p>}
    </>
  );
}
