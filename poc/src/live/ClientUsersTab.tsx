/** Client logins for one company (P3-06 · D-48, D-49): who has access, invite Owner/Staff/Read-only, remove access. */
import { useCallback, useEffect, useState } from "react";
import { Copy, UserMinus, UserPlus, Users, XCircle } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { useAuth } from "../components/AuthGate";
import { roleLabel, shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import { myFirmRole, type Client } from "../lib/clients";
import { markInviteLinkCopied, type InviteResult } from "../lib/team";
import {
  addDays, invitableRoles, inviteClientUser, listClientUsers, readOnlyEndProblem, readOnlyLimits, removeClientUser, revokeClientInvitation, type ClientUser,
} from "../lib/clientUsers";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const TONE: Record<ClientUser["status"], "emerald" | "amber" | "slate" | "rose"> = { active: "emerald", pending: "amber", ended: "slate", expired: "slate", suspended: "rose" };
const STATUS_LABEL: Record<ClientUser["status"], string> = { active: "Active", pending: "Invited", ended: "Access ended", expired: "Invitation expired", suspended: "Suspended" };

export function ClientUsersTab({ client, perms }: { client: Client; perms: string[] }) {
  const auth = useAuth()!;
  const toast = useToast();
  const fetchUsers = useCallback(() => listClientUsers(client.id), [client.id]);
  const { data: users, reload } = useLoad(fetchUsers);
  const { data: firmRole } = useLoad(myFirmRole);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<ClientUser | null>(null);
  const canInvite = perms.includes("invite_client_users");
  const isFirmAdmin = firmRole === "firm_admin";

  return (
    <>
      <Card title="Client users" icon={<Users size={16} />} pad={false}
        sub="People from the client company who can sign in to see their own books. Everyone uses two-factor sign-in (D-48). Read-only access (e.g. auditors) ends automatically (D-49)."
        actions={canInvite && <button className="btn-primary bg-emerald-600" onClick={() => setInviting(true)}><UserPlus size={15} />Invite</button>}>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Access until</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!users && <tr><td className="td text-slate-500" colSpan={6}>Loading…</td></tr>}
            {users?.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No client logins yet.</td></tr>}
            {users?.map((u) => (
              <tr key={u.kind + u.id}>
                <td className="td">{u.full_name ?? "—"}</td><td className="td text-sm">{u.email}</td><td className="td">{roleLabel(u.role)}</td>
                <td className="td"><Badge tone={TONE[u.status]} dot>{STATUS_LABEL[u.status]}</Badge></td>
                <td className="td text-sm">{u.valid_to ? shortDate(u.valid_to) : "No end date"}</td>
                <td className="td text-end">{canInvite && (u.kind === "invitation"
                  ? u.status === "pending" && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => void revokeClientInvitation(u.id).then(() => { toast("Invitation revoked"); reload(); }, (e) => toast(friendlyDbError(e), "err"))}><XCircle size={13} />Revoke</button>
                  : u.email !== auth.email && (isFirmAdmin || u.role !== "client_owner") && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setRemoving(u)}><UserMinus size={13} />Remove</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      {inviting && <InviteClientUser client={client} isFirmAdmin={isFirmAdmin} onClose={() => setInviting(false)} onDone={() => { reload(); }} />}
      {removing && <RemoveUser user={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); toast("Access removed"); reload(); }} />}
    </>
  );
}

function InviteClientUser({ client, isFirmAdmin, onClose, onDone }: { client: Client; isFirmAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const roles = invitableRoles(isFirmAdmin);
  const [f, setF] = useState({ fullName: "", email: "", role: roles[roles.length > 2 ? 1 : 0] as string, validTo: "" });
  const [limits, setLimits] = useState({ defaultDays: 90, maxDays: 365 });
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void readOnlyLimits(client.firm_id).then((l) => { if (live) setLimits(l); }); return () => { live = false; }; }, [client.firm_id]);
  const validTo = f.validTo || addDays(today, limits.defaultDays);
  const send = async () => {
    setError(null);
    if (!f.fullName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setError("Enter the person's name and a valid email address."); return; }
    if (f.role === "read_only") { const p = readOnlyEndProblem(validTo, today, limits.maxDays); if (p) { setError(p); return; } }
    setBusy(true);
    try { setResult(await inviteClientUser(client.id, { email: f.email.trim(), fullName: f.fullName.trim(), role: f.role, validTo: f.role === "read_only" ? validTo : null })); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "The invitation could not be sent."); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.link).catch(() => {});
    void markInviteLinkCopied(result.invitationId).catch(() => {});
    toast("Invite link copied — send it to the person yourself");
  };
  return (
    <Modal open onClose={onClose} title={`Invite to ${client.legal_name}`}
      footer={result ? <button className="btn-primary bg-emerald-600" onClick={onClose}>Done</button>
        : <><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void send()}><UserPlus size={15} />{busy ? "Sending…" : "Send invitation"}</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {result ? (
        <div className="space-y-3 text-sm">
          <p>{result.emailSent ? `An invitation email was sent to ${f.email}.` : result.emailNote ?? "The email could not be sent."}</p>
          <div className="flex gap-2"><input aria-label="Invite link" readOnly className={`${cls} font-mono text-xs`} value={result.link} /><button className="btn-ghost" onClick={() => void copy()}><Copy size={15} />Copy</button></div>
          <p className="text-xs text-slate-500">The link works once and expires on {shortDate(result.expiresAt)}. On first sign-in the person sets a password and two-factor sign-in.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Full name</span><input aria-label="Full name" className={cls} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Email</span><input aria-label="Email" type="email" className={cls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Role</span>
            <select aria-label="Role" className={cls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
          {f.role === "read_only" && <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Access ends on (at most {limits.maxDays} days ahead)</span>
            <input aria-label="Access ends on" type="date" className={cls} value={validTo} min={today} max={addDays(today, limits.maxDays)} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></label>}
          <p className="text-xs text-slate-500">
            {f.role === "client_owner" ? "A Client Owner sees the company's books, approves its bills and invoices, and can invite its own staff." :
             f.role === "client_staff" ? "Client Staff can enter draft invoices and bills and upload documents; they cannot approve or record payments." :
             "Read-only users (e.g. auditors) can only view and export, until the end date."}</p>
        </div>
      )}
    </Modal>
  );
}

function RemoveUser({ user, onClose, onDone }: { user: ClientUser; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`Remove ${user.full_name ?? user.email}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" disabled={!reason.trim()} onClick={() => void removeClientUser(user.id, reason.trim()).then(onDone, (e) => setError(friendlyDbError(e)))}><UserMinus size={15} />Remove access</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">They will no longer be able to see {roleLabel(user.role) === "Read-only" ? "anything" : "this company's books"}. The audit trail keeps the record.</p>
      <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Reason</span><textarea aria-label="Reason" className={cls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Modal>
  );
}
