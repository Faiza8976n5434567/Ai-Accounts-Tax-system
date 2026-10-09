/** Items list for one client (P4-04, D-60): products and services with the codes e-invoices need. */
import { useCallback, useMemo, useState } from "react";
import { Package, Pencil, Plus } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { EXEMPTION_REASONS, emptyItem, fromItem, itemProblems, ITEM_TYPES, listItems, SALES_CODES, saveItem, UNITS, type Item, type ItemInput, type ItemType } from "../lib/items";
import { friendlyDbError } from "../lib/journals";
import { fmt } from "../lib/money";
import type { Account } from "../lib/clients";
import { useLoad } from "./hooks";
import { useToast } from "./toast";

const TYPE_LABEL = Object.fromEntries(ITEM_TYPES) as Record<ItemType, string>;
const UNIT_LABEL = Object.fromEntries(UNITS) as Record<string, string>;

export function ItemsTab({ orgId, accounts, canEdit }: { orgId: string; accounts: Account[]; canEdit: boolean }) {
  const fetchItems = useCallback(() => listItems(orgId), [orgId]);
  const { data, error, reload } = useLoad(fetchItems);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const items = useMemo(() => data ?? [], [data]);
  const shown = useMemo(() => items.filter((i) => i.is_active !== showInactive && (!q.trim() || `${i.name} ${i.code ?? ""} ${i.hs_code ?? ""} ${i.sac_code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))),
    [items, q, showInactive]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`])), [accounts]);

  return (
    <>
      <Card title="Items" icon={<Package size={16} />} pad={false}
        sub="Products and services this client sells. Goods carry an HS code, services a service accounting code — e-invoices need them (PINT AE). Pick an item on an invoice line and its codes, unit and price fill in."
        actions={canEdit && <button className="btn-primary bg-emerald-600" onClick={() => setEditing("new")}><Plus size={15} />Item</button>}>
        <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
          {[false, true].map((v) => (
            <button key={String(v)} onClick={() => setShowInactive(v)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${showInactive === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{v ? "Inactive" : "Active"}</button>
          ))}
          <input aria-label="Search items" placeholder="Search name or code" className="ms-auto rounded-xl border border-slate-200 px-3 py-1.5 text-sm w-64 max-w-full" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load items.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[860px]">
          <thead><tr><th className="th">Item</th><th className="th">Type</th><th className="th">HS / service code</th><th className="th">Unit</th><th className="th text-end">Price</th><th className="th">Tax</th><th className="th">Income account</th>{canEdit && <th className="th"><span className="sr-only">Edit</span></th>}</tr></thead>
          <tbody>
            {!data && <tr><td className="td text-slate-500" colSpan={8}>Loading…</td></tr>}
            {data && shown.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>{items.length ? "No items match." : "No items yet — add the products and services this client sells."}</td></tr>}
            {shown.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/70">
                <td className="td"><div className="font-medium">{i.name}{i.code && <span className="ms-2 font-mono text-xs text-slate-500">{i.code}</span>}</div>{i.description && <div className="text-xs text-slate-500">{i.description}</div>}</td>
                <td className="td">{TYPE_LABEL[i.item_type as ItemType]}</td>
                <td className="td font-mono text-xs">{[i.hs_code && `HS ${i.hs_code}`, i.sac_code && `SAC ${i.sac_code}`].filter(Boolean).join(" · ")}</td>
                <td className="td">{UNIT_LABEL[i.unit_code] ?? i.unit_code}</td>
                <td className="td text-end num">{i.default_price ? fmt(i.default_price) : ""}</td>
                <td className="td">{i.tax_code}{i.tax_code === "EX" && i.exemption_reason && <Badge className="ms-1">{i.exemption_reason}</Badge>}</td>
                <td className="td text-xs text-slate-600">{i.income_account_id ? accountName.get(i.income_account_id) : ""}</td>
                {canEdit && <td className="td text-end"><button aria-label={`Edit ${i.name}`} className="btn-ghost !py-1 !px-2" onClick={() => setEditing(i)}><Pencil size={13} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      {editing && <ItemForm orgId={orgId} item={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ItemForm({ orgId, item, accounts, onClose, onSaved }: { orgId: string; item: Item | null; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<ItemInput>(item ? fromItem(item) : emptyItem());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const income = accounts.filter((a) => a.is_active && !a.is_control && a.type === "revenue");
  const save = async () => {
    const problems = itemProblems(f);
    if (problems.length) { setError(problems[0]); return; }
    setBusy(true); setError(null);
    try { await saveItem(orgId, item?.id ?? null, f); toast(item ? "Item updated" : `${f.name.trim()} added`); onSaved(); }
    catch (e) { setError(friendlyDbError(e).replace("That code is already used in this client's chart of accounts.", "An item with this name already exists for this client.")); }
    finally { setBusy(false); }
  };
  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  const lbl = (t: string) => <span className="block text-xs font-medium text-slate-600 mb-1.5">{t}</span>;
  return (
    <Modal open wide onClose={onClose} title={item ? `Edit ${item.name}` : "New item"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{lbl("Name")}<input aria-label="Item name" className={cls} value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>{lbl("Your item code (optional)")}<input aria-label="Item code" className={cls} value={f.code} onChange={(e) => set("code", e.target.value)} /></label>
        <label className="sm:col-span-2">{lbl("Description (printed and sent on the e-invoice)")}<input aria-label="Item description" className={cls} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label>{lbl("Goods or services")}
          <select aria-label="Item type" className={cls} value={f.itemType} onChange={(e) => set("itemType", e.target.value as ItemType)}>{ITEM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>{lbl("Unit")}
          <select aria-label="Unit" className={cls} value={f.unitCode} onChange={(e) => set("unitCode", e.target.value)}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l} ({v})</option>)}</select></label>
        {f.itemType !== "S" && <label>{lbl("HS code (customs tariff)")}<input aria-label="HS code" inputMode="numeric" className={cls} value={f.hsCode} onChange={(e) => set("hsCode", e.target.value)} placeholder="e.g. 84713000" /></label>}
        {f.itemType !== "G" && <label>{lbl("Service accounting code")}<input aria-label="Service accounting code" className={cls} value={f.sacCode} onChange={(e) => set("sacCode", e.target.value)} placeholder="e.g. 998311" /></label>}
        <label>{lbl("Default price (AED, before VAT)")}<input aria-label="Default price" inputMode="decimal" className={`${cls} text-end`} value={f.defaultPrice} onChange={(e) => set("defaultPrice", e.target.value)} /></label>
        <label>{lbl("Tax code")}
          <select aria-label="Tax code" className={cls} value={f.taxCode} onChange={(e) => set("taxCode", e.target.value)}>{SALES_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {f.taxCode === "EX" && <label>{lbl("Exemption reason")}
          <select aria-label="Exemption reason" className={cls} value={f.exemptionReason} onChange={(e) => set("exemptionReason", e.target.value)}>
            <option value="">Choose…</option>{EXEMPTION_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        <label>{lbl("Income account")}
          <select aria-label="Income account" className={cls} value={f.incomeAccountId} onChange={(e) => set("incomeAccountId", e.target.value)}>
            <option value="">— choose on the invoice —</option>{income.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        {item && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />Active</label>}
      </div>
    </Modal>
  );
}
