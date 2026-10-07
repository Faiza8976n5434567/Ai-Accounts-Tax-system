/** Customers and suppliers (P2-01). Reads through RLS; saving is an RLS-protected insert/update. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactKind = Database["public"]["Enums"]["contact_kind"];

export interface ContactInput {
  kind: ContactKind; name: string; trn: string; countryCode: string; emirateCode: string; email: string; phone: string; address: string;
  paymentTermsDays: string; defaultAccountId: string; defaultTaxCode: string; isRelatedParty: boolean; isActive: boolean;
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

/** Every problem with what was typed (empty = ready to save). The database checks the same rules. */
export function contactProblems(c: ContactInput): string[] {
  const p: string[] = [];
  if (!c.name.trim()) p.push("Enter the name.");
  if (c.trn.trim() && !/^1\d{14}$/.test(c.trn.trim())) p.push("A TRN is 15 digits starting with 1."); // F-18
  if (!/^[A-Z]{2}$/.test(c.countryCode.trim().toUpperCase())) p.push("Country must be a 2-letter code, e.g. AE, SA, GB.");
  if (c.countryCode.trim().toUpperCase() !== "AE" && c.emirateCode) p.push("Only UAE contacts have an emirate.");
  if (c.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) p.push("That email address does not look right.");
  if (c.paymentTermsDays.trim() && (!/^\d{1,3}$/.test(c.paymentTermsDays.trim()) || Number(c.paymentTermsDays) > 365)) p.push("Payment terms must be 0–365 days.");
  return p;
}

/** Plain-language TRN status shown next to a contact (ARAP-07 groundwork). */
export function trnStatus(c: Pick<Contact, "trn" | "country_code">): "valid" | "missing" | "foreign" {
  if (c.country_code !== "AE") return "foreign";
  return c.trn ? "valid" : "missing";
}

const toRow = (c: ContactInput) => ({
  kind: c.kind, name: c.name.trim(), trn: c.trn.trim() || null, country_code: c.countryCode.trim().toUpperCase(),
  emirate_code: c.emirateCode || null, email: c.email.trim() || null, phone: c.phone.trim() || null, address: c.address.trim() || null,
  payment_terms_days: c.paymentTermsDays.trim() ? Number(c.paymentTermsDays) : null,
  default_account_id: c.defaultAccountId || null, default_tax_code: c.defaultTaxCode || null,
  is_related_party: c.isRelatedParty, is_active: c.isActive,
});

export async function listContacts(orgId: string): Promise<Contact[]> {
  const r = await db().from("contacts").select("*").eq("organization_id", orgId).order("name");
  if (r.error) throw r.error;
  return r.data ?? [];
}

export async function saveContact(orgId: string, id: string | null, c: ContactInput): Promise<void> {
  const r = id
    ? await db().from("contacts").update(toRow(c)).eq("id", id)
    : await db().from("contacts").insert({ organization_id: orgId, ...toRow(c) });
  if (r.error) throw r.error;
}

export const emptyContact = (kind: ContactKind): ContactInput => ({
  kind, name: "", trn: "", countryCode: "AE", emirateCode: "", email: "", phone: "", address: "",
  paymentTermsDays: "", defaultAccountId: "", defaultTaxCode: "", isRelatedParty: false, isActive: true,
});

export const fromContact = (c: Contact): ContactInput => ({
  kind: c.kind, name: c.name, trn: c.trn ?? "", countryCode: c.country_code, emirateCode: c.emirate_code ?? "", email: c.email ?? "",
  phone: c.phone ?? "", address: c.address ?? "", paymentTermsDays: c.payment_terms_days?.toString() ?? "",
  defaultAccountId: c.default_account_id ?? "", defaultTaxCode: c.default_tax_code ?? "", isRelatedParty: c.is_related_party, isActive: c.is_active,
});
