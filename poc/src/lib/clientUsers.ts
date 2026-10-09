/** Client logins (P3-06 · D-48, D-49). The database decides who may invite or remove whom; this file only calls it. */
import { supabase } from "./supabase";
import type { InviteResult } from "./team";

export interface ClientUser {
  kind: "member" | "invitation"; id: string; full_name: string | null; email: string; role: "client_owner" | "client_staff" | "read_only";
  valid_from: string | null; valid_to: string | null; status: "active" | "ended" | "suspended" | "pending" | "expired"; invited_by_name: string | null; created_at: string;
}

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

export async function listClientUsers(orgId: string): Promise<ClientUser[]> {
  const r = await db().rpc("client_users", { p_organization_id: orgId });
  if (r.error) throw r.error;
  return (r.data ?? []) as unknown as ClientUser[];
}

export async function inviteClientUser(orgId: string, input: { email: string; fullName: string; role: string; validTo: string | null }): Promise<InviteResult> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ email: input.email, fullName: input.fullName, role: input.role, organizationId: orgId, ...(input.validTo ? { validTo: input.validTo } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<InviteResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "The invitation could not be sent.");
  return body as InviteResult;
}

export async function removeClientUser(membershipId: string, reason: string) {
  const r = await db().rpc("remove_client_user", { p_membership_id: membershipId, p_reason: reason });
  if (r.error) throw r.error;
}
export async function revokeClientInvitation(invitationId: string) {
  const r = await db().rpc("revoke_client_invitation", { p_invitation_id: invitationId });
  if (r.error) throw r.error;
}
export async function readOnlyLimits(firmId: string): Promise<{ defaultDays: number; maxDays: number }> {
  const r = await db().from("firm_settings").select("key, value").eq("firm_id", firmId).in("key", ["read_only_default_days", "read_only_max_days"]);
  const get = (k: string, d: number) => Number(r.data?.find((x) => x.key === k)?.value ?? d);
  return { defaultDays: get("read_only_default_days", 90), maxDays: get("read_only_max_days", 365) };
}

// ── Pure rules (unit-tested) ────────────────────────────────────────────────────────────
/** A date `days` after `today` (YYYY-MM-DD, calendar arithmetic in UTC). */
export function addDays(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Roles the current user may invite (the database checks again): Firm Admin → all three; Client Owner → Staff & Read-only. */
export function invitableRoles(isFirmAdmin: boolean): ("client_owner" | "client_staff" | "read_only")[] {
  return isFirmAdmin ? ["client_owner", "client_staff", "read_only"] : ["client_staff", "read_only"];
}
/** D-49: why a read-only end date is not allowed (null = fine). */
export function readOnlyEndProblem(end: string, today: string, maxDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return "Choose the date the access ends.";
  if (end < today) return "The end date cannot be in the past.";
  if (end > addDays(today, maxDays)) return `Read-only access can last at most ${maxDays} days (until ${addDays(today, maxDays)}).`;
  return null;
}
