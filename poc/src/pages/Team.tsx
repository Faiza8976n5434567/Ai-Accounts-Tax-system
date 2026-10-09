/** Users & invites (P1-10 · Spec 03 §3 "Users & invites" · D-24). Live data from Supabase. */
import { useState, type FormEvent } from "react";
import { Copy, MailCheck, MailWarning, UserPlus, Users, XCircle } from "lucide-react";
import { useToast } from "../live/toast";
import { roleLabel, shortDate } from "../lib/email";
import { inviteDisplayStatus, inviteStaff, loadTeam, markInviteLinkCopied, revokeInvitation, type InviteResult, type Invitation, type StaffMember } from "../lib/team";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { useLoad } from "../live/hooks";

const STATUS_TONE: Record<string, string> = { pending: "amber", accepted: "emerald", revoked: "slate", expired: "rose" };

export function TeamPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(loadTeam);
  const staff: StaffMember[] = data?.staff ?? [];
  const invitations: Invitation[] = data?.invitations ?? [];
  const canInviteAdmins = data?.meIsSuperAdmin ?? false;
  const loadError = error ? "Could not load the team. Check your connection and try again." : null;
  const refresh = async () => reload();
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<(InviteResult & { email: string }) | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);


  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      await markInviteLinkCopied(result.invitationId);
      toast("Invite link copied — it works once and expires on " + shortDate(result.expiresAt));
      void refresh();
    } catch { toast("Could not copy the link", "err"); }
  };

  return (
    <>
      <PageHeader eyebrow="Settings" title="Users & invites" sub="Firm staff who can sign in, and invitations waiting to be accepted"
        actions={<button className="btn-primary bg-emerald-600" onClick={() => { setResult(null); setInviting(true); }}><UserPlus size={15} />Invite staff</button>} />
      {loadError && <p role="alert" className="mb-4 text-sm text-rose-700">{loadError}</p>}
      <div className="grid gap-5 grid-cols-[minmax(0,1fr)] max-w-5xl">
        <Card title="Firm staff" sub="People who can sign in to this firm" icon={<Users size={16} />} pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th></tr></thead>
            <tbody>
              {loading && <tr><td className="td text-slate-500" colSpan={4}>Loading…</td></tr>}
              {staff.map((s) => (
                <tr key={s.userId}>
                  <td className="td font-medium">{s.fullName}</td>
                  <td className="td text-slate-600">{s.email}</td>
                  <td className="td">{roleLabel(s.role)}{s.isSuperAdmin && <Badge tone="indigo" className="ms-2">Super Admin</Badge>}</td>
                  <td className="td">{s.active && s.status === "active" ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Suspended</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card title="Invitations" sub="An invitation becomes a membership when the person first signs in" icon={<MailCheck size={16} />} pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Invited</th><th className="th">Role</th><th className="th">Status</th><th className="th">Expires</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {!loading && invitations.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No invitations yet.</td></tr>}
              {invitations.map((i) => {
                const status = inviteDisplayStatus(i.status, i.expiresAt);
                return (
                  <tr key={i.id}>
                    <td className="td"><div className="font-medium">{i.fullName ?? i.email}</div><div className="text-xs text-slate-500">{i.email}</div></td>
                    <td className="td">{roleLabel(i.role)}</td>
                    <td className="td"><Badge tone={STATUS_TONE[status] ?? "slate"} dot>{status[0].toUpperCase() + status.slice(1)}</Badge>{i.linkCopiedAt && status === "pending" && <span className="ms-2 text-xs text-slate-500">link copied</span>}</td>
                    <td className="td text-slate-600">{shortDate(i.expiresAt)}</td>
                    <td className="td text-end">{status === "pending" && <button className="btn-ghost !py-1 !px-2.5 text-xs" onClick={() => setRevoking(i)}><XCircle size={13} />Revoke</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="px-5 py-3 text-xs text-slate-500">Lost a link? Revoke the invitation and invite the person again — links are shown only once, for security.</p>
        </Card>
      </div>

      {inviting && <InviteModal open canInviteAdmins={canInviteAdmins} result={result} onClose={() => setInviting(false)} onCopy={copyLink}
        onInvited={(r) => { setResult(r); void refresh(); }} />}

      <Modal open={!!revoking} onClose={() => setRevoking(null)} title="Revoke invitation?"
        footer={<><button className="btn-ghost" onClick={() => setRevoking(null)}>Cancel</button>
          <button className="btn-danger" onClick={async () => {
            if (!revoking) return;
            try { await revokeInvitation(revoking.id); toast("Invitation revoked"); } catch { toast("Could not revoke the invitation", "err"); }
            setRevoking(null); void refresh();
          }}>Revoke</button></>}>
        <p className="text-sm text-slate-600">The link sent to <b>{revoking?.email}</b> will no longer give access to the firm.</p>
      </Modal>
    </>
  );
}

function InviteModal({ open, canInviteAdmins, result, onClose, onCopy, onInvited }: {
  open: boolean; canInviteAdmins: boolean; result: (InviteResult & { email: string }) | null;
  onClose: () => void; onCopy: () => void; onInvited: (r: InviteResult & { email: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("firm_accountant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { onInvited({ ...(await inviteStaff({ email: email.trim(), fullName: fullName.trim(), role })), email: email.trim() }); }
    catch (err) { setError(err instanceof Error ? err.message : "The invitation could not be sent."); }
    finally { setBusy(false); }
  };

  if (result) return (
    <Modal open={open} onClose={onClose} title="Invitation created"
      footer={<><button className="btn-ghost" onClick={onClose}>Done</button><button className="btn-primary bg-emerald-600" onClick={onCopy}><Copy size={15} />Copy invite link</button></>}>
      {result.emailSent
        ? <p className="text-sm text-slate-700 flex gap-2"><MailCheck size={16} className="shrink-0 mt-0.5 text-emerald-600" />An invitation email was sent to <b>{result.email}</b>.</p>
        : <p className="text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2 flex gap-2"><MailWarning size={16} className="shrink-0 mt-0.5" />{result.emailNote ?? "The email could not be sent."}</p>}
      <p className="text-sm text-slate-600 mt-3">You can also copy the link and send it yourself (WhatsApp, Outlook). It works <b>once</b> and expires on <b>{shortDate(result.expiresAt)}</b>. It is shown only now.</p>
    </Modal>
  );

  return (
    <Modal open={open} onClose={onClose} title="Invite firm staff"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" form="invite-form" type="submit" disabled={busy || !email || !fullName}><UserPlus size={15} />{busy ? "Inviting…" : "Send invitation"}</button></>}>
      <form id="invite-form" onSubmit={submit} noValidate>
        {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
        <label className="block mb-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Full name</span>
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" /></label>
        <label className="block mb-3"><span className="block text-xs font-medium text-slate-600 mb-1.5">Email</span>
          <input type="email" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
        <label className="block mb-1"><span className="block text-xs font-medium text-slate-600 mb-1.5">Role</span>
          <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="firm_accountant">Firm Accountant — prepares work on assigned clients</option>
            {canInviteAdmins && <option value="firm_admin">Firm Admin — approves, locks periods, manages clients</option>}
          </select></label>
        {!canInviteAdmins && <p className="text-xs text-slate-500">Only a Super Admin can invite a Firm Admin.</p>}
      </form>
    </Modal>
  );
}
