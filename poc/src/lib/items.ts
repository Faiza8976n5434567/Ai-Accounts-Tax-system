/** Items list (P4-04, D-60): products and services with the codes PINT AE needs (HS for goods, service accounting code
 *  for services), a unit (UN/ECE Rec 20), default price and tax code. Reads through RLS; saving is an RLS-protected
 *  insert/update (anyone who may prepare documents). The database checks the same rules. */
import { supabase } from "./supabase";
import { fmtPlain, parseAedToFils } from "./money";
import type { Database } from "./database.types";

export type Item = Database["public"]["Tables"]["items"]["Row"];
export type ItemType = "G" | "S" | "B";
export const ITEM_TYPES: [ItemType, string][] = [["G", "Goods"], ["S", "Services"], ["B", "Goods and services"]];
/** Common units (all in the official UN/ECE Rec 20 list shipped with PINT AE 1.0.4). */
export const UNITS: [string, string][] = [
  ["H87", "Piece"], ["C62", "Unit"], ["E48", "Service unit"], ["LS", "Lump sum"], ["HUR", "Hour"], ["DAY", "Day"], ["MON", "Month"], ["ANN", "Year"],
  ["KGM", "Kilogram"], ["GRM", "Gram"], ["LTR", "Litre"], ["MTR", "Metre"], ["MTK", "Square metre"], ["SET", "Set"], ["XBX", "Box"], ["XPK", "Pack"],
];
export const SALES_CODES: [string, string][] = [["SR", "Standard rated 5%"], ["ZR", "Zero rated"], ["EX", "Exempt"], ["OS", "Out of scope"]];
/** Exemption reasons (official PINT AE list, Federal Decree-Law No. 8 of 2017 Art 46). */
export const EXEMPTION_REASONS: [string, string][] = [
  ["DL8.46.1", "Certain financial services"], ["DL8.46.2", "Residential units (lease or sale)"], ["DL8.46.3", "Bare land"], ["DL8.46.4", "Local passenger transport"],
];

export interface ItemInput {
  code: string; name: string; description: string; itemType: ItemType; hsCode: string; sacCode: string; unitCode: string;
  defaultPrice: string; taxCode: string; exemptionReason: string; incomeAccountId: string; isActive: boolean;
}

/** Every problem with what was typed (empty = ready to save). */
export function itemProblems(i: ItemInput): string[] {
  const p: string[] = [];
  const code = /^[0-9A-Za-z.]{1,20}$/;
  if (!i.name.trim()) p.push("Enter the item name.");
  if (i.itemType !== "S" && !i.hsCode.trim()) p.push("Goods need an HS code (customs tariff code).");
  if (i.itemType !== "G" && !i.sacCode.trim()) p.push("Services need a service accounting code.");
  if (i.hsCode.trim() && !code.test(i.hsCode.trim())) p.push("The HS code may only contain digits, letters and dots (up to 20).");
  if (i.sacCode.trim() && !code.test(i.sacCode.trim())) p.push("The service accounting code may only contain digits, letters and dots (up to 20).");
  if (!/^[A-Z0-9]{2,3}$/.test(i.unitCode)) p.push("Choose a unit.");
  if (i.defaultPrice.trim()) { const f = parseAedToFils(i.defaultPrice); if (f === null || f <= 0) p.push("The default price must be above zero (at most 2 decimals)."); }
  if (i.taxCode === "EX" && !i.exemptionReason) p.push("Exempt items need an exemption reason.");
  return p;
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const toRow = (i: ItemInput) => ({
  code: i.code.trim() || null, name: i.name.trim(), description: i.description.trim() || null, item_type: i.itemType,
  hs_code: i.itemType === "S" ? null : i.hsCode.trim() || null, sac_code: i.itemType === "G" ? null : i.sacCode.trim() || null,
  unit_code: i.unitCode, default_price: i.defaultPrice.trim() ? parseAedToFils(i.defaultPrice) : null, tax_code: i.taxCode,
  exemption_reason: i.taxCode === "EX" ? i.exemptionReason || null : null, income_account_id: i.incomeAccountId || null, is_active: i.isActive,
});

export async function listItems(orgId: string): Promise<Item[]> {
  const r = await db().from("items").select("*").eq("organization_id", orgId).order("name");
  if (r.error) throw r.error;
  return r.data ?? [];
}
export async function saveItem(orgId: string, id: string | null, i: ItemInput): Promise<void> {
  const r = id ? await db().from("items").update(toRow(i)).eq("id", id).select("id")
    : await db().from("items").insert({ organization_id: orgId, ...toRow(i) }).select("id");
  if (r.error) throw r.error;
  if (!r.data || r.data.length === 0) throw new Error("Not saved — you may not change this client's items.");
}

export const emptyItem = (): ItemInput => ({ code: "", name: "", description: "", itemType: "S", hsCode: "", sacCode: "", unitCode: "C62",
  defaultPrice: "", taxCode: "SR", exemptionReason: "", incomeAccountId: "", isActive: true });
export const fromItem = (i: Item): ItemInput => ({
  code: i.code ?? "", name: i.name, description: i.description ?? "", itemType: i.item_type as ItemType, hsCode: i.hs_code ?? "", sacCode: i.sac_code ?? "",
  unitCode: i.unit_code, defaultPrice: i.default_price ? fmtPlain(i.default_price) : "", taxCode: i.tax_code, exemptionReason: i.exemption_reason ?? "",
  incomeAccountId: i.income_account_id ?? "", isActive: i.is_active,
});
