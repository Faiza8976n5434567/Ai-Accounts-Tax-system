import { Sparkles, ShieldCheck, Users, Activity } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { Badge, DataTable, Empty, KpiGrid, PageHeader, Stat } from "../components/ui";

export function Audit() {
  const { state } = useStore();
  const { t, orgName } = useI18n();
  const sid = state.session.orgId;
  const rows = state.audit.filter((a) => sid === "FIRM" || a.orgId === sid);
  const name = (id: string) => { const o = state.orgs.find((x) => x.id === id); return o ? orgName(o) : t("Firm"); };
  return (
    <>
      <PageHeader eyebrow={t("Insights")} title={t("Audit trail")} sub={t("Append-only log: who, what, when, AI involvement — feeds the FTA Audit File and statutory audit.")} />
      <KpiGrid>
        <Stat label={t("Events")} value={String(rows.length)} icon={<Activity size={16} />} tone="sky" hint={t("This session")} />
        <Stat label={t("AI events")} value={String(rows.filter((r) => r.ai).length)} icon={<Sparkles size={16} />} tone="violet" />
        <Stat label={t("Users")} value={String(new Set(rows.map((r) => r.user)).size)} icon={<Users size={16} />} tone="emerald" />
        <Stat label={t("Integrity")} value={t("Append-only")} icon={<ShieldCheck size={16} />} tone="indigo" hint={t("No edits or deletes")} />
      </KpiGrid>
      <DataTable rows={rows} rowKey={(a) => a.id} search={(a) => `${a.user} ${a.action} ${a.detail}`} pageSize={15}
        empty={<Empty icon={<ShieldCheck size={22} />}>{t("No activity yet in this session — capture an invoice or switch roles.")}</Empty>}
        filters={[
          { key: "u", label: t("User"), options: [...new Set(rows.map((r) => r.user))].map((u) => ({ value: u, label: u })), get: (a) => a.user },
          { key: "ai", label: t("AI"), options: [{ value: "y", label: t("AI events") }, { value: "n", label: t("Human") }], get: (a) => (a.ai ? "y" : "n") },
        ]}
        cols={[
          { key: "ts", header: t("Time"), sort: (a) => a.ts, cell: (a) => <span className="num text-xs whitespace-nowrap text-slate-600">{a.ts.slice(0, 19).replace("T", " ")}</span> },
          { key: "u", header: t("User"), sort: (a) => a.user, cell: (a) => <div className="whitespace-nowrap"><div className="text-sm">{a.user}</div><div className="text-[11px] text-slate-400">{t(a.role)}</div></div> },
          { key: "c", header: t("Client"), hide: "md", cell: (a) => <span className="text-sm">{name(a.orgId)}</span> },
          { key: "a", header: t("Action"), sort: (a) => a.action, cell: (a) => <Badge tone={a.ai ? "violet" : "slate"}>{a.ai && <Sparkles size={10} />}{t(a.action)}</Badge> },
          { key: "d", header: t("Detail"), hide: "sm", cell: (a) => <span className="text-sm text-slate-600 block max-w-xl">{a.detail}</span> },
        ]} />
    </>
  );
}
