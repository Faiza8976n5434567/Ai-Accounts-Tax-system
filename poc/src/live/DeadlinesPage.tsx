/** Compliance calendar (P3-05 · F-20 · CFG-07 · D-50, D-51): every deadline of every client the user may see —
 *  VAT and Corporate Tax returns, licence renewals, e-invoicing — from the rules in the database. */
import { useCallback, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Badge, Card } from "../components/ui";
import { shortDate } from "../lib/email";
import { daysUntil, deadlines, groupByMonth, STATUS } from "../lib/deadlines";
import { addDays } from "../lib/clientUsers";
import type { ClientTab } from "./routes";
import { useLoad, useToday } from "./hooks";

export function DeadlinesPage({ openClient }: { openClient: (id: string, tab: ClientTab) => void }) {
  const today = useToday();
  const [months, setMonths] = useState(3);
  const [client, setClient] = useState("");
  const fetch = useCallback(() => deadlines(today, addDays(today, months * 31)), [today, months]);
  const { data, error } = useLoad(fetch);
  const clients = [...new Map((data ?? []).map((x) => [x.organization_id, x.legal_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = (data ?? []).filter((x) => !client || x.organization_id === client);
  return (
    <Card title="Deadlines" icon={<CalendarClock size={16} />} pad={false}
      sub="VAT and Corporate Tax returns, trade licence renewals and e-invoicing dates for every client, from the tax rules. Reminders are emailed 14, 7 and 1 days before (firm setting) once email is switched on."
      actions={<div className="flex flex-wrap gap-2">
        <select aria-label="Client" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">All clients</option>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Period" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={1}>Next month</option><option value={3}>Next 3 months</option><option value={12}>Next 12 months</option></select>
      </div>}>
      {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">The deadlines could not be loaded.</p>}
      {!data && <p className="px-5 pb-5 text-sm text-slate-500">Loading…</p>}
      {data && shown.length === 0 && <p className="px-5 pb-5 text-sm text-slate-500">No deadlines in this period.</p>}
      {groupByMonth(shown, today).map((g) => (
        <div key={g.label}>
          <h3 className={`px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide ${g.label === "Overdue" ? "text-rose-700" : "text-slate-500"}`}>{g.label}</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><tbody>
            {g.items.map((x, i) => {
              const days = daysUntil(x.due_date, today);
              return (
                <tr key={i} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => openClient(x.organization_id, x.tab as ClientTab)}>
                  <td className="td w-32 whitespace-nowrap">{shortDate(x.due_date)}</td>
                  <td className="td font-medium">{x.legal_name}</td>
                  <td className="td text-sm">{x.title}{x.period_start && x.period_end && <span className="block text-xs text-slate-500">Period {shortDate(x.period_start)} – {shortDate(x.period_end)}</span>}
                    {x.detail && <span className="block text-xs text-slate-500">{x.detail}</span>}</td>
                  <td className="td"><Badge tone={STATUS[x.status]?.[1] ?? "slate"} dot>{STATUS[x.status]?.[0] ?? x.status}</Badge></td>
                  <td className="td text-end text-sm whitespace-nowrap">{x.status === "done" ? "" : days < 0 ? <span className="text-rose-700">{-days} days late</span> : days === 0 ? "Today" : `in ${days} days`}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        </div>
      ))}
    </Card>
  );
}
