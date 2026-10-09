/** Admin area (P1-11 · Spec 03 §2–§3): tax rules, firm profile and settings, platform settings,
 *  email templates, own profile. Writes go through RLS (Super Admin / Firm Admin policies) and
 *  the database's validation and freeze triggers; approving tax rules goes through
 *  approve_config_version() (D-23: written reason; two-person rule once a second Super Admin exists). */
import { supabase } from "./supabase";
import { fmt, parseAedToFils } from "./money";
import type { Database, Json } from "./database.types";

type T = Database["public"]["Tables"];
export type ConfigType = Database["public"]["Enums"]["config_value_type"];
export type ConfigKey = T["config_keys"]["Row"];
export type ConfigVersion = T["config_versions"]["Row"];
export type ConfigValue = T["config_values"]["Row"];
export type Firm = T["firms"]["Row"];
export type FirmSetting = T["firm_settings"]["Row"];
export type PlatformSetting = T["platform_settings"]["Row"];
export type EmailTemplate = T["email_templates"]["Row"];

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D,>(r: { data: D; error: { message: string } | null }): D => { if (r.error) throw r.error; return r.data; };

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────────────────

/** How a stored tax-rule value is shown: 500 bp → "5.00%", 1000000 fils → "AED 10,000.00", etc. */
export function formatConfigValue(type: ConfigType, value: Json): string {
  if (type === "date" || type === "rate") return String(value);
  const n = typeof value === "number" ? value : Number(value);
  if (type === "bp") return `${fmt(n)}%`;               // basis points ÷ 100 = percent, 2 dp
  if (type === "fils") return fmt(n, { aed: true });
  if (type === "days") return `${n} day${n === 1 ? "" : "s"}`;
  return `${n} month${n === 1 ? "" : "s"}`;
}

/** What the edit box shows for a stored value (the reverse of parseConfigInput). */
export function configInputText(type: ConfigType, value: Json): string {
  if (type === "date" || type === "rate" || type === "days" || type === "months") return String(value);
  return fmt(Number(value)).replace(/,/g, "");           // bp → "5.00", fils → "10000.00"
}

/**
 * Turns what was typed into the stored value, exactly (no floating point). The database checks
 * the ranges again (CFG-03). Returns { value } or { error }.
 */
export function parseConfigInput(type: ConfigType, text: string): { value: Json } | { error: string } {
  const t = text.trim();
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t + "T00:00:00Z")) ? { value: t } : { error: "Enter a date (YYYY-MM-DD)." };
  if (type === "rate") return /^\d{1,6}(\.\d{1,6})?$/.test(t) && !/^0+(\.0+)?$/.test(t) ? { value: Number(t) } : { error: "Enter a rate greater than 0, up to 6 decimals." };
  if (type === "days" || type === "months") {
    if (!/^\d{1,3}$/.test(t)) return { error: "Enter a whole number." };
    const n = Number(t);
    if (type === "days" && n > 366) return { error: "At most 366 days." };
    if (type === "months" && n > 24) return { error: "At most 24 months." };
    return { value: n };
  }
  const v = parseAedToFils(t);                            // "5.25" → 525: percent → bp, AED → fils
  if (v === null || v < 0) return { error: type === "bp" ? "Enter a percentage with at most 2 decimals." : "Enter an AED amount with at most 2 decimals." };
  if (type === "bp" && v > 10000) return { error: "A percentage cannot exceed 100%." };
  return { value: v };
}

/** Next free version label: uae-2026.09 exists → "uae-2026.10" style from the effective date. */
export function suggestLabel(effectiveFrom: string, existing: string[]): string {
  const base = `uae-${effectiveFrom.slice(0, 4)}.${effectiveFrom.slice(5, 7)}`;
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) if (!existing.includes(`${base}-${i}`)) return `${base}-${i}`;
}

/** The version in force on a date: the approved one with the latest start on or before it (Spec 03 §2). */
export const versionInForce = (versions: ConfigVersion[], on: string): ConfigVersion | undefined =>
  versions.filter((v) => v.status === "approved" && v.effective_from <= on).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

// ── Data access ─────────────────────────────────────────────────────────────────────────

export async function loadTaxRules() {
  const [keys, versions, values] = await Promise.all([
    db().from("config_keys").select("*").order("key"),
    db().from("config_versions").select("*").order("effective_from", { ascending: false }),
    db().from("config_values").select("*"),
  ]);
  return { keys: ok(keys) ?? [], versions: ok(versions) ?? [], values: ok(values) ?? [] };
}

/** A new draft version, starting as a copy of `basedOn`'s values. */
export async function createDraftVersion(label: string, effectiveFrom: string, basedOn: ConfigVersion, values: ConfigValue[]): Promise<string> {
  const v = ok(await db().from("config_versions").insert({ label, effective_from: effectiveFrom, based_on: basedOn.id }).select("id").single());
  if (!v) throw new Error("The draft version was not created");
  const rows = values.filter((x) => x.version_id === basedOn.id).map((x) => ({
    version_id: v.id, key: x.key, value: x.value, legal_reference: x.legal_reference, last_verified: x.last_verified, needs_verification: x.needs_verification,
  }));
  ok(await db().from("config_values").insert(rows));
  return v.id;
}

export async function updateDraftValue(versionId: string, key: string, patch: { value: Json; legal_reference: string | null; last_verified: string | null; needs_verification: boolean }) {
  const saved = ok(await db().from("config_values").update(patch).eq("version_id", versionId).eq("key", key).select("key"));
  // An update the database refuses (not a Super Admin, no two-factor, version no longer a draft) changes 0 rows without an error.
  if (!saved || saved.length === 0) throw new Error("Not saved — only a Super Admin signed in with two-factor can change a draft version.");
}
export const deleteDraftVersion = async (id: string) => { ok(await db().from("config_versions").delete().eq("id", id)); };
export const approveVersion = async (id: string, reason: string) => { ok(await db().rpc("approve_config_version", { p_version_id: id, p_reason: reason })); };

export async function loadFirmAdmin() {
  const [firms, settings] = await Promise.all([db().from("firms").select("*").order("is_platform_owner", { ascending: false }), db().from("firm_settings").select("*")]);
  return { firms: ok(firms) ?? [], settings: ok(settings) ?? [] };
}
export async function updateFirm(id: string, patch: Pick<Firm, "legal_name" | "trn" | "tax_agent_number" | "emirate_code" | "address">) {
  ok(await db().from("firms").update(patch).eq("id", id));
}
export async function saveFirmSetting(firmId: string, key: string, value: Json) {
  ok(await db().from("firm_settings").update({ value }).eq("firm_id", firmId).eq("key", key));
}

export async function loadPlatform() {
  const [settings, templates] = await Promise.all([db().from("platform_settings").select("*").order("key"), db().from("email_templates").select("*").order("key")]);
  return { settings: ok(settings) ?? [], templates: ok(templates) ?? [] };
}
export async function savePlatformSetting(key: string, value: Json) { ok(await db().from("platform_settings").update({ value }).eq("key", key)); }
export async function saveTemplate(key: string, subject: string, body: string) { ok(await db().from("email_templates").update({ subject, body }).eq("key", key)); }

export async function saveMyName(userId: string, fullName: string) { ok(await db().from("profiles").update({ full_name: fullName.trim() }).eq("id", userId)); }
export async function amISuperAdmin(userId: string): Promise<boolean> {
  const r = ok(await db().from("profiles").select("is_super_admin").eq("id", userId).maybeSingle());
  return r?.is_super_admin ?? false;
}
