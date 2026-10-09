/** Integrity page (P2-08 · S-5.4): the latest nightly check of every client, with details and "Run now". */
import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, Play, ShieldCheck, XCircle } from "lucide-react";
import { Badge, Card } from "../components/ui";
import type { Client } from "../lib/clients";
import { friendlyDbError } from "../lib/journals";
import { latestRuns, runChecksNow, runHistory, runResults, runSummary, type IntegrityRun } from "../lib/integrity";
import { useLoad } from "./hooks";
import { useToast } from "./toast";

const TONE: Record<string, "emerald" | "amber" | "rose"> = { ok: "emerald", warning: "amber", error: "rose" };
const when = (ts: string) => new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function IntegrityPage({ clients }: { clients: Client[] }) {
  const toast = useToast();
  const { data: latest, reload } = useLoad(latestRuns);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byOrg = new Map((latest ?? []).map((r) => [r.organization_id, r]));
  const run = async (orgId: string) => {
    setBusy(orgId);
    try { await runChecksNow(orgId); toast("Checks finished"); reload(); setOpenId(orgId); } catch (e) { toast(friendlyDbError(e), "err"); } finally { setBusy(null); }
  };
  const sorted = [...clients].sort((a, b) => {
    const rank = (c: Client) => ({ error: 0, warning: 1, ok: 3 } as Record<string, number>)[byOrg.get(c.id)?.status ?? ""] ?? 2;
    return rank(a) - rank(b) || a.legal_name.localeCompare(b.legal_name);
  });
  return (
    <>
      <Card title="Integrity checks" icon={<ShieldCheck size={16} />} pad={false}
        sub="Every night at 02:00 (UAE) each client's books are re-checked: the trial balance balances, customers/suppliers/credits agree with their control accounts, every document matches its journal, numbers have no gaps, and bank accounts are kept up to date. Results are a permanent record.">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">Client</th><th className="th">Result</th><th className="th">Last checked</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!latest && <tr><td className="td text-slate-500" colSpan={4}>Loading…</td></tr>}
            {sorted.map((c) => {
              const r = byOrg.get(c.id);
              return (
                <tr key={c.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  <td className="td font-medium">{c.legal_name}</td>
                  <td className="td">{r ? <Badge tone={TONE[r.status!]} dot>{runSummary(r as IntegrityRun)}</Badge> : <Badge>Not checked yet</Badge>}</td>
                  <td className="td text-sm text-slate-600">{r?.started_at ? `${when(r.started_at)} · ${r.trigger === "nightly" ? "nightly" : "run by hand"}` : "—"}</td>
                  <td className="td text-end"><button className="btn-ghost !py-1 !px-2 text-xs" disabled={busy !== null} onClick={(e) => { e.stopPropagation(); void run(c.id); }}>
                    <Play size={13} />{busy === c.id ? "Checking…" : "Run now"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>
      {openId && <ClientDetail key={openId + (byOrg.get(openId)?.id ?? "")} client={clients.find((c) => c.id === openId)!} />}
    </>
  );
}

function ClientDetail({ client }: { client: Client }) {
  const fetchHistory = useCallback(() => runHistory(client.id), [client.id]);
  const { data: history } = useLoad(fetchHistory);
  const [runId, setRunId] = useState<string | null>(null);
  const shown = runId ?? history?.[0]?.id ?? null;
  const fetchResults = useCallback(() => (shown ? runResults(shown) : Promise.resolve([])), [shown]);
  const { data: results } = useLoad(fetchResults);
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={`${client.legal_name} — checks`}>
        {!history ? <p className="text-sm text-slate-500">Loading…</p> : history.length === 0 ? <p className="text-sm text-slate-500">Not checked yet — use “Run now”.</p> : (
          <ul className="space-y-2">{(results ?? []).map((r) => (
            <li key={r.id} className="flex gap-2 text-sm">
              {r.status === "ok" ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> : r.status === "warning" ? <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />}
              <span><span className={r.status === "ok" ? "text-slate-700" : "font-medium text-slate-900"}>{r.label}</span>{r.detail && <span className="block text-xs text-slate-600">{r.detail}</span>}</span>
            </li>
          ))}</ul>
        )}
        <p className="mt-4 text-xs text-slate-500">A problem (red) means data no longer agrees and must be investigated — tell the platform team. A warning (amber) is housekeeping, e.g. a bank account not yet reconciled.</p>
      </Card>
      <Card title="Recent runs">
        <ul className="space-y-1 text-sm">{(history ?? []).map((h) => (
          <li key={h.id}><button className={`w-full text-start rounded-lg px-2 py-1 cursor-pointer ${h.id === shown ? "bg-slate-100" : "hover:bg-slate-50"}`} onClick={() => setRunId(h.id)}>
            <Badge tone={TONE[h.status]} dot>{runSummary(h)}</Badge><span className="block text-xs text-slate-500 mt-0.5">{when(h.started_at)} · {h.trigger === "nightly" ? "nightly" : "by hand"}</span></button></li>
        ))}</ul>
      </Card>
    </div>
  );
}
