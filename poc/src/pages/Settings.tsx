import { useRef, useState } from "react";
import { Download, Upload, RotateCcw, FileCog, Database, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/useI18n";
import { TAX_CONFIG } from "../lib/config";
import { fmt } from "../lib/money";
import { Badge, Card, Modal, PageHeader, Tabs } from "../components/ui";

export function SettingsPage() {
  const store = useStore();
  const { t } = useI18n();
  const { state } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"tax" | "data">("tax");
  const [confirm, setConfirm] = useState(false);
  const backup = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" })); a.download = `tfs-smart-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); store.toast(t("Backup downloaded")); };
  const cfg: [string, string, string, boolean][] = [["VAT standard rate", `${TAX_CONFIG.vat.rateBp.value / 100}%`, TAX_CONFIG.vat.rateBp.ref, false], ["VAT mandatory registration", fmt(TAX_CONFIG.vat.mandatoryThreshold.value, { aed: true, dp0: true }), TAX_CONFIG.vat.mandatoryThreshold.ref, false], ["VAT return due", t("{n} days after period", { n: TAX_CONFIG.vat.returnDueDays.value }), TAX_CONFIG.vat.returnDueDays.ref, true], ["CT rate / 0% band", t("{r}% above {band}", { r: TAX_CONFIG.ct.rateBp.value / 100, band: fmt(TAX_CONFIG.ct.zeroBand.value, { aed: true, dp0: true }) }), TAX_CONFIG.ct.zeroBand.ref, false], ["SBR revenue limit", fmt(TAX_CONFIG.ct.sbrLimit.value, { aed: true, dp0: true }), TAX_CONFIG.ct.sbrLimit.ref, false], ["SBR last period end", TAX_CONFIG.ct.sbrLastPeriodEnd.value, TAX_CONFIG.ct.sbrLastPeriodEnd.ref, true], ["Entertainment disallowance", `${TAX_CONFIG.ct.entertainmentDisallowBp.value / 100}%`, TAX_CONFIG.ct.entertainmentDisallowBp.ref, false], ["E-invoicing SME go-live", TAX_CONFIG.einvoicing.below50m.goLive, TAX_CONFIG.einvoicing.below50m.ref, true]];
  return (
    <>
      <PageHeader eyebrow={t("Insights")} title={t("Settings")} sub={t("Tax configuration and local data management")}
        actions={<Tabs value={tab} onChange={setTab} items={[{ id: "tax", label: t("Tax configuration") }, { id: "data", label: t("Data") }]} />} />
      <div className="max-w-4xl">
        {tab === "tax" && <Card title={t("Tax configuration")} sub={t("Version {v} · last verified {d} · rules are data, not code", { v: TAX_CONFIG.version, d: TAX_CONFIG.lastVerified })} icon={<FileCog size={16} />} pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">{t("Parameter")}</th><th className="th">{t("Value")}</th><th className="th">{t("Legal reference")}</th><th className="th">{t("Status")}</th></tr></thead><tbody>
            {cfg.map(([a, b, c, v]) => <tr key={a} className="hover:bg-slate-50/70"><td className="td text-slate-700">{t(a)}</td><td className="td font-medium num">{b}</td><td className="td text-xs text-slate-500" dir="ltr">{c}</td><td className="td">{v ? <Badge tone="amber" dot>{t("VERIFY")}</Badge> : <Badge tone="emerald" dot>{t("Verified")}</Badge>}</td></tr>)}
          </tbody></table></div>
        </Card>}
        {tab === "data" && <Card title={t("Local data")} sub={t("POC stores everything in this browser's localStorage — no server, no database")} icon={<Database size={16} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([[<Download size={18} key="d" />, "Export backup", "Download all data as JSON", backup, "ghost"], [<Upload size={18} key="u" />, "Restore backup", "Load a previously exported file", () => fileRef.current?.click(), "ghost"], [<RotateCcw size={18} key="r" />, "Reset demo data", "Start again from the seeded clients", () => setConfirm(true), "danger"]] as const).map(([icon, l, s, fn, kind]) => (
              <button key={l} onClick={fn} className={`text-start rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${kind === "danger" ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className={`size-9 rounded-xl grid place-items-center mb-3 ${kind === "danger" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"}`}>{icon}</span>
                <div className="font-medium text-sm">{t(l)}</div><div className="text-xs text-slate-500 mt-0.5">{t(s)}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4 flex items-center gap-1.5"><ShieldCheck size={13} />{t("Production: UAE-region PostgreSQL with RLS, nightly encrypted backups (see ARCHITECTURE.md).")}</p>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { store.importState(JSON.parse(await f.text())); } catch { store.toast(t("Invalid backup file"), "err"); } } }} />
        </Card>}
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("Reset demo data?")}
        footer={<><button className="btn-ghost" onClick={() => setConfirm(false)}>{t("Cancel")}</button><button className="btn-danger" onClick={() => { store.reset(); setConfirm(false); }}>{t("Reset")}</button></>}>
        <p className="text-sm text-slate-600">{t("All captured invoices, journals and settings in this browser will be replaced with the original demo data.")}</p>
      </Modal>
    </>
  );
}
