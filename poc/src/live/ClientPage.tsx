/** One client: overview, chart of accounts and periods — live from Supabase (P1-13). */
import { useEffect, useState } from "react";
import { BookOpen, CalendarRange, FileText, Landmark } from "lucide-react";
import { Badge, Card, PageHeader } from "../components/ui";
import { getClient, listAccountingPeriods, listAccounts, listTaxPeriods, MONTHS, nextVatDue, vatSummary, type Account, type AccountingPeriod, type Client, type TaxPeriod } from "../lib/clients";
import { shortDate } from "../lib/email";
import { fmt } from "../lib/money";
import type { ClientTab } from "./routes";

export function ClientPage({ clientId, tab }: { clientId: string; tab: ClientTab }) {
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [taxPeriods, setTaxPeriods] = useState<TaxPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([getClient(clientId), listAccounts(clientId), listAccountingPeriods(clientId), listTaxPeriods(clientId)])
      .then(([c, a, p, t]) => { if (live) { setClient(c); setAccounts(a); setPeriods(p); setTaxPeriods(t); } })
      .catch(() => { if (live) setError("Could not load this client. Check your connection and try again."); });
    return () => { live = false; };
  }, [clientId]);

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (client === undefined) return <p className="text-sm text-slate-500">Loading…</p>;
  if (client === null) return <p className="text-sm text-slate-600">This client doesn't exist or you don't have access to it.</p>;

  const today = new Date().toISOString().slice(0, 10);
  const vatDue = nextVatDue(taxPeriods, today);
  const titles: Record<ClientTab, string> = { overview: "Overview", accounts: "Chart of accounts", periods: "Periods" };

  return (
    <>
      <PageHeader eyebrow={client.legal_name} title={titles[tab]}
        sub={<span className="flex flex-wrap gap-1.5"><Badge>{client.emirate_code}</Badge><Badge tone={client.vat_registered ? "emerald" : "slate"}>{vatSummary(client)}</Badge>{client.trn && <Badge>TRN {client.trn}</Badge>}</span>} />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2 max-w-6xl">
          <Card title="Company" icon={<FileText size={16} />}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <Row k="Legal name" v={client.legal_name} />
              <Row k="Trade name" v={client.trade_name} />
              <Row k="Industry" v={client.industry} />
              <Row k="Trade licence" v={[client.licence_no, client.licence_authority].filter(Boolean).join(" · ") || null} />
              <Row k="Licence expiry" v={client.licence_expiry && shortDate(client.licence_expiry)} />
              <Row k="Financial year" v={`Starts in ${MONTHS[client.fy_start_month - 1]}`} />
              <Row k="Books start" v={periods[0] && shortDate(periods[0].start_date)} />
            </dl>
          </Card>
          <Card title="Tax" icon={<Landmark size={16} />}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <Row k="VAT" v={vatSummary(client)} />
              <Row k="First VAT period ends" v={client.vat_first_period_end && shortDate(client.vat_first_period_end)} />
              <Row k="Next VAT return due" v={vatDue && `${shortDate(vatDue.due_date)} (period ending ${shortDate(vatDue.end_date)})`} />
              <Row k="Corporate Tax" v={client.ct_regime === "sbr" ? "Small Business Relief elected" : client.ct_regime === "qfzp" ? "Qualifying Free Zone Person" : "Standard"} />
              <Row k="CT TRN" v={client.ct_trn} />
              <Row k="Prior-year revenue" v={fmt(client.prior_year_revenue, { aed: true })} />
            </dl>
          </Card>
          <Card title="Set up for this client" className="lg:col-span-2">
            <ul className="text-sm text-slate-700 grid sm:grid-cols-3 gap-3">
              <li className="rounded-xl bg-slate-50 p-3"><b>{accounts.length}</b> accounts in the chart</li>
              <li className="rounded-xl bg-slate-50 p-3"><b>{periods.length}</b> monthly periods ({periods[0] && shortDate(periods[0].start_date)} – {periods.at(-1) && shortDate(periods.at(-1)!.end_date)})</li>
              <li className="rounded-xl bg-slate-50 p-3"><b>{taxPeriods.filter((t) => t.kind === "vat").length}</b> VAT periods · <b>{taxPeriods.filter((t) => t.kind === "ct").length}</b> Corporate Tax years</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "accounts" && (
        <Card title="Chart of accounts" sub="Control accounts (receivables, payables, VAT, bank, customer credits) are posted only by their own documents, not by manual journals" icon={<BookOpen size={16} />} pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Code</th><th className="th">Name</th><th className="th">Type</th><th className="th">Group</th><th className="th">Corporate Tax</th><th className="th">Status</th></tr></thead>
            <tbody>{accounts.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/70">
                <td className="td font-mono">{a.code}</td>
                <td className="td">{a.name}{a.is_control && <Badge tone="indigo" className="ms-2">Control</Badge>}</td>
                <td className="td capitalize">{a.type}</td>
                <td className="td text-slate-600">{a.report_group}</td>
                <td className="td text-xs text-slate-600">{a.ct_tag?.replaceAll("_", " ").toLowerCase()}</td>
                <td className="td">{a.is_active ? <Badge tone="emerald" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {tab === "periods" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Accounting periods" sub="Locked periods reject postings; only a Firm Admin can lock or reopen (with a reason)" icon={<CalendarRange size={16} />} pad={false}>
            <div className="overflow-x-auto max-h-[60vh]"><table className="w-full">
              <thead className="sticky top-0"><tr><th className="th">Month</th><th className="th">Status</th></tr></thead>
              <tbody>{periods.map((p) => (
                <tr key={p.id}><td className="td">{new Date(p.start_date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                  <td className="td">{p.status === "locked" ? <Badge tone="amber" dot>Locked</Badge> : <Badge tone="emerald" dot>Open</Badge>}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
          <Card title="Tax periods and deadlines" sub="From the VAT stagger and financial year; due dates come from the versioned tax rules" icon={<Landmark size={16} />} pad={false}>
            <div className="overflow-x-auto max-h-[60vh]"><table className="w-full">
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
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined | false }) {
  return <><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v || <span className="text-slate-400">—</span>}</dd></>;
}
