/** One client — live from Supabase: overview, journals, approvals, chart of accounts, periods (P1-13/P1-14). */
import { useCallback, useEffect, useState } from "react";
import { FileText, Landmark } from "lucide-react";
import { Badge, Card, PageHeader } from "../components/ui";
import { getClient, listAccountingPeriods, listAccounts, listTaxPeriods, MONTHS, nextVatDue, vatSummary, type Account, type AccountingPeriod, type Client, type TaxPeriod } from "../lib/clients";
import { myPermissions } from "../lib/journals";
import { shortDate } from "../lib/email";
import { fmt } from "../lib/money";
import type { ClientTab } from "./routes";
import { JournalsTab } from "./JournalsTab";
import { AccountsTab } from "./AccountsTab";
import { PeriodsTab } from "./PeriodsTab";

const TITLES: Record<ClientTab, string> = { overview: "Overview", journals: "Journals", approvals: "Approvals", accounts: "Chart of accounts", periods: "Periods" };

export function ClientPage({ clientId, tab }: { clientId: string; tab: ClientTab }) {
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [taxPeriods, setTaxPeriods] = useState<TaxPeriod[]>([]);
  const [perms, setPerms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, a, p, t, m] = await Promise.all([getClient(clientId), listAccounts(clientId), listAccountingPeriods(clientId), listTaxPeriods(clientId), myPermissions(clientId)]);
      setClient(c); setAccounts(a); setPeriods(p); setTaxPeriods(t); setPerms(m); setError(null);
    } catch { setError("Could not load this client. Check your connection and try again."); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (client === undefined) return <p className="text-sm text-slate-500">Loading…</p>;
  if (client === null) return <p className="text-sm text-slate-600">This client doesn't exist or you don't have access to it.</p>;

  const today = new Date().toISOString().slice(0, 10);
  const vatDue = nextVatDue(taxPeriods, today);
  const booksStart = periods[0]?.start_date ?? today;

  return (
    <>
      <PageHeader eyebrow={client.legal_name} title={TITLES[tab]}
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
      {(tab === "journals" || tab === "approvals") && <JournalsTab key={tab} orgId={clientId} accounts={accounts} perms={perms} booksStart={booksStart} approvalsOnly={tab === "approvals"} />}
      {tab === "accounts" && <AccountsTab orgId={clientId} accounts={accounts} canManage={perms.includes("manage_coa")} reload={load} />}
      {tab === "periods" && <PeriodsTab periods={periods} taxPeriods={taxPeriods} perms={perms} reload={load} />}
    </>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined | false }) {
  return <><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v || <span className="text-slate-400">—</span>}</dd></>;
}
