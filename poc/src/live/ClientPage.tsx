/** One client — live from Supabase: overview, journals, approvals, chart of accounts, periods (P1-13/P1-14). */
import { useCallback, useState } from "react";
import { FileText, Landmark, Pencil } from "lucide-react";
import { Badge, Card, PageHeader } from "../components/ui";
import { getClient, listAccountingPeriods, listAccounts, listTaxPeriods, MONTHS, nextVatDue, vatSummary, type Account, type AccountingPeriod, type Client, type TaxPeriod } from "../lib/clients";
import { myPermissions } from "../lib/journals";
import { shortDate } from "../lib/email";
import { fmt } from "../lib/money";
import type { ClientTab } from "./routes";
import { JournalsTab } from "./JournalsTab";
import { AccountsTab } from "./AccountsTab";
import { PeriodsTab } from "./PeriodsTab";
import { ReportsTab } from "./ReportsTab";
import { ContactsTab } from "./ContactsTab";
import { SalesTab } from "./SalesTab";
import { BillsTab } from "./BillsTab";
import { PaymentsTab } from "./PaymentsTab";
import { ClientDetailsForm } from "./ClientDetailsForm";
import { useLoad, useToday } from "./hooks";

const TITLES: Record<ClientTab, string> = { overview: "Overview", contacts: "Customers & suppliers", sales: "Sales invoices", bills: "Purchase bills", payments: "Receipts & payments", journals: "Journals", approvals: "Approvals", reports: "Trial balance & ledger", accounts: "Chart of accounts", periods: "Periods" };

export function ClientPage({ clientId, tab }: { clientId: string; tab: ClientTab }) {
  const fetchAll = useCallback(() => Promise.all([getClient(clientId), listAccounts(clientId), listAccountingPeriods(clientId), listTaxPeriods(clientId), myPermissions(clientId)]), [clientId]);
  const { data, error, reload } = useLoad(fetchAll);
  const today = useToday();
  const load = async () => reload();
  const [editingDetails, setEditingDetails] = useState(false);

  if (error) return <p role="alert" className="text-sm text-rose-700">Could not load this client. Check your connection and try again.</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const [client, accounts, periods, taxPeriods, perms]: [Client | null, Account[], AccountingPeriod[], TaxPeriod[], string[]] = data;
  if (client === null) return <p className="text-sm text-slate-600">This client doesn't exist or you don't have access to it.</p>;

  const vatDue = nextVatDue(taxPeriods, today);
  const booksStart = periods[0]?.start_date ?? today;

  return (
    <>
      <PageHeader eyebrow={client.legal_name} title={TITLES[tab]}
        sub={<span className="flex flex-wrap gap-1.5"><Badge>{client.emirate_code}</Badge><Badge tone={client.vat_registered ? "emerald" : "slate"}>{vatSummary(client)}</Badge>{client.trn && <Badge>TRN {client.trn}</Badge>}</span>} />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2 max-w-6xl">
          <Card title="Company" icon={<FileText size={16} />} actions={perms.includes("manage_client") && <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => setEditingDetails(true)}><Pencil size={13} />Edit details</button>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <Row k="Legal name" v={client.legal_name} />
              <Row k="Trade name" v={client.trade_name} />
              <Row k="Industry" v={client.industry} />
              <Row k="Address" v={client.address} />
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
      {editingDetails && <ClientDetailsForm client={client} onClose={() => setEditingDetails(false)} onSaved={() => { setEditingDetails(false); reload(); }} />}
      {tab === "contacts" && <ContactsTab orgId={clientId} accounts={accounts} canEdit={perms.includes("prepare")} />}
      {tab === "sales" && <SalesTab client={client} accounts={accounts} taxPeriods={taxPeriods} perms={perms} />}
      {tab === "bills" && <BillsTab client={client} accounts={accounts} perms={perms} />}
      {tab === "payments" && <PaymentsTab client={client} accounts={accounts} perms={perms} />}
      {(tab === "journals" || tab === "approvals") && <JournalsTab key={tab} orgId={clientId} accounts={accounts} perms={perms} booksStart={booksStart} approvalsOnly={tab === "approvals"} />}
      {tab === "reports" && <ReportsTab orgId={clientId} accounts={accounts} fyStartMonth={client.fy_start_month} />}
      {tab === "accounts" && <AccountsTab orgId={clientId} accounts={accounts} canManage={perms.includes("manage_coa")} reload={load} />}
      {tab === "periods" && <PeriodsTab periods={periods} taxPeriods={taxPeriods} perms={perms} reload={load} />}
    </>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined | false }) {
  return <><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v || <span className="text-slate-400">—</span>}</dd></>;
}
