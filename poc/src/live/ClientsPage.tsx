/** Clients (P1-13) and the Add client form (P1-12 · Spec 03 §3.1). */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Plus } from "lucide-react";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { createClient, listEmirates, MONTHS, myFirmRole, updateClient, vatSummary, type Client, type Emirate, type NewClient } from "../lib/clients";
import { loadTeam, type StaffMember } from "../lib/team";
import { parseAedToFils } from "../lib/money";
import { useToast } from "./toast";

export function ClientsPage({ clients, reload, open }: { clients: Client[]; reload: () => Promise<void>; open: (id: string) => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { void myFirmRole().then(setRole).catch(() => setRole(null)); }, []);

  return (
    <>
      <PageHeader eyebrow="Firm" title="Clients" sub="Client companies whose books this firm keeps"
        actions={role === "firm_admin" && <button className="btn-primary bg-emerald-600" onClick={() => setAdding(true)}><Plus size={15} />Add client</button>} />
      {clients.length === 0 ? (
        <Card><div className="text-center py-10">
          <Building2 size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-600">No clients yet.</p>
          {role === "firm_admin" ? <button className="btn-primary bg-emerald-600 mt-4" onClick={() => setAdding(true)}><Plus size={15} />Add your first client</button>
            : <p className="text-xs text-slate-500 mt-1">A Firm Admin adds clients and assigns you to them.</p>}
        </div></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <button key={c.id} onClick={() => open(c.id)} className="card card-hover text-start p-5 cursor-pointer">
              <div className="font-semibold text-slate-900">{c.legal_name}</div>
              {c.trade_name && <div className="text-xs text-slate-500">{c.trade_name}</div>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{c.emirate_code}</Badge>
                <Badge tone={c.vat_registered ? "emerald" : "slate"}>{vatSummary(c)}</Badge>
                <Badge tone="indigo">{c.ct_regime === "sbr" ? "SBR" : c.ct_regime === "qfzp" ? "QFZP" : "Standard CT"}</Badge>
                {c.status !== "active" && <Badge tone="amber">{c.status}</Badge>}
              </div>
              {c.trn && <div className="mt-3 text-xs text-slate-500 font-mono">TRN {c.trn}</div>}
            </button>
          ))}
        </div>
      )}
      {adding && <AddClientModal onClose={() => setAdding(false)} onCreated={async (id) => { setAdding(false); await reload(); open(id); }} />}
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function AddClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const toast = useToast();
  const [emirates, setEmirates] = useState<Emirate[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [f, setF] = useState({
    legalName: "", tradeName: "", address: "", emirateCode: "AUH", industry: "", trn: "", ctTrn: "", licenceNo: "", licenceAuthority: "", licenceExpiry: "",
    fyStartMonth: 1, booksStart: `${today().slice(0, 4)}-01-01`,
    vatRegistered: false, vatPeriod: "quarterly" as NewClient["vatPeriod"], vatFirstPeriodEnd: "",
    ctRegime: "standard" as NewClient["ctRegime"], priorYearRevenue: "0", accountantIds: [] as string[], managerId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void listEmirates().then(setEmirates).catch(() => {});
    void loadTeam().then((t) => setStaff(t.staff.filter((s) => s.active && s.status === "active"))).catch(() => {});
  }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    const revenue = parseAedToFils(f.priorYearRevenue || "0");
    if (revenue === null || revenue < 0) { setError("Prior-year revenue must be an amount in AED, e.g. 2,500,000 or 2500000.00"); return; }
    if (f.trn && !/^1\d{14}$/.test(f.trn.trim())) { setError("A TRN is 15 digits starting with 1."); return; }
    setBusy(true);
    try {
      const id = await createClient({ ...f, priorYearRevenueFils: revenue });
      if (f.address.trim()) await updateClient(id, { address: f.address.trim() });
      toast(`${f.legalName.trim()} added — chart of accounts, periods and tax deadlines created`);
      await onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? "The client could not be added.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add client" wide
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" type="submit" form="add-client" disabled={busy || !f.legalName.trim() || !f.booksStart}><Plus size={15} />{busy ? "Adding…" : "Add client"}</button></>}>
      <form id="add-client" onSubmit={submit} noValidate className="space-y-5">
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <Section title="Company">
          <Text label="Legal name (as on the trade licence)" value={f.legalName} onChange={(v) => set("legalName", v)} wide />
          <Text label="Trade name (optional)" value={f.tradeName} onChange={(v) => set("tradeName", v)} />
          <Text label="Address (printed on tax invoices)" value={f.address} onChange={(v) => set("address", v)} wide />
          <Select label="Head office emirate (default on invoices)" value={f.emirateCode} onChange={(v) => set("emirateCode", v)}
            options={emirates.map((e) => [e.code, e.name])} />
          <Text label="Industry" value={f.industry} onChange={(v) => set("industry", v)} />
          <Text label="Trade licence number" value={f.licenceNo} onChange={(v) => set("licenceNo", v)} />
          <Text label="Licensing authority" value={f.licenceAuthority} onChange={(v) => set("licenceAuthority", v)} />
          <Text label="Licence expiry" type="date" value={f.licenceExpiry} onChange={(v) => set("licenceExpiry", v)} />
        </Section>
        <Section title="Financial year and books">
          <Select label="Financial year starts in" value={String(f.fyStartMonth)} onChange={(v) => set("fyStartMonth", Number(v))}
            options={MONTHS.map((m, i) => [String(i + 1), m])} />
          <Text label="Books start on (first period in this system)" type="date" value={f.booksStart} onChange={(v) => set("booksStart", v)} />
        </Section>
        <Section title="VAT">
          <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} />Registered for VAT</label>
          {f.vatRegistered && <>
            <Text label="VAT TRN (15 digits)" value={f.trn} onChange={(v) => set("trn", v)} />
            <Select label="VAT return period" value={f.vatPeriod} onChange={(v) => set("vatPeriod", v as NewClient["vatPeriod"])}
              options={[["quarterly", "Quarterly"], ["monthly", "Monthly"]]} />
            <Text label="First VAT period ends on (from the registration certificate)" type="date" value={f.vatFirstPeriodEnd} onChange={(v) => set("vatFirstPeriodEnd", v)} wide />
          </>}
        </Section>
        <Section title="Corporate Tax">
          <Text label="Corporate Tax TRN (if different)" value={f.ctTrn} onChange={(v) => set("ctTrn", v)} />
          <Select label="Regime" value={f.ctRegime} onChange={(v) => set("ctRegime", v as NewClient["ctRegime"])}
            options={[["standard", "Standard"], ["sbr", "Small Business Relief elected"], ["qfzp", "Qualifying Free Zone Person"]]} />
          <Text label="Prior-year revenue (AED, for the SBR test)" inputMode="decimal" value={f.priorYearRevenue} onChange={(v) => set("priorYearRevenue", v)} />
        </Section>
        <Section title="Team">
          <Select label="Manager (responsible staff member)" value={f.managerId} onChange={(v) => set("managerId", v)}
            options={[["", "— none —"], ...staff.map((s) => [s.userId, s.fullName] as [string, string])]} />
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-slate-600 mb-1.5">Firm Accountants who prepare this client's books</div>
            {staff.filter((s) => s.role === "firm_accountant").length === 0
              ? <p className="text-xs text-slate-500">No Firm Accountants yet — invite them under Users & invites and assign them later.</p>
              : staff.filter((s) => s.role === "firm_accountant").map((s) => (
                <label key={s.userId} className="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" checked={f.accountantIds.includes(s.userId)}
                  onChange={(e) => set("accountantIds", e.target.checked ? [...f.accountantIds, s.userId] : f.accountantIds.filter((x) => x !== s.userId))} />{s.fullName}</label>
              ))}
          </div>
        </Section>
        <p className="text-xs text-slate-500">Opening balances are entered afterwards as an opening journal, approved by a second person.</p>
      </form>
    </Modal>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset><legend className="text-sm font-semibold text-slate-900 mb-2">{title}</legend><div className="grid gap-3 sm:grid-cols-2">{children}</div></fieldset>
);
const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
function Text({ label, value, onChange, type = "text", wide, inputMode }: { label: string; value: string; onChange: (v: string) => void; type?: string; wide?: boolean; inputMode?: "decimal" }) {
  return <label className={wide ? "sm:col-span-2" : undefined}><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
    <input type={type} inputMode={inputMode} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}
