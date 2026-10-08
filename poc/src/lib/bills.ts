/** Purchase bills and debit notes (P2-03 · D-31, D-32, D-33). The database calculates, runs the checks and
 *  posts; the preview uses the same line rules as sales (lineAmounts) so the screen matches to the fils. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type PurchaseBill = Database["public"]["Tables"]["purchase_bills"]["Row"];
export type BillLine = Database["public"]["Tables"]["purchase_bill_lines"]["Row"];
export type BillCheck = Database["public"]["Tables"]["bill_checks"]["Row"];
export type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
export type BillWithDetails = PurchaseBill & {
  lines: BillLine[]; checks: BillCheck[]; attachments: Attachment[]; supplier: string; preparer: string | null; approver: string | null;
};
export const BILL_TAX_CODES: [string, string][] = [
  ["SR", "Standard 5%"], ["ZR", "Zero rated"], ["EX", "Exempt"], ["OS", "Out of scope"], ["RCS", "Reverse charge 5% (services)"], ["IMG", "Import of goods 5% (reverse charge)"], ["BLK", "5% — blocked (not recoverable)"],
];
/** Tax codes that carry VAT at the standard rate. */
export const VAT_BEARING = new Set(["SR", "RCS", "IMG", "BLK"]);
/** Reverse charge: VAT self-assessed, recovered, not paid to the supplier (RCS services → box 3, IMG goods → box 6). */
export const REVERSE_CHARGE = new Set(["RCS", "IMG"]);

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────────────────
/**
 * What the supplier is owed and what VAT is recovered, from calculated lines (mirrors app.review_purchase_bill):
 * reverse-charge VAT is self-assessed, not paid to the supplier; blocked VAT is never recovered; standard-rated
 * VAT is recovered only when the checks allow it (D-32) — the database makes the final decision.
 */
export function billTotals(lines: { taxCode: string; net: number; vat: number }[], srRecoverable: boolean) {
  let net = 0, vat = 0, recoverable = 0, payable = 0;
  for (const l of lines) {
    net += l.net; vat += l.vat;
    payable += l.net + (REVERSE_CHARGE.has(l.taxCode) ? 0 : l.vat);
    if (REVERSE_CHARGE.has(l.taxCode) || (l.taxCode === "SR" && srRecoverable)) recoverable += l.vat;
  }
  return { net, vat, recoverable, payable };
}

/** What is still available on a bill for debit notes, from posted debit notes. */
export function debitRemaining(bill: Pick<PurchaseBill, "id" | "net_total" | "vat_total">, all: Pick<PurchaseBill, "original_bill_id" | "status" | "net_total" | "vat_total">[]) {
  const dns = all.filter((d) => d.original_bill_id === bill.id && d.status === "posted");
  return { net: bill.net_total - dns.reduce((s, d) => s + d.net_total, 0), vat: bill.vat_total - dns.reduce((s, d) => s + d.vat_total, 0) };
}

export const ALLOWED_UPLOADS: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SIGNED_LINK_SECONDS = 60;                                     // SEC-20

/** Why a file cannot be attached (null = fine). PDF, JPG or PNG up to 10 MB (S-2.5). */
export function uploadProblem(file: { type: string; size: number }): string | null {
  if (!ALLOWED_UPLOADS[file.type]) return "Attach a PDF, JPG or PNG of the supplier's invoice.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 10 MB.";
  return null;
}

/** SEC-13: what the file really is, from its first bytes (a renamed .exe is not a PDF). */
export function sniffMime(head: Uint8Array): string | null {
  const starts = (...b: number[]) => b.every((x, i) => head[i] === x);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";                     // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}
/** Why the content does not match what the file claims to be (null = it matches). */
export function contentProblem(head: Uint8Array, claimed: string): string | null {
  const real = sniffMime(head);
  return real === claimed ? null : "This file is not a real PDF, JPG or PNG (its content does not match its name) — it was not uploaded.";
}

/** Private storage path: {organization}/bills/{bill}/{sha256}.{ext} — the folder decides who can read it. */
export const attachmentPath = (orgId: string, billId: string, sha256: string, mime: string) => `${orgId}/bills/${billId}/${sha256}.${ALLOWED_UPLOADS[mime]}`;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Data access ─────────────────────────────────────────────────────────────────────────
export async function listBills(orgId: string): Promise<BillWithDetails[]> {
  const r = await db().from("purchase_bills")
    .select("*, purchase_bill_lines(*), bill_checks(*), attachments(*), contacts!purchase_bills_contact_id_organization_id_fkey(name), preparer:profiles!purchase_bills_prepared_by_fkey(full_name), approver:profiles!purchase_bills_approved_by_fkey(full_name)")
    .eq("organization_id", orgId).order("bill_date", { ascending: false }).order("created_at", { ascending: false });
  if (r.error) throw r.error;
  type Row = PurchaseBill & { purchase_bill_lines: BillLine[] | null; bill_checks: BillCheck[] | null; attachments: Attachment[] | null;
    contacts: { name: string } | null; preparer: { full_name: string } | null; approver: { full_name: string } | null };
  return ((r.data ?? []) as unknown as Row[]).map(({ purchase_bill_lines, bill_checks, attachments, contacts, preparer, approver, ...b }) => ({
    ...b, lines: [...(purchase_bill_lines ?? [])].sort((a, c) => a.line_no - c.line_no),
    checks: [...(bill_checks ?? [])].sort((a, c) => Number(a.passed) - Number(c.passed) || a.check_code.localeCompare(c.check_code)),
    attachments: attachments ?? [], supplier: contacts?.name ?? "", preparer: preparer?.full_name ?? null, approver: approver?.full_name ?? null,
  }));
}

export interface BillDraft {
  doc_type: "bill" | "debit_note"; contact_id: string; supplier_invoice_no: string; bill_date: string; due_date: string | null;
  currency: "AED" | "USD"; original_bill_id: string | null; supplier_trn_on_invoice: string; has_tax_invoice_heading: boolean; notes: string;
  lines: { description: string; quantity: string; unit_price: number; account_id: string; tax_code: string }[];
}
export async function saveBill(orgId: string, id: string | null, doc: BillDraft): Promise<string> {
  const r = await db().rpc("save_purchase_bill", { p_id: id as unknown as string /* null = new */, p_organization_id: orgId, p_doc: doc as never });
  if (r.error) throw r.error;
  return r.data as string;
}
const call = async (fn: "submit_purchase_bill" | "delete_purchase_bill", id: string) => { const r = await db().rpc(fn, { p_id: id }); if (r.error) throw r.error; };
export const submitBill = (id: string) => call("submit_purchase_bill", id);
export const deleteBill = (id: string) => call("delete_purchase_bill", id);
export async function postBill(id: string, overrideReason?: string): Promise<string> {
  const r = await db().rpc("post_purchase_bill", { p_id: id, ...(overrideReason ? { p_override_reason: overrideReason } : {}) });
  if (r.error) throw r.error;
  return r.data as string;
}
export async function sendBackBill(id: string, reason: string) { const r = await db().rpc("reject_purchase_bill", { p_id: id, p_reason: reason }); if (r.error) throw r.error; }

/** Uploads the supplier's invoice to private storage and records it (the same file twice is refused, DM-08). */
export async function attachToBill(orgId: string, billId: string, file: File): Promise<void> {
  const problem = uploadProblem(file);
  if (problem) throw new Error(problem);
  const data = await file.arrayBuffer();
  const wrong = contentProblem(new Uint8Array(data.slice(0, 16)), file.type);
  if (wrong) throw new Error(wrong);
  const sha = await sha256Hex(data);
  const path = attachmentPath(orgId, billId, sha, file.type);
  const dupe = await db().from("attachments").select("id").eq("organization_id", orgId).eq("sha256", sha).maybeSingle();
  if (dupe.data) throw new Error("This exact file is already attached to a document of this client.");
  const up = await db().storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error && !/exists/i.test(up.error.message)) throw up.error;
  const r = await db().from("attachments").insert({
    organization_id: orgId, storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size, sha256: sha, purchase_bill_id: billId,
  });
  if (r.error) throw r.error;
}

/** A short-lived private link to view an attachment: 60 seconds (SEC-20). */
export async function attachmentUrl(path: string): Promise<string> {
  const r = await db().storage.from("documents").createSignedUrl(path, SIGNED_LINK_SECONDS);
  if (r.error) throw r.error;
  return r.data.signedUrl;
}
