import { useState } from "react";
import { Send, Sparkles, Database, ShieldCheck } from "lucide-react";
import { useI18n } from "../lib/useI18n";
import { useOrgData } from "../lib/derive";
import { ask, type Answer } from "../lib/ai";
import { Card, PageHeader, cx } from "../components/ui";
import type { Org } from "../lib/types";

const SUGGEST = ["Why did profit decrease this month?", "Which customers are over 30 days?", "Show all fuel expenses claimed", "What is my VAT position?", "Revenue by month", "Top expenses this month", "Show entertainment expenses"];
export function Ask({ org }: { org: Org }) {
  const { t, acc, mon, orgName } = useI18n();
  const d = useOrgData(org)!;
  const [q, setQ] = useState("");
  const [chat, setChat] = useState<{ q: string; a: Answer | null }[]>([]);
  const go = (text: string) => {
    if (!text.trim()) return;
    const a = ask(text, { journals: d.ytd, monthly: d.mon, ageing: d.ageing, vatNet: d.vat.box14 }, t, acc, mon);
    setChat((c) => [...c, { q: text, a: null }]); setQ("");
    setTimeout(() => { setChat((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, a } : m))); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }, 700);
  };
  const chips = <div className="flex flex-wrap gap-1.5 justify-center">{SUGGEST.map((s) => <button key={s} className="btn-ghost !text-xs !py-1 !rounded-full" onClick={() => go(t(s))}>{t(s)}</button>)}</div>;
  return (
    <>
      <PageHeader eyebrow={t("Workspace")} title={t("Ask your books")} sub={t("Natural-language questions answered from this tenant's posted ledger only — the query is always shown.")} />
      <div className="max-w-3xl mx-auto">
        <div className="space-y-4 mb-4" aria-live="polite">
          {chat.length === 0 && <Card><div className="text-center py-6"><div className="mx-auto size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white shadow-lg shadow-violet-200 float"><Sparkles size={26} /></div><div className="mt-3 font-medium">{t("Ask anything about {org}'s numbers", { org: orgName(org) })}</div><p className="text-xs text-slate-500 mt-1 mb-4 flex items-center justify-center gap-1"><ShieldCheck size={13} />{t("Read-only · tenant-scoped · every answer shows its query")}</p>{chips}</div></Card>}
          {chat.map((m, i) => (
            <div key={i} className="space-y-2 fade-in">
              <div className="flex justify-end"><div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-2xl rounded-ee-sm px-4 py-2 text-sm max-w-md shadow-md shadow-emerald-200">{m.q}</div></div>
              {!m.a ? <div className="card p-4 inline-flex items-center gap-1.5"><span className="size-7 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white me-1"><Sparkles size={14} /></span>{[0, 1, 2].map((k) => <span key={k} className="size-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: `${k * 0.12}s` }} />)}<span className="text-xs text-slate-400 ms-2">{t("Querying ledger…")}</span></div> :
              <div className="card p-4 page-enter">
                <div className="flex gap-3 items-start"><span className="size-7 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white shadow-sm"><Sparkles size={14} /></span><p className="text-sm text-slate-800 pt-1 leading-relaxed">{m.a.text}</p></div>
                {m.a.rows && m.a.rows.length > 0 && <div className="mt-3 rounded-xl ring-1 ring-slate-100 overflow-hidden"><table className="w-full"><tbody>{m.a.rows.map((r, j) => <tr key={j} className="hover:bg-slate-50/70"><td className="py-2 px-3 text-sm text-slate-600 border-b border-slate-100">{r.label}</td><td dir="ltr" className={cx("py-2 px-3 text-sm text-end num font-medium border-b border-slate-100", r.tone === "bad" ? "text-rose-600" : r.tone === "good" ? "text-emerald-700" : "")}>{r.value}</td></tr>)}</tbody></table></div>}
                <div dir="ltr" className="mt-3 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 font-mono"><Database size={12} className="shrink-0 mt-0.5" />{m.a.query}</div>
              </div>}
            </div>
          ))}
        </div>
        <form className="card p-2 flex gap-2 sticky bottom-4 shadow-xl ring-1 ring-emerald-100 focus-within:ring-emerald-300 transition" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <input aria-label={t("Ask a question")} className="input !border-0 !ring-0 !shadow-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("e.g. Why did profit decrease this month?")} />
          <button className="btn-primary" aria-label={t("Send")} disabled={!q.trim()}><Send size={15} className="rtl:-scale-x-100" /></button>
        </form>
        {chat.length > 0 && <div className="mt-3">{chips}</div>}
      </div>
    </>
  );
}
