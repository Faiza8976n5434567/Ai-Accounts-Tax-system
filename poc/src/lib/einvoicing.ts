/** E-invoicing per client (D-63): the client's ASP, hand-offs of PINT AE files (manual today, API per ASP later) and each
 *  document's e-invoice status. The database records hand-offs only through its functions and never deletes them. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";
import type { Readiness } from "./einvoice-ready";

export type AspProvider = Database["public"]["Tables"]["asp_providers"]["Row"];
export type Submission = Database["public"]["Tables"]["einvoice_submissions"]["Row"];
export const ASP_STATUS: [string, string][] = [["not_started", "Not started"], ["onboarding", "Onboarding"], ["sandbox", "Testing in the ASP's sandbox"], ["live", "Live"]];

/** Where a document stands (derived; the latest hand-off decides). */
export type EinvState = "not_in_scope" | "needs_fixing" | "to_send" | "sent" | "rejected" | "accepted";
export function einvState(readiness: Readiness, subs: Submission[]): EinvState {
  if (readiness.status === "not_in_scope") return "not_in_scope";
  const last = [...subs].sort((a, b) => b.attempt - a.attempt)[0];
  if (last?.status === "accepted") return "accepted";
  if (last?.status === "sent") return "sent";
  if (readiness.status === "missing") return "needs_fixing";
  return last?.status === "rejected" ? "rejected" : "to_send";
}
export const STATE_LABEL: Record<EinvState, [string, "slate" | "amber" | "sky" | "rose" | "emerald"]> = {
  not_in_scope: ["Not in scope (B2C)", "slate"], needs_fixing: ["Needs fixing", "amber"], to_send: ["Ready to send", "sky"],
  sent: ["Sent — waiting for the ASP", "sky"], rejected: ["Rejected — fix and resend", "rose"], accepted: ["Accepted", "emerald"],
};

/** SHA-256 of the file handed over (hex), so the record proves exactly which file went to the ASP. */
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
export async function listAspProviders(): Promise<AspProvider[]> {
  const r = await db().from("asp_providers").select("*").order("name");
  if (r.error) throw r.error;
  return r.data ?? [];
}
export async function listSubmissions(orgId: string): Promise<Submission[]> {
  const r = await db().from("einvoice_submissions").select("*").eq("organization_id", orgId).order("sent_at", { ascending: false });
  if (r.error) throw r.error;
  return r.data ?? [];
}
export async function saveClientAsp(orgId: string, v: { asp_provider_id: string | null; asp_account_ref: string | null; asp_status: string; asp_live_from: string | null }) {
  const r = await db().from("organizations").update(v).eq("id", orgId).select("id");
  if (r.error) throw r.error;
  if (!r.data || r.data.length === 0) throw new Error("Not saved — only a Firm Admin can change the client's ASP.");
}
export async function recordSent(invoiceId: string, xml: string, aspReference: string): Promise<string> {
  const r = await db().rpc("record_einvoice_sent", { p_invoice_id: invoiceId, p_xml_sha256: await sha256Hex(xml), p_asp_reference: aspReference });
  if (r.error) throw r.error;
  return r.data as string;
}
export async function recordResult(submissionId: string, status: "accepted" | "rejected", reason: string, aspReference: string) {
  const r = await db().rpc("record_einvoice_result", { p_submission_id: submissionId, p_status: status, p_reason: reason, p_asp_reference: aspReference });
  if (r.error) throw r.error;
}
