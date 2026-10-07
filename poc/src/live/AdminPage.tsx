/** Admin area (P1-11 · Spec 03 §3). What each person may change is decided by the database:
 *  Super Admin — tax rules, platform, email templates, firm profile, restricted settings;
 *  Firm Admin — firm settings; everyone — their own display name. Others see read-only views. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Building, FileCog, Mail, Save, Settings2, ShieldAlert, Stamp, Trash2, UserRound } from "lucide-react";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { shortDate, roleLabel } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import {
  amISuperAdmin, approveVersion, configInputText, createDraftVersion, deleteDraftVersion, formatConfigValue, loadFirmAdmin, loadPlatform,
  loadTaxRules, parseConfigInput, saveFirmSetting, saveMyName, savePlatformSetting, saveTemplate, suggestLabel, updateDraftValue, updateFirm,
  versionInForce, type ConfigKey, type ConfigValue, type ConfigVersion, type EmailTemplate, type Firm, type FirmSetting, type PlatformSetting,
} from "../lib/admin";
import { myFirmRole } from "../lib/clients";
import type { Json } from "../lib/database.types";
import { useToast } from "./toast";

import type { AdminTab } from "./routes";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function AdminPage({ tab, go }: { tab: AdminTab; go: (t: AdminTab) => void }) {
  const auth = useAuth()!;
  const [superAdmin, setSuperAdmin] = useState(false);
  const [firmAdmin, setFirmAdmin] = useState(false);
  useEffect(() => {
    void amISuperAdmin(auth.userId).then(setSuperAdmin).catch(() => {});
    void myFirmRole().then((r) => setFirmAdmin(r === "firm_admin")).catch(() => {});
  }, [auth.userId]);

  const tabs: [AdminTab, string, ReactNode, boolean][] = [
    ["profile", "My profile", <UserRound size={15} key="p" />, true],
    ["tax", "Tax rules", <FileCog size={15} key="t" />, true],
    ["firm", "Firm", <Building size={15} key="f" />, true],
    ["platform", "Platform", <Settings2 size={15} key="s" />, superAdmin],
    ["email", "Email templates", <Mail size={15} key="e" />, superAdmin],
  ];
  return (
    <>
      <PageHeader eyebrow="Settings" title="Admin" sub={superAdmin ? "You are a Super Admin: tax rules and platform settings are yours to change." : "Some settings can only be changed by a Super Admin."} />
      <div className="flex flex-wrap gap-1.5 mb-5">
        {tabs.filter(([, , , show]) => show).map(([id, label, icon]) => (
          <button key={id} onClick={() => go(id)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ring-1 cursor-pointer ${tab === id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"}`}>{icon}{label}</button>
        ))}
      </div>
      <div className="max-w-6xl">
        {tab === "profile" && <ProfileTab />}
        {tab === "tax" && <TaxRulesTab superAdmin={superAdmin} />}
        {tab === "firm" && <FirmTab superAdmin={superAdmin} firmAdmin={firmAdmin} />}
        {tab === "platform" && superAdmin && <PlatformTab />}
        {tab === "email" && superAdmin && <EmailTab />}
      </div>
    </>
  );
}

// ── My profile ──────────────────────────────────────────────────────────────────────────
function ProfileTab() {
  const auth = useAuth()!;
  const toast = useToast();
  const [name, setName] = useState(auth.fullName);
  const save = async () => {
    try { await saveMyName(auth.userId, name); auth.setFullName(name.trim()); toast("Name updated"); } catch (e) { toast(friendlyDbError(e), "err"); }
  };
  return (
    <Card title="My profile" icon={<UserRound size={16} />} sub="Your name appears on journals you prepare or approve and in the audit trail.">
      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Full name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Email (sign-in)</span><input className={`${field} bg-slate-50`} value={auth.email} disabled /></label>
      </div>
      <button className="btn-primary bg-emerald-600 mt-4" disabled={!name.trim() || name.trim() === auth.fullName} onClick={() => void save()}><Save size={15} />Save</button>
    </Card>
  );
}

// ── Tax rules (Spec 03 §2 · D-15, D-23) ─────────────────────────────────────────────────
function TaxRulesTab({ superAdmin }: { superAdmin: boolean }) {
  const toast = useToast();
  const [keys, setKeys] = useState<ConfigKey[]>([]);
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [values, setValues] = useState<ConfigValue[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try { const r = await loadTaxRules(); setKeys(r.keys); setVersions(r.versions); setValues(r.values); } catch { toast("Could not load tax rules", "err"); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const inForce = versionInForce(versions, today);
  const version = versions.find((v) => v.id === (selected ?? inForce?.id));
  const rows = values.filter((v) => v.version_id === version?.id);
  const verifyCount = values.filter((v) => v.version_id === inForce?.id && v.needs_verification).length;
  const isDraft = version?.status === "draft";

  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">
      {verifyCount > 0 && <p className="rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-4 py-3 text-sm flex gap-2"><ShieldAlert size={16} className="shrink-0 mt-0.5" />
        <span>{verifyCount} rule{verifyCount === 1 ? "" : "s"} in force {verifyCount === 1 ? "is" : "are"} still marked <b>VERIFY</b> (PLAN Q-07). To sign them off, create a new version, untick VERIFY with the date you checked them, and approve it.</span></p>}
      <Card title="Versions" icon={<Stamp size={16} />} pad={false}
        sub="Calculations use the version whose dates cover the tax period, not today. Approved versions are frozen; changes go into a new dated version."
        actions={superAdmin && <button className="btn-primary bg-emerald-600" onClick={() => setCreating(true)}>New version</button>}>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">Version</th><th className="th">Effective</th><th className="th">Status</th><th className="th">Approval reason</th></tr></thead>
          <tbody>{versions.map((v) => (
            <tr key={v.id} className={`cursor-pointer hover:bg-slate-50/70 ${v.id === version?.id ? "bg-emerald-50/50" : ""}`} onClick={() => setSelected(v.id)}>
              <td className="td font-mono text-sm">{v.label}{v.id === inForce?.id && <Badge tone="emerald" className="ms-2">In force today</Badge>}</td>
              <td className="td">{shortDate(v.effective_from)} – {v.effective_to ? shortDate(v.effective_to) : "onwards"}</td>
              <td className="td">{v.status === "approved" ? <Badge tone="emerald" dot>Approved {v.approved_at && shortDate(v.approved_at)}</Badge> : <Badge tone="amber" dot>Draft</Badge>}</td>
              <td className="td text-xs text-slate-600 max-w-md">{v.approval_reason}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>

      {version && (
        <Card title={`Rules in ${version.label}`} icon={<FileCog size={16} />} pad={false}
          sub={isDraft ? (superAdmin ? "Draft: edit values below, then approve with a written reason." : "Draft — only a Super Admin can edit and approve it.") : "Approved and frozen."}
          actions={isDraft && superAdmin && <div className="flex gap-2">
            <button className="btn-danger" onClick={async () => { try { await deleteDraftVersion(version.id); setSelected(null); toast("Draft deleted"); await load(); } catch (e) { toast(friendlyDbError(e), "err"); } }}><Trash2 size={15} />Delete draft</button>
            <button className="btn-primary bg-emerald-600" onClick={() => setApproving(true)}><BadgeCheck size={15} />Approve…</button>
          </div>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[860px]">
            <thead><tr><th className="th">Rule</th><th className="th">Value</th><th className="th">Legal reference</th><th className="th">Last verified</th><th className="th">Status</th>{isDraft && superAdmin && <th className="th"><span className="sr-only">Save</span></th>}</tr></thead>
            <tbody>{keys.map((k) => {
              const row = rows.find((r) => r.key === k.key);
              if (!row) return null;
              return isDraft && superAdmin
                ? <DraftRow key={k.key} k={k} row={row} onSaved={load} />
                : (
                  <tr key={k.key}>
                    <td className="td"><div>{k.label}</div><div className="text-xs text-slate-400 font-mono">{k.key}</div></td>
                    <td className="td font-medium num">{formatConfigValue(k.value_type, row.value)}</td>
                    <td className="td text-xs text-slate-600">{row.legal_reference}</td>
                    <td className="td text-xs text-slate-600">{row.last_verified && shortDate(row.last_verified)}</td>
                    <td className="td">{row.needs_verification ? <Badge tone="amber" dot>VERIFY</Badge> : <Badge tone="emerald" dot>Verified</Badge>}</td>
                  </tr>
                );
            })}</tbody>
          </table></div>
        </Card>
      )}

      {creating && <NewVersionModal versions={versions} onClose={() => setCreating(false)} onCreate={async (label, from) => {
        const base = versionInForce(versions, from) ?? versions.find((v) => v.status === "approved");
        if (!base) return;
        try { const id = await createDraftVersion(label, from, base, values); setCreating(false); setSelected(id); toast(`Draft ${label} created from ${base.label}`); await load(); }
        catch (e) { toast(friendlyDbError(e), "err"); }
      }} />}
      {approving && version && <ApproveModal version={version} onClose={() => setApproving(false)} onApprove={async (reason) => {
        try { await approveVersion(version.id, reason); setApproving(false); toast(`${version.label} approved`); await load(); }
        catch (e) { toast(friendlyDbError(e), "err"); }
      }} />}
    </div>
  );
}

function DraftRow({ k, row, onSaved }: { k: ConfigKey; row: ConfigValue; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState(configInputText(k.value_type, row.value));
  const [ref, setRef] = useState(row.legal_reference ?? "");
  const [verified, setVerified] = useState(row.last_verified ?? "");
  const [verify, setVerify] = useState(row.needs_verification);
  const parsed = parseConfigInput(k.value_type, text);
  const dirty = text !== configInputText(k.value_type, row.value) || ref !== (row.legal_reference ?? "") || verified !== (row.last_verified ?? "") || verify !== row.needs_verification;
  const unit = k.value_type === "bp" ? "%" : k.value_type === "fils" ? "AED" : k.value_type === "days" ? "days" : k.value_type === "months" ? "months" : "";
  const save = async () => {
    if ("error" in parsed) { toast(parsed.error, "err"); return; }
    try { await updateDraftValue(row.version_id, row.key, { value: parsed.value, legal_reference: ref.trim() || null, last_verified: verified || null, needs_verification: verify }); toast(`${k.label} saved`); await onSaved(); }
    catch (e) { toast(friendlyDbError(e), "err"); }
  };
  return (
    <tr>
      <td className="td"><div>{k.label}</div><div className="text-xs text-slate-400 font-mono">{k.key}</div></td>
      <td className="td"><div className="flex items-center gap-1.5"><input aria-label={`${k.label} value`} type={k.value_type === "date" ? "date" : "text"} className={`${field} !py-1.5 w-36 num`} value={text} onChange={(e) => setText(e.target.value)} /><span className="text-xs text-slate-500">{unit}</span></div>
        {"error" in parsed && <div className="text-xs text-rose-700 mt-1">{parsed.error}</div>}</td>
      <td className="td"><input aria-label={`${k.label} legal reference`} className={`${field} !py-1.5`} value={ref} onChange={(e) => setRef(e.target.value)} /></td>
      <td className="td"><input aria-label={`${k.label} last verified`} type="date" className={`${field} !py-1.5`} value={verified} onChange={(e) => setVerified(e.target.value)} /></td>
      <td className="td"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />VERIFY</label></td>
      <td className="td"><button className="btn-ghost !py-1 !px-2.5 text-xs" disabled={!dirty || "error" in parsed} onClick={() => void save()}><Save size={13} />Save</button></td>
    </tr>
  );
}

function NewVersionModal({ versions, onClose, onCreate }: { versions: ConfigVersion[]; onClose: () => void; onCreate: (label: string, from: string) => Promise<void> }) {
  const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const [from, setFrom] = useState(next.toISOString().slice(0, 10));
  const [label, setLabel] = useState(suggestLabel(next.toISOString().slice(0, 10), versions.map((v) => v.label)));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="New tax-rule version"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy || !from || !label.trim()} onClick={async () => { setBusy(true); await onCreate(label.trim(), from); setBusy(false); }}>Create draft</button></>}>
      <p className="text-sm text-slate-600 mb-3">The draft starts as a copy of the rules in force on its effective date. Earlier periods keep using the older version.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Effective from</span><input type="date" className={field} value={from} onChange={(e) => { setFrom(e.target.value); setLabel(suggestLabel(e.target.value, versions.map((v) => v.label))); }} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Version label</span><input className={field} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function ApproveModal({ version, onClose, onApprove }: { version: ConfigVersion; onClose: () => void; onApprove: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Approve ${version.label}?`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); await onApprove(reason.trim()); setBusy(false); }}><BadgeCheck size={15} />Approve</button></>}>
      <p className="text-sm text-slate-600 mb-3">From {shortDate(version.effective_from)}, every calculation for periods on or after this date uses these rules. Once approved the version is frozen. Your reason is kept in the audit trail (D-23).</p>
      <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1.5">Reason and source (e.g. Cabinet Decision, FTA guide, date checked)</span>
        <textarea className={field} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Modal>
  );
}

// ── Firm profile and settings ───────────────────────────────────────────────────────────
type SettingKind = "int" | "bool" | "text" | "list" | "choice" | "prefixes" | "json";
const SETTINGS: { key: string; label: string; kind: SettingKind; superOnly?: boolean; choices?: string[]; hint?: string }[] = [
  { key: "default_payment_terms_days", label: "Default payment terms (days)", kind: "int" },
  { key: "default_vat_period", label: "Default VAT period for new clients", kind: "choice", choices: ["quarterly", "monthly"] },
  { key: "numbering_format", label: "Document number format", kind: "text", hint: "{PREFIX}-{YYYY}-{MM}-{SEQ:4} gives INV-2026-10-0001 (D-22)" },
  { key: "document_prefixes", label: "Document prefixes", kind: "prefixes" },
  { key: "bank_match_tolerance_days", label: "Bank auto-match tolerance (days)", kind: "int" },
  { key: "auto_apply_customer_credits", label: "Auto-apply customer credits to the oldest invoice (D-11)", kind: "bool" },
  { key: "invite_expiry_days", label: "Invitation links expire after (days)", kind: "int", superOnly: true },
  { key: "allowed_email_domains", label: "Firm staff email domains (empty = any)", kind: "list", superOnly: true, hint: "e.g. tfsplus.ae — Q-23" },
  { key: "reminder_lead_days", label: "Deadline reminders (days before)", kind: "list", superOnly: true },
  { key: "daily_digest", label: "Daily email digest", kind: "bool", superOnly: true },
  { key: "integrity_alert_recipients", label: "Integrity alert recipients", kind: "list", superOnly: true },
  { key: "ageing_buckets", label: "Ageing buckets", kind: "json", hint: "Edited when receivables arrive (Phase 2)" },
  { key: "risk_weights", label: "Bill risk weights", kind: "json", hint: "Edited when purchase bills arrive (Phase 2)" },
  { key: "risk_thresholds", label: "Bill risk thresholds", kind: "json", hint: "Edited when purchase bills arrive (Phase 2)" },
];

function FirmTab({ superAdmin, firmAdmin }: { superAdmin: boolean; firmAdmin: boolean }) {
  const toast = useToast();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [settings, setSettings] = useState<FirmSetting[]>([]);
  const load = useCallback(async () => { try { const r = await loadFirmAdmin(); setFirms(r.firms); setSettings(r.settings); } catch { toast("Could not load firm settings", "err"); } }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const firm = firms.find((f) => settings.some((s) => s.firm_id === f.id)) ?? firms[0];
  if (!firm) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">
      <FirmProfile firm={firm} canEdit={superAdmin} onSaved={load} />
      <Card title="Firm settings" icon={<Settings2 size={16} />} pad={false}
        sub={firmAdmin ? "Firm Admins change operational settings; the ones marked Super Admin are restricted." : "Only Firm Admins can change these."}>
        <div className="divide-y divide-slate-100">
          {SETTINGS.map((def) => {
            const s = settings.find((x) => x.firm_id === firm.id && x.key === def.key);
            if (!s) return null;
            const canEdit = firmAdmin && (!def.superOnly || superAdmin) && def.kind !== "json";
            return <SettingRow key={def.key} def={def} value={s.value} canEdit={canEdit} onSave={async (v) => {
              try { await saveFirmSetting(firm.id, def.key, v); toast(`${def.label} saved`); await load(); } catch (e) { toast(friendlyDbError(e), "err"); }
            }} />;
          })}
        </div>
      </Card>
    </div>
  );
}

function FirmProfile({ firm, canEdit, onSaved }: { firm: Firm; canEdit: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [f, setF] = useState({ legal_name: firm.legal_name, trn: firm.trn ?? "", tax_agent_number: firm.tax_agent_number ?? "", emirate_code: firm.emirate_code ?? "AUH", address: firm.address ?? "" });
  const save = async () => {
    if (f.trn && !/^1\d{14}$/.test(f.trn.trim())) { toast("A TRN is 15 digits starting with 1.", "err"); return; }
    try {
      await updateFirm(firm.id, { legal_name: f.legal_name.trim(), trn: f.trn.trim() || null, tax_agent_number: f.tax_agent_number.trim() || null, emirate_code: f.emirate_code, address: f.address.trim() || null });
      toast("Firm profile saved"); await onSaved();
    } catch (e) { toast(friendlyDbError(e), "err"); }
  };
  const input = (k: keyof typeof f, label: string, wide = false) => (
    <label className={wide ? "sm:col-span-2" : undefined}><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <input className={`${field} ${canEdit ? "" : "bg-slate-50"}`} disabled={!canEdit} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <Card title="Firm profile" icon={<Building size={16} />} sub={`Appears on exports and emails.${canEdit ? "" : " Only a Super Admin can change it."}`}
      actions={firm.is_platform_owner && <Badge tone="indigo">Platform owner</Badge>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {input("legal_name", "Legal name", true)}
        {input("trn", "Firm TRN")}
        {input("tax_agent_number", "FTA tax agency number")}
        {input("emirate_code", "Emirate (AUH, DXB, SHJ, AJM, UAQ, RAK, FUJ)")}
        {input("address", "Address", true)}
      </div>
      {canEdit && <button className="btn-primary bg-emerald-600 mt-4" onClick={() => void save()}><Save size={15} />Save profile</button>}
    </Card>
  );
}

function SettingRow({ def, value, canEdit, onSave }: { def: (typeof SETTINGS)[number]; value: Json; canEdit: boolean; onSave: (v: Json) => Promise<void> }) {
  const initial = useMemo(() => {
    if (def.kind === "list") return (Array.isArray(value) ? value : []).join(", ");
    if (def.kind === "prefixes") return JSON.stringify(value);
    if (def.kind === "json") return JSON.stringify(value);
    return String(value);
  }, [def.kind, value]);
  const [text, setText] = useState(initial);
  const [prefixes, setPrefixes] = useState<Record<string, string>>(def.kind === "prefixes" && value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {});
  const [error, setError] = useState<string | null>(null);

  const build = (): Json | null => {
    if (def.kind === "int") return /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : (setError("Enter a whole number."), null);
    if (def.kind === "text" || def.kind === "choice") return text.trim() ? text.trim() : (setError("Cannot be empty."), null);
    if (def.kind === "list") {
      const items = text.split(",").map((x) => x.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
      return def.key === "reminder_lead_days" ? (items.every((x) => /^\d{1,3}$/.test(x)) ? items.map(Number) : (setError("Days must be whole numbers."), null)) : items;
    }
    if (def.kind === "prefixes") return Object.values(prefixes).every((p) => /^[A-Z]{1,6}$/.test(p)) ? prefixes : (setError("Prefixes: 1–6 capital letters."), null);
    return null;
  };
  const save = async () => { setError(null); const v = build(); if (v !== null) await onSave(v); };

  return (
    <div className="px-5 py-3 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto] items-start">
      <div><div className="text-sm text-slate-800">{def.label}{def.superOnly && <Badge tone="indigo" className="ms-2">Super Admin</Badge>}</div>{def.hint && <div className="text-xs text-slate-500">{def.hint}</div>}</div>
      <div>
        {def.kind === "bool" ? (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={value === true} onChange={(e) => void onSave(e.target.checked)} />{value === true ? "On" : "Off"}</label>
        ) : def.kind === "choice" ? (
          <select className={field} disabled={!canEdit} value={text} onChange={(e) => setText(e.target.value)}>{def.choices!.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        ) : def.kind === "prefixes" ? (
          <div className="grid grid-cols-5 gap-1.5">{Object.entries(prefixes).map(([doc, p]) => (
            <label key={doc} className="text-[10px] text-slate-500">{doc.replace("_", " ")}<input className={`${field} !px-2 !py-1 uppercase`} disabled={!canEdit} value={p} onChange={(e) => setPrefixes({ ...prefixes, [doc]: e.target.value.toUpperCase() })} /></label>
          ))}</div>
        ) : def.kind === "json" ? (
          <code className="block text-xs text-slate-600 break-all">{text}</code>
        ) : (
          <input className={`${field} ${canEdit ? "" : "bg-slate-50"}`} disabled={!canEdit} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        {error && <div className="text-xs text-rose-700 mt-1">{error}</div>}
      </div>
      <div>{canEdit && def.kind !== "bool" && <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => void save()}><Save size={13} />Save</button>}</div>
    </div>
  );
}

// ── Platform (Super Admin) ──────────────────────────────────────────────────────────────
function PlatformTab() {
  const toast = useToast();
  const auth = useAuth()!;
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const load = useCallback(async () => { try { setSettings((await loadPlatform()).settings); } catch { toast("Could not load platform settings", "err"); } }, [toast]);
  useEffect(() => { void load(); }, [load]);
  return (
    <Card title="Platform settings" icon={<Settings2 size={16} />} pad={false} sub="Platform-wide, owned by TFS Plus (D-20). The app name is used in titles, emails and exports — never hard-coded.">
      <div className="divide-y divide-slate-100">{settings.map((s) => (
        <PlatformRow key={s.key} s={s} onSave={async (v) => {
          try { await savePlatformSetting(s.key, v); if (s.key === "app_name" && typeof v === "string") auth.setAppName(v); toast("Saved"); await load(); } catch (e) { toast(friendlyDbError(e), "err"); }
        }} />
      ))}</div>
    </Card>
  );
}

function PlatformRow({ s, onSave }: { s: PlatformSetting; onSave: (v: Json) => Promise<void> }) {
  const [text, setText] = useState(typeof s.value === "string" ? s.value : "");
  return (
    <div className="px-5 py-3 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto] items-start">
      <div><div className="text-sm text-slate-800">{s.description ?? s.key}</div><div className="text-xs text-slate-400 font-mono">{s.key}{s.is_public && " · visible before sign-in"}</div></div>
      <input className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder="(not set)" />
      <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => void onSave(text.trim() ? text.trim() : null)}><Save size={13} />Save</button>
    </div>
  );
}

// ── Email templates (Super Admin) ───────────────────────────────────────────────────────
function EmailTab() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const load = useCallback(async () => { try { setTemplates((await loadPlatform()).templates); } catch { toast("Could not load templates", "err"); } }, [toast]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="grid gap-5 grid-cols-[minmax(0,1fr)]">{templates.map((t) => <TemplateCard key={t.key} t={t} onSave={async (subject, body) => {
      try { await saveTemplate(t.key, subject, body); toast("Template saved"); await load(); } catch (e) { toast(friendlyDbError(e), "err"); }
    }} />)}</div>
  );
}

function TemplateCard({ t, onSave }: { t: EmailTemplate; onSave: (subject: string, body: string) => Promise<void> }) {
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const label = { invite: "Invitation", deadline_reminder: "Deadline reminder", approval_waiting: "Waiting for approval", integrity_alert: "Integrity alert" }[t.key] ?? t.key;
  return (
    <Card title={label} icon={<Mail size={16} />} sub={<>Placeholders: {t.variables.map((v) => <code key={v} className="me-1.5 text-xs">{`{{${v}}}`}</code>)}</>}>
      <label className="block mb-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Subject</span><input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1.5">Body</span><textarea className={field} rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <button className="btn-primary bg-emerald-600 mt-3" disabled={!subject.trim() || !body.trim() || (subject === t.subject && body === t.body)} onClick={() => void onSave(subject.trim(), body)}><Save size={15} />Save template</button>
      {t.key === "invite" && <p className="text-xs text-slate-500 mt-2">Used by “Invite staff” ({roleLabel("firm_accountant")} / {roleLabel("firm_admin")}).</p>}
    </Card>
  );
}
