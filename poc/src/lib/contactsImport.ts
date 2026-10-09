/** Contacts import from the Excel template (P2-07). The database checks every row again and imports
 *  all-or-nothing; existing contacts (same name or TRN) are skipped, never changed. */
import { supabase } from "./supabase";

export const TEMPLATE_COLUMNS = [
  ["Type", "kind", "Customer, Supplier or Both (required)"],
  ["Name", "name", "Legal name as on the trade licence or invoice (required)"],
  ["TRN", "trn", "15 digits starting with 1, if VAT registered"],
  ["Country", "country_code", "2 letters, e.g. AE, SA, GB (blank = AE)"],
  ["Emirate", "emirate_code", "AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ (UAE only)"],
  ["Email", "email", ""],
  ["Phone", "phone", ""],
  ["Address", "address", ""],
  ["Payment terms (days)", "payment_terms_days", "0–365 (blank = firm default)"],
  ["Default account code", "default_account_code", "e.g. 4010 for customers, 6130 for suppliers"],
  ["Default tax code", "default_tax_code", "SR, ZR, EX, OS, RCS, IMG or BLK"],
  ["Related party", "is_related_party", "Yes or No (for Corporate Tax transfer pricing)"],
] as const;
export type ContactImportRow = { row: number } & Partial<Record<(typeof TEMPLATE_COLUMNS)[number][1], string>>;

/** Rows of the first sheet → import rows. Column titles are matched without case; blank rows are skipped. */
export function parseContactsSheet(sheet: string[][]): { rows: ContactImportRow[]; errors: string[] } {
  const headerIndex = sheet.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "name") && r.some((c) => c.trim().toLowerCase() === "type"));
  if (headerIndex < 0) return { rows: [], errors: ["This is not the contacts template — the Type and Name columns were not found."] };
  const header = sheet[headerIndex].map((c) => c.trim().toLowerCase());
  const col = new Map(TEMPLATE_COLUMNS.map(([title, key]) => [key, header.indexOf(title.toLowerCase())]));
  const rows: ContactImportRow[] = [];
  sheet.slice(headerIndex + 1).forEach((r, k) => {
    if (r.every((c) => !String(c ?? "").trim())) return;
    const out: ContactImportRow = { row: headerIndex + k + 2 };
    for (const [, key] of TEMPLATE_COLUMNS) {
      const i = col.get(key) ?? -1;
      const v = i >= 0 ? String(r[i] ?? "").trim() : "";
      if (v) out[key] = v;
    }
    rows.push(out);
  });
  const errors = rows.length === 0 ? ["The Contacts sheet has no rows."] : [];
  return { rows, errors };
}

export async function downloadContactsTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map(([t]) => t)]), "Contacts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["How to fill the Contacts sheet"], [],
    ["Column", "What to enter"], ...TEMPLATE_COLUMNS.map(([t, , help]) => [t, help]), [],
    ["Example rows (do not copy into the Contacts sheet as they are)"],
    TEMPLATE_COLUMNS.map(([t]) => t),
    ["Customer", "Gulf Trading LLC", "100222333444003", "AE", "DXB", "accounts@gulftrading.ae", "04 123 4567", "Office 12, Business Bay, Dubai", "30", "4010", "SR", "No"],
    ["Supplier", "Cloud Software Inc", "", "US", "", "", "", "", "0", "6180", "RCS", "No"], [],
    ["Contacts that already exist in the client (same name or same TRN) are skipped and listed — they are never changed."],
    ["If any row has a problem, nothing is imported and every problem is listed with its row number."],
  ]), "Instructions");
  XLSX.writeFile(wb, "Contacts import template.xlsx");
}

export async function importContacts(orgId: string, rows: ContactImportRow[]) {
  if (!supabase) throw new Error("Not connected");
  const r = await supabase.rpc("import_contacts", { p_organization_id: orgId, p_rows: rows as never });
  if (r.error) throw r.error;
  return r.data as unknown as { imported: number; skipped: { row: number; name: string; reason: string }[] };
}
