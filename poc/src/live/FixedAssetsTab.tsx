/** Fixed asset register for one client (P5-04 · F-21, D-68, D-70 → D-74): assets from bills or by hand, the schedule of
 *  each asset, the monthly depreciation run (approved by someone else), disposals and the check against the ledger. */
import { useCallback, useMemo, useState } from "react";
import { Ban, CalendarClock, Pencil, Play, Plus, Truck, Undo2 } from "lucide-react";
import { Badge, Card, Modal } from "../components/ui";
import { fmt, fmtPlain } from "../lib/money";
import { shortDate } from "../lib/email";
import { friendlyDbError } from "../lib/journals";
import type { Account, Client } from "../lib/clients";
import {
  assetPayload, assetRegister, assetSchedule, cancelDisposal, cancelRun, disposeAsset, emptyAsset, fromAsset, listCategories, METHOD_LABEL, METHODS, pctText,
  runDepreciation, saveAsset, setUsage, yearsText, type Asset, type AssetDraft, type Register,
} from "../lib/assets";
import { useLoad, useToday } from "./hooks";
import { useToast } from "./toast";

const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const monthLabel = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const methodLine = (a: Asset) => a.method === "straight_line" ? `${METHOD_LABEL[a.method]}, ${yearsText(a.life_months!)} yrs`
  : a.method === "sum_of_years" ? `${METHOD_LABEL[a.method]}, ${yearsText(a.life_months!)} yrs`
  : a.method === "reducing_balance" ? `${METHOD_LABEL[a.method]} ${pctText(a.rate_bp!)}%${a.life_months ? `, ${yearsText(a.life_months)} yrs` : ""}`
  : `${METHOD_LABEL[a.method]}, ${a.units_total?.toLocaleString("en-AE")} ${a.units_name}`;

export function FixedAssetsTab({ client, accounts, perms }: { client: Client; accounts: Account[]; perms: string[] }) {
  const toast = useToast();
  const today = useToday();
  const [asAt, setAsAt] = useState(today);
  const fetchReg = useCallback(() => assetRegister(client.id, asAt), [client.id, asAt]);
  const { data: reg, error, reload } = useLoad<Register>(fetchReg);
  const [editing, setEditing] = useState<{ asset: Asset | null; draft: AssetDraft; fromBill: boolean } | null>(null);
  const [schedule, setSchedule] = useState<Asset | null>(null);
  const [disposing, setDisposing] = useState<Asset | null>(null);
  const [showDisposed, setShowDisposed] = useState(false);
  const canPrepare = perms.includes("prepare");
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); reload(); } catch (e) { toast(friendlyDbError(e), "err"); } };
  const assets = useMemo(() => (reg?.assets ?? []).filter((a) => showDisposed || a.status === "active"), [reg, showDisposed]);
  const tot = (k: "cost" | "accum" | "nbv") => assets.filter((a) => a.in_books).reduce((s, a) => s + a[k], 0);
  const lastRun = reg?.runs[0];
  const pendingRun = lastRun && lastRun.status !== "posted" && lastRun.status !== "reversed" ? lastRun : null;
  const unitsAssets = (reg?.assets ?? []).filter((a) => a.method === "units" && a.status === "active");

  return (
    <>
      <Card title="Fixed assets" icon={<Truck size={16} />} pad={false}
        sub="Cost, accumulated depreciation and book value of each asset. Click an asset to see its full depreciation schedule."
        actions={<div className="flex flex-wrap items-end gap-2">
          <label><span className="block text-xs font-medium text-slate-600 mb-1">As at</span>
            <input aria-label="As at" type="date" className={`${cls} !w-auto`} value={asAt} onChange={(e) => e.target.value && setAsAt(e.target.value)} /></label>
          {canPrepare && <button className="btn-primary bg-emerald-600" onClick={() => setEditing({ asset: null, draft: emptyAsset(), fromBill: false })}><Plus size={15} />Asset</button>}
        </div>}>
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {[false, true].map((v) => <button key={String(v)} onClick={() => setShowDisposed(v)} className={`rounded-full px-3 py-1 text-xs ring-1 cursor-pointer ${showDisposed === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{v ? "Include disposed" : "In use"}</button>)}
        </div>
        {error !== null && <p role="alert" className="px-5 pb-3 text-sm text-rose-700">Could not load the register.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[960px]">
          <thead><tr><th className="th">No.</th><th className="th">Asset</th><th className="th">Bought</th><th className="th">Method</th><th className="th text-end">Cost</th><th className="th text-end">Accumulated dep.</th><th className="th text-end">Book value</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!reg && <tr><td className="td text-slate-500" colSpan={8}>Loading…</td></tr>}
            {reg && assets.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>No assets yet — add them from purchase bills below or with “+ Asset”.</td></tr>}
            {assets.map((a) => (
              <tr key={a.id} className={`hover:bg-slate-50/70 cursor-pointer ${a.in_books ? "" : "text-slate-400"}`} onClick={() => setSchedule(a)}>
                <td className="td font-mono text-xs">{a.asset_no}</td>
                <td className="td"><div className="font-medium">{a.name}</div>
                  <div className="text-xs text-slate-500">{[a.category_name, a.location, a.tag_no && `Tag ${a.tag_no}`].filter(Boolean).join(" · ")}</div>
                  {a.status === "disposed" && <Badge tone={a.disposal_journal_status === "posted" ? "slate" : "amber"} className="mt-1">{a.disposal_kind === "sold" ? "Sold" : "Scrapped"} {shortDate(a.disposed_on!)}{a.disposal_journal_status === "posted" ? "" : " — waiting for approval"}</Badge>}
                  {a.pending > 0 && <Badge tone="amber" className="mt-1">+ {fmt(a.pending)} waiting for approval</Badge>}</td>
                <td className="td">{shortDate(a.purchase_date)}</td>
                <td className="td text-xs">{methodLine(a)}{a.residual > 0 && <div className="text-slate-500">Residual {fmt(a.residual)}</div>}</td>
                <td className="td text-end num">{fmt(a.cost)}</td><td className="td text-end num">{fmt(a.accum)}</td><td className="td text-end num font-medium">{fmt(a.nbv)}</td>
                <td className="td text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {canPrepare && a.status === "active" && <>
                    <button aria-label={`Edit ${a.name}`} className="btn-ghost !py-1 !px-2" onClick={() => setEditing({ asset: a, draft: fromAsset(a), fromBill: !!a.source_bill_line_id })}><Pencil size={13} /></button>
                    <button aria-label={`Dispose of ${a.name}`} title="Sell or scrap" className="btn-ghost !py-1 !px-2" onClick={() => setDisposing(a)}><Ban size={13} /></button></>}
                  {canPrepare && a.status === "disposed" && a.disposal_journal_status !== "posted" && a.disposal_journal_status !== "reversed" &&
                    <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => void act(() => cancelDisposal(a.id), "Disposal cancelled")}><Undo2 size={13} />Cancel disposal</button>}
                </td>
              </tr>
            ))}
            {assets.length > 0 && <tr className="bg-slate-50 font-semibold"><td className="td" colSpan={4}>Total in the books at {shortDate(asAt)}</td>
              <td className="td text-end num">{fmt(tot("cost"))}</td><td className="td text-end num">{fmt(tot("accum"))}</td><td className="td text-end num">{fmt(tot("nbv"))}</td><td className="td" /></tr>}
          </tbody>
        </table></div>
        {reg && reg.ledger.length > 0 && <div className="px-5 py-3 text-sm space-y-1">
          <div className="font-medium text-slate-800">Check against the ledger at {shortDate(asAt)}</div>
          {reg.ledger.map((g) => (
            <div key={`${g.account_id}-${g.kind}`} className={g.register === g.ledger ? "text-emerald-700" : "text-amber-700"}>
              {g.code} {g.name}: register {fmt(g.register)} · ledger {fmt(g.ledger)}{g.register === g.ledger ? " ✓" : ` — difference ${fmt(g.register - g.ledger)} (opening balances, assets not yet registered, or entries made by journal)`}
            </div>
          ))}
        </div>}
      </Card>

      {reg && reg.candidates.length > 0 && (
        <Card title="From purchase bills — not yet in the register" className="mt-4" pad={false}
          sub="Posted bill lines on a fixed-asset account. Add each one to the register (its cost and date come from the bill).">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Bill date</th><th className="th">Supplier invoice</th><th className="th">Line</th><th className="th">Account</th><th className="th text-end">Cost</th><th className="th" /></tr></thead>
            <tbody>{reg.candidates.map((c) => (
              <tr key={c.line_id}><td className="td">{shortDate(c.bill_date)}</td><td className="td font-mono text-xs">{c.supplier_invoice_no}</td><td className="td text-sm">{c.description}</td>
                <td className="td font-mono text-xs">{c.account_code}</td><td className="td text-end num">{fmt(c.cost)}</td>
                <td className="td text-end">{canPrepare && <button className="btn-ghost !py-1" onClick={() => setEditing({ asset: null, fromBill: true,
                  draft: { ...emptyAsset(), name: c.description, purchase_date: c.bill_date, cost: fmtPlain(c.cost), source_bill_line_id: c.line_id } })}><Plus size={13} />Add to register</button>}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {reg && (reg.assets.length > 0 || reg.runs.length > 0) && (
        <Card title="Monthly depreciation (D-71)" icon={<CalendarClock size={16} />} className="mt-4" pad={false}
          sub="One journal per month — Dr depreciation expense, Cr accumulated depreciation — approved by someone else in Approvals. Months run in order.">
          <div className="px-5 pb-3 flex flex-wrap items-center gap-3">
            {reg.next_month && canPrepare && !pendingRun && <button className="btn-primary bg-emerald-600" onClick={() => void act(() => runDepreciation(client.id, reg.next_month!), `Depreciation for ${monthLabel(reg.next_month!)} sent for approval`)}>
              <Play size={15} />Run depreciation for {monthLabel(reg.next_month)}</button>}
            {pendingRun && <span className="text-sm text-amber-800">{monthLabel(pendingRun.month)} is waiting for approval (Approvals tab). The next month can run once it is approved.</span>}
          </div>
          {reg.next_month && !pendingRun && unitsAssets.length > 0 && <UnitsEntry assets={unitsAssets} month={reg.next_month} canEdit={canPrepare} onSaved={reload} />}
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Month</th><th className="th">Journal</th><th className="th">Status</th><th className="th text-end">Depreciation</th><th className="th" /></tr></thead>
            <tbody>
              {reg.runs.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No months run yet.</td></tr>}
              {reg.runs.map((r, i) => (
                <tr key={r.id}><td className="td">{monthLabel(r.month)}</td><td className="td font-mono text-xs">{r.journal_no ?? "—"}</td>
                  <td className="td"><Badge tone={r.status === "posted" ? "emerald" : "amber"}>{r.status === "posted" ? "Posted" : "Waiting for approval"}</Badge></td>
                  <td className="td text-end num">{fmt(r.total)}</td>
                  <td className="td text-end">{i === 0 && canPrepare && r.status !== "posted" && r.status !== "reversed" &&
                    <button className="btn-ghost !py-1 text-xs" onClick={() => void act(() => cancelRun(r.id), "Run cancelled")}><Undo2 size={13} />Cancel run</button>}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      {editing && <AssetForm client={client} accounts={accounts} {...editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Asset saved"); reload(); }} />}
      {schedule && <ScheduleModal asset={schedule} onClose={() => setSchedule(null)} />}
      {disposing && reg && <DisposeModal asset={disposing} saleLines={reg.sale_lines} onClose={() => setDisposing(null)}
        onDone={() => { setDisposing(null); toast("Disposal journal sent for approval"); reload(); }} />}
    </>
  );
}

function UnitsEntry({ assets, month, canEdit, onSaved }: { assets: Asset[]; month: string; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const save = async (a: Asset) => {
    const t = (v[a.id] ?? "").trim();
    if (!/^\d+$/.test(t)) { toast("Enter whole units (0 or more)", "err"); return; }
    try { await setUsage(a.id, month, Number(t)); toast(`${a.asset_no}: ${t} ${a.units_name} recorded for ${monthLabel(month)}`); onSaved(); } catch (e) { toast(friendlyDbError(e), "err"); }
  };
  return (
    <div className="mx-5 mb-3 rounded-xl bg-slate-50 p-3 text-sm">
      <div className="font-medium mb-2">Units used in {monthLabel(month)} — enter before running</div>
      {assets.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 mb-1"><span className="w-56">{a.asset_no} {a.name}</span>
          <input aria-label={`Units for ${a.name}`} className={`${cls} !w-32 text-end`} value={v[a.id] ?? ""} onChange={(e) => setV((x) => ({ ...x, [a.id]: e.target.value }))} disabled={!canEdit} />
          <span className="text-slate-500">{a.units_name}</span>{canEdit && <button className="btn-ghost !py-1" onClick={() => void save(a)}>Save</button>}</div>
      ))}
    </div>
  );
}

function AssetForm({ client, accounts, asset, draft, fromBill, onClose, onSaved }: {
  client: Client; accounts: Account[]; asset: Asset | null; draft: AssetDraft; fromBill: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { data: cats } = useLoad(listCategories);
  const [d, setD] = useState<AssetDraft>(draft);
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const locked = !!asset?.charged;                                   // D-70: figures fixed once depreciation is charged
  const set = <K extends keyof AssetDraft>(k: K, v: AssetDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const pickCategory = (code: string) => {
    const c = cats?.find((x) => x.code === code);
    setD((x) => ({ ...x, category_code: code, ...(c && !locked ? { method: c.default_method, life_years: c.default_life_months ? yearsText(c.default_life_months) : x.life_years,
      rate_pct: c.default_rate_bp ? pctText(c.default_rate_bp) : x.rate_pct } : {}) }));
  };
  const of = (pred: (a: Account) => boolean) => accounts.filter((a) => a.is_active && pred(a));
  const save = async () => {
    const { problems, payload } = assetPayload(d, fromBill);
    if (problems.length && !locked) { setError(problems); return; }
    setBusy(true); setError([]);
    try { await saveAsset(asset?.id ?? null, client.id, payload); onSaved(); } catch (e) { setError([friendlyDbError(e)]); } finally { setBusy(false); }
  };
  const text = (k: keyof AssetDraft, label: string, opts: { type?: string; disabled?: boolean; hint?: string } = {}) => (
    <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <input aria-label={label} type={opts.type ?? "text"} className={cls} value={d[k] as string} disabled={opts.disabled} onChange={(e) => set(k, e.target.value as never)} />
      {opts.hint && <span className="block text-xs text-slate-500 mt-1">{opts.hint}</span>}</label>
  );
  const acctSelect = (k: "asset_account_id" | "accum_account_id" | "expense_account_id", label: string, list: Account[]) => (
    <label><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <select aria-label={label} className={cls} value={d[k]} disabled={locked || (fromBill && k === "asset_account_id")} onChange={(e) => set(k, e.target.value)}>
        <option value="">Default</option>{list.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
  );
  return (
    <Modal open wide onClose={onClose} title={asset ? `${asset.asset_no} — ${asset.name}` : fromBill ? "Add to the register from the bill" : "Add an asset"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button></>}>
      {error.length > 0 && <ul role="alert" className="mb-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 text-rose-800 px-4 py-2 text-sm list-disc ps-8">{error.map((x) => <li key={x}>{x}</li>)}</ul>}
      {locked && <p className="mb-3 rounded-xl bg-sky-50 ring-1 ring-sky-200 text-sky-900 px-4 py-2 text-sm">Depreciation has been charged, so only the name, description, category, location and tag can change.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("name", "Name")}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Category</span>
          <select aria-label="Category" className={cls} value={d.category_code} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">—</option>{(cats ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}{c.default_life_months ? ` (${yearsText(c.default_life_months)} yrs)` : ""}</option>)}</select></label>
        {text("description", "Description")}
        <div className="grid grid-cols-2 gap-3">{text("location", "Location")}{text("tag_no", "Tag / serial no.")}</div>
        {text("purchase_date", "Purchase date", { type: "date", disabled: locked || fromBill, hint: "Depreciation starts with a full month in the month of purchase (D-68)." })}
        <div className="grid grid-cols-2 gap-3">{text("cost", "Cost (AED)", { disabled: locked || fromBill })}{text("residual", "Residual value (AED)", { disabled: locked })}</div>
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Depreciation method</span>
          <div className="grid gap-2 sm:grid-cols-4">{METHODS.map(([v, l, hint]) => (
            <button key={v} type="button" disabled={locked} title={hint} onClick={() => set("method", v)}
              className={`rounded-xl px-3 py-2 text-sm ring-1 text-start cursor-pointer ${d.method === v ? "bg-emerald-50 ring-emerald-400 text-emerald-900" : "bg-white ring-slate-200 text-slate-700"}`}>{l}</button>
          ))}</div></label>
        {(d.method === "straight_line" || d.method === "sum_of_years" || d.method === "reducing_balance") &&
          text("life_years", d.method === "reducing_balance" ? "Useful life in years (optional — writes down to residual at the end)" : "Useful life in years", { disabled: locked })}
        {d.method === "reducing_balance" && text("rate_pct", "Yearly rate (%)", { disabled: locked })}
        {d.method === "units" && <div className="grid grid-cols-2 gap-3">{text("units_total", "Total units over the life", { disabled: locked })}{text("units_name", "Unit (e.g. km, hours)", { disabled: locked })}</div>}
        {!fromBill && <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={d.has_history} disabled={locked} onChange={(e) => set("has_history", e.target.checked)} />
          Owned before this app — it already has accumulated depreciation</label>}
        {d.has_history && <>
          {text("opening_accum", "Accumulated depreciation before the app (AED)", { disabled: locked })}
          {text("opening_as_at", "As at", { type: "date", disabled: locked, hint: "The app charges from the month after this date." })}
          {d.method === "units" && text("opening_units", "Units used before the app", { disabled: locked })}
        </>}
        {acctSelect("asset_account_id", "Asset account", accounts.filter((a) => a.is_active && a.subtype === "fixed_asset"))}
        {acctSelect("accum_account_id", "Accumulated depreciation account", of((a) => a.subtype === "accum_depreciation"))}
        {acctSelect("expense_account_id", "Depreciation expense account", of((a) => a.type === "expense"))}
      </div>
    </Modal>
  );
}

function ScheduleModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const fetch = useCallback(() => assetSchedule(asset.id), [asset.id]);
  const { data } = useLoad(fetch);
  return (
    <Modal open wide onClose={onClose} title={`${asset.asset_no} — ${asset.name}: depreciation schedule`} footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <p className="text-sm text-slate-600 mb-3">{methodLine(asset)} · cost {fmt(asset.cost)}{asset.residual ? ` · residual ${fmt(asset.residual)}` : ""}
        {asset.opening_as_at && ` · ${fmt(asset.opening_accum)} charged before the app (to ${shortDate(asset.opening_as_at)})`}. Months already run show what was charged.</p>
      <div className="overflow-x-auto max-h-[60vh]"><table className="w-full min-w-[520px]">
        <thead><tr><th className="th">Month</th>{asset.method === "units" && <th className="th text-end">Units</th>}<th className="th text-end">Depreciation</th><th className="th text-end">Book value after</th><th className="th">Charged</th></tr></thead>
        <tbody>
          {!data && <tr><td className="td text-slate-500" colSpan={5}>Loading…</td></tr>}
          {data?.map((r) => (
            <tr key={r.month}><td className="td">{monthLabel(r.month)}</td>{asset.method === "units" && <td className="td text-end num">{r.units ?? ""}</td>}
              <td className="td text-end num">{fmt(r.charge)}</td><td className="td text-end num">{fmt(r.nbv)}</td>
              <td className="td text-xs">{r.charged !== null ? <Badge tone="emerald">{r.charged === r.charge ? "Charged" : `Charged ${fmt(r.charged)} (incl. catch-up)`}</Badge> : ""}</td></tr>
          ))}
        </tbody>
      </table></div>
    </Modal>
  );
}

function DisposeModal({ asset, saleLines, onClose, onDone }: { asset: Asset; saleLines: Register["sale_lines"]; onClose: () => void; onDone: () => void }) {
  const today = useToday();
  const [kind, setKind] = useState<"sold" | "scrapped">("scrapped");
  const [date, setDate] = useState(today);
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setError(null);
    if (kind === "sold" && !line) { setError("Choose the sales invoice line for the sale."); return; }
    try { await disposeAsset(asset.id, date, kind, kind === "sold" ? line : null); onDone(); } catch (e) { setError(friendlyDbError(e)); }
  };
  return (
    <Modal open onClose={onClose} title={`Dispose of ${asset.asset_no} — ${asset.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={() => void go()}><Ban size={15} />Create disposal journal</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <p className="text-sm text-slate-600 mb-3">Book value now {fmt(asset.nbv)}. No depreciation is charged in the month of disposal; depreciation must be run up to the month before (D-74).
        The disposal journal waits for approval like any journal.</p>
      <div className="grid gap-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "scrapped"} onChange={() => setKind("scrapped")} />Scrapped / written off</label>
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "sold"} onChange={() => setKind("sold")} />Sold</label>
        </div>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Date of disposal</span><input aria-label="Date of disposal" type="date" className={cls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {kind === "sold" && <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Sales invoice line (posted, on 1520 Asset disposals clearing)</span>
          <select aria-label="Sales invoice line" className={cls} value={line} onChange={(e) => setLine(e.target.value)}>
            <option value="">Choose…</option>{saleLines.map((l) => <option key={l.line_id} value={l.line_id}>{l.invoice_no} · {shortDate(l.issue_date)} · {l.description} · {fmt(l.net)}</option>)}</select>
          <span className="block text-xs text-slate-500 mt-1">First raise a normal sales invoice to the buyer (VAT as usual) with its line on account 1520, and post it.</span></label>}
      </div>
    </Modal>
  );
}
