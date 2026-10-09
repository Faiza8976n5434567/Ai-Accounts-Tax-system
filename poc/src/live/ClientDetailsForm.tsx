/** Edit a client's details (Firm Admin · manage_client). VAT registration and the VAT stagger are fixed at
 *  onboarding because the VAT periods are generated from them. */
import { useState } from "react";
import { Save } from "lucide-react";
import { Modal } from "../components/ui";
import { updateClient, type Client } from "../lib/clients";
import { fmtPlain, parseAedToFils } from "../lib/money";
import { friendlyDbError } from "../lib/journals";
import { useToast } from "./toast";

export function ClientDetailsForm({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    legal_name: client.legal_name, trade_name: client.trade_name ?? "", address: client.address ?? "", trn: client.trn ?? "", ct_trn: client.ct_trn ?? "",
    licence_no: client.licence_no ?? "", licence_authority: client.licence_authority ?? "", licence_expiry: client.licence_expiry ?? "",
    industry: client.industry ?? "", ct_regime: client.ct_regime, prior_year_revenue: fmtPlain(client.prior_year_revenue),
    address_line1: client.address_line1 ?? "", address_line2: client.address_line2 ?? "", city: client.city ?? "", reg_type: client.reg_type,
    iban: client.iban ?? "", bank_name: client.bank_name ?? "", payment_means_code: client.payment_means_code,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setError(null);
    if (!f.legal_name.trim()) { setError("Enter the legal name."); return; }
    if (f.trn.trim() && !/^1\d{14}$/.test(f.trn.trim())) { setError("A TRN is 15 digits starting with 1."); return; }
    if (client.vat_registered && !f.trn.trim()) { setError("A VAT-registered client needs its TRN."); return; }
    const revenue = parseAedToFils(f.prior_year_revenue || "0");
    if (revenue === null || revenue < 0) { setError("Prior-year revenue must be an AED amount."); return; }
    const iban = f.iban.replace(/\s+/g, "").toUpperCase();
    if (iban && !/^AE\d{21}$/.test(iban)) { setError("A UAE IBAN is AE followed by 21 digits."); return; }
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    setBusy(true);
    try {
      await updateClient(client.id, {
        legal_name: f.legal_name.trim(), trade_name: blank(f.trade_name), address: blank(f.address), trn: blank(f.trn), ct_trn: blank(f.ct_trn),
        licence_no: blank(f.licence_no), licence_authority: blank(f.licence_authority), licence_expiry: blank(f.licence_expiry),
        industry: blank(f.industry), ct_regime: f.ct_regime, prior_year_revenue: revenue,
        address_line1: blank(f.address_line1), address_line2: blank(f.address_line2), city: blank(f.city), reg_type: f.reg_type,
        iban: iban || null, bank_name: blank(f.bank_name), payment_means_code: f.payment_means_code,
      });
      toast("Client details saved"); onSaved();
    } catch (e) { setError(friendlyDbError(e)); } finally { setBusy(false); }
  };

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  const text = (k: keyof typeof f, label: string, wide = false, type = "text") => (
    <label className={wide ? "sm:col-span-2" : undefined}><span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <input type={type} className={cls} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <Modal open wide onClose={onClose} title={`Edit ${client.legal_name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary bg-emerald-600" disabled={busy} onClick={() => void save()}><Save size={15} />Save</button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("legal_name", "Legal name (as on the trade licence)", true)}
        {text("trade_name", "Trade name")}
        {text("industry", "Industry")}
        <label className="sm:col-span-2"><span className="block text-xs font-medium text-slate-600 mb-1.5">Address (printed on tax invoices — Art 59)</span>
          <textarea className={cls} rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
        {text("trn", "VAT TRN (15 digits)")}
        {text("ct_trn", "Corporate Tax TRN")}
        {text("licence_no", "Trade licence number")}
        {text("licence_authority", "Licensing authority")}
        {text("licence_expiry", "Licence expiry", false, "date")}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Corporate Tax regime</span>
          <select className={cls} value={f.ct_regime} onChange={(e) => set("ct_regime", e.target.value)}>
            <option value="standard">Standard</option><option value="sbr">Small Business Relief elected</option><option value="qfzp">Qualifying Free Zone Person</option>
          </select></label>
        {text("prior_year_revenue", "Prior-year revenue (AED, for the SBR test)")}
      </div>
      <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-800">E-invoicing (PINT AE)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("address_line1", "Address line 1 (building, street)")}
        {text("address_line2", "Address line 2 (optional)")}
        {text("city", "City")}
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Registration type (the licence number above)</span>
          <select className={cls} value={f.reg_type} onChange={(e) => set("reg_type", e.target.value)}>
            <option value="TL">Trade licence</option><option value="EID">Emirates ID</option><option value="PAS">Passport</option><option value="CD">Cabinet decision</option></select></label>
        <label><span className="block text-xs font-medium text-slate-600 mb-1.5">Default payment means</span>
          <select className={cls} value={f.payment_means_code} onChange={(e) => set("payment_means_code", e.target.value)}>
            {[["30", "Credit transfer (bank)"], ["42", "Payment to bank account"], ["10", "Cash"], ["20", "Cheque"], ["48", "Bank card"], ["1", "Not defined"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {text("iban", "IBAN for payments (AE + 21 digits)")}
        {text("bank_name", "Bank name")}
      </div>
      <p className="mt-2 text-xs text-slate-500">The emirate is the client's head office. The Peppol address is the TIN — the first 10 digits of the TRN.</p>
      <p className="mt-3 text-xs text-slate-500">VAT registration, return period and stagger are set when the client is added, because the VAT periods are generated from them.</p>
    </Modal>
  );
}
