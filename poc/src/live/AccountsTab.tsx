/** Chart of accounts for one client: view, add, rename, deactivate (P1-14 · Firm Admin: manage_coa). */
import { useState } from "react";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import type { Account } from "../lib/clients";
import { addAccount, friendlyDbError, updateAccount } from "../lib/journals";
import { useToast } from "./toast";

const TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
const CT_TAGS: [string, string][] = [["", "— none —"], ["ENTERTAINMENT_50", "Client entertainment (partly disallowed)"], ["FINES_PENALTIES", "Fines and penalties"],
  ["DONATION_NON_QPBE", "Donations to non-qualifying bodies"], ["NON_DEDUCTIBLE", "Non-deductible / personal"], ["CT_EXPENSE", "Corporate tax expense"]];

export function AccountsTab({ orgId, accounts, canManage, reload }: { orgId: string; accounts: Account[]; canManage: boolean; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  return (
    <>
      <Card title="Chart of accounts" icon={<BookOpen size={16} />} pad={false}
        sub="Control accounts (receivables, payables, VAT, bank, customer credits) are posted by their own documents or the opening journal, not by manual journals. Accounts are never deleted — deactivate instead."
        actions={canManage && <button className="btn-primary bg-emerald-600" onClick={() => setEditing("new")}><Plus size={15} />Add account</button>}>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead><tr><th className="th">Code</th><th className="th">Name</th><th className="th">Type</th><th className="th">Group</th><th className="th">Corporate Tax</th><th className="th">Status</th>{canManage && <th className="th"><span className="sr-only">Edit</span></th>}</tr></thead>
          <tbody>{accounts.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50/70">
              <td className="td font-mono">{a.code}</td>
              <td className="td">{a.name}{a.is_control && <Badge tone="indigo" className="ms-2">Control</Badge>}</td>
              <td className="td capitalize">{a.type}</td>
              <td className="td text-slate-600">{a.report_group}</td>
              <td className="td text-xs text-slate-600">{CT_TAGS.find(([k]) => k === a.ct_tag)?.[1] ?? ""}</td>
              <td className="td">{a.is_active ? <Badge tone="emerald" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</td>
              {canManage && <td className="td text-end"><button aria-label={`Edit ${a.code}`} className="btn-ghost !py-1 !px-2" onClick={() => setEditing(a)}><Pencil size={13} /></button></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      {editing && <AccountForm orgId={orgId} account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </>
  );
}

function AccountForm({ orgId, account, onClose, onSaved }: { orgId: string; account: Account | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [f, setF] = useState({ code: account?.code ?? "", name: account?.name ?? "", type: account?.type ?? "expense", group: account?.report_group ?? "", ctTag: account?.ct_tag ?? "", active: account?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (!account && !/^[0-9A-Za-z.-]{1,20}$/.test(f.code.trim())) { setError("Code: up to 20 letters, digits, dots or dashes."); return; }
    if (!f.name.trim()) { setError("Enter a name."); return; }
    setBusy(true);
    try {
      if (account) await updateAccount(account.id, { name: f.name, report_group: f.group, ct_tag: f.ctTag || null, is_active: f.active });
      else await addAccount(orgId, { code: f.code, name: f.name, type: f.type, report_group: f.group, ct_tag: f.ctTag || null });
      toast(account ? "Account updated" : "Account added");
      await onSaved();
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };
  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  return (
    <Modal open onClose={onClose} title={account ? `Edit ${account.code}` : "Add account"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Code</span><input className={cls} value={f.code} disabled={!!account} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Type</span>
          <select className={cls} value={f.type} disabled={!!account} onChange={(e) => setF({ ...f, type: e.target.value as Account["type"] })}>{TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Name</span><input className={cls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Report group</span><input className={cls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} placeholder="e.g. Operating expenses" /></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Corporate Tax treatment</span>
          <select className={cls} value={f.ctTag} onChange={(e) => setF({ ...f, ctTag: e.target.value })}>{CT_TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {account && <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active (inactive accounts reject new postings)</label>}
      </div>
      {account && <p className="mt-3 text-xs text-slate-500">Code and type can't be changed once an account exists; add a new account instead.</p>}
    </Modal>
  );
}
