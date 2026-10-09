/** Firm staff and invitations (P1-10). Reads go through RLS; changes go through database
 *  functions or the /api/invite server function — never direct table writes. */
import { supabase } from "./supabase";

export interface StaffMember { userId: string; fullName: string; email: string; role: string; active: boolean; isSuperAdmin: boolean; status: string }
export interface Invitation { id: string; email: string; fullName: string | null; role: string; status: string; expiresAt: string; linkCopiedAt: string | null; createdAt: string }
export interface InviteResult { invitationId: string; link: string; expiresAt: string; emailSent: boolean; emailNote: string | null }

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };

export async function loadTeam(): Promise<{ staff: StaffMember[]; invitations: Invitation[]; meIsSuperAdmin: boolean }> {
  const sb = db();
  const { data: auth } = await sb.auth.getUser();
  const [members, invites] = await Promise.all([
    sb.from("firm_members").select("user_id, role, active, profiles!firm_members_user_id_fkey(full_name, email, is_super_admin, status)").order("role"),
    sb.from("invitations").select("id, email, full_name, role, status, expires_at, link_copied_at, created_at").is("organization_id", null).order("created_at", { ascending: false }),
  ]);
  if (members.error) throw members.error;
  if (invites.error) throw invites.error;
  const staff = (members.data ?? []).map((m) => ({
    userId: m.user_id, role: m.role, active: m.active,
    fullName: m.profiles?.full_name ?? "", email: m.profiles?.email ?? "",
    isSuperAdmin: m.profiles?.is_super_admin ?? false, status: m.profiles?.status ?? "active",
  }));
  return {
    staff,
    invitations: (invites.data ?? []).map((i) => ({ id: i.id, email: i.email, fullName: i.full_name, role: i.role, status: i.status, expiresAt: i.expires_at, linkCopiedAt: i.link_copied_at, createdAt: i.created_at })),
    meIsSuperAdmin: staff.some((s) => s.userId === auth.user?.id && s.isSuperAdmin),
  };
}

export async function inviteStaff(input: { email: string; fullName: string; role: string }): Promise<InviteResult> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<InviteResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "The invitation could not be sent.");
  return body as InviteResult;
}

export async function markInviteLinkCopied(invitationId: string): Promise<void> {
  const { error } = await db().rpc("mark_invite_link_copied", { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await db().rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}

/** An invitation still pending after its expiry date is shown as expired. */
export const inviteDisplayStatus = (status: string, expiresAt: string, now: number = Date.now()): string =>
  status === "pending" && new Date(expiresAt).getTime() <= now ? "expired" : status;
