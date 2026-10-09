/** Customers and suppliers (P2-01). Reads through RLS; saving is an RLS-protected insert/update. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactKind = Database["public"]["Enums"]["contact_kind"];

export interface ContactInput {
  kind: ContactKind; name: string; trn: string; countryCode: string; emirateCode: string; email: string; phone: string; address: string;
  paymentTermsDays: string; defaultAccountId: string; defaultTaxCode: string; isRelatedParty: boolean; isActive: boolean;
  // E-invoicing (P4-03, PINT AE): consumers are B2C and not e-invoiced (D-59)
  customerType: "business" | "government" | "consumer"; addressLine1: string; city: string; region: string;
  regType: string; regId: string; regAuthority: string; passportCountry: string; peppolScheme: string; peppolId: string; notOnboarded: boolean;
}

/** Registration types allowed by PINT AE (IBR-173 / IBR-183-AE). */
export const REG_TYPES: [string, string][] = [["TL", "Trade licence"], ["CL", "Commercial licence"], ["EID", "Emirates ID"], ["PAS", "Passport"], ["CD", "Cabinet decision"]];
export const CUSTOMER_TYPES: [ContactInput["customerType"], string][] = [["business", "Business (B2B)"], ["government", "Government (B2G)"], ["consumer", "Consumer (B2C — not e-invoiced)"]];

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
  if (c.regType === "PAS" && c.passportCountry.trim() && !/^[A-Z]{2}$/.test(c.passportCountry.trim().toUpperCase())) p.push("Passport country must be a 2-letter code.");
  if (!/^\d{4}$/.test(c.peppolScheme.trim() || "0235")) p.push("The Peppol scheme is a 4-digit code (0235 for a UAE TIN).");
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
  customer_type: c.customerType, address_line1: c.addressLine1.trim() || null, city: c.city.trim() || null, region: c.region.trim() || null,
  reg_type: c.regType || null, reg_id: c.regId.trim() || null, reg_authority: c.regAuthority.trim() || null,
  passport_country: c.regType === "PAS" ? c.passportCountry.trim().toUpperCase() || null : null,
  peppol_scheme: c.peppolScheme.trim() || "0235", peppol_id: c.peppolId.trim() || null, einv_not_onboarded: c.notOnboarded,
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
  customerType: "business", addressLine1: "", city: "", region: "", regType: "", regId: "", regAuthority: "", passportCountry: "",
  peppolScheme: "0235", peppolId: "", notOnboarded: false,
});

export const fromContact = (c: Contact): ContactInput => ({
  kind: c.kind, name: c.name, trn: c.trn ?? "", countryCode: c.country_code, emirateCode: c.emirate_code ?? "", email: c.email ?? "",
  phone: c.phone ?? "", address: c.address ?? "", paymentTermsDays: c.payment_terms_days?.toString() ?? "",
  defaultAccountId: c.default_account_id ?? "", defaultTaxCode: c.default_tax_code ?? "", isRelatedParty: c.is_related_party, isActive: c.is_active,
  customerType: c.customer_type as ContactInput["customerType"], addressLine1: c.address_line1 ?? "", city: c.city ?? "", region: c.region ?? "",
  regType: c.reg_type ?? "", regId: c.reg_id ?? "", regAuthority: c.reg_authority ?? "", passportCountry: c.passport_country ?? "",
  peppolScheme: c.peppol_scheme, peppolId: c.peppol_id ?? "", notOnboarded: c.einv_not_onboarded,
});
