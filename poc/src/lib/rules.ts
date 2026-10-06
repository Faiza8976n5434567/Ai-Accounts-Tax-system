/**
 * Deterministic rules (no AI, D-01): TRN format, default account suggestions and the
 * tax-invoice compliance checks run on every purchase bill. Suggestions are only defaults —
 * a person always reviews and approves before anything is posted.
 */
import { TAX_CONFIG } from "./config";
import { fmtPlain } from "./money";
import { vatOnNet } from "./vat";
import type { Check, PurchaseDoc, TaxCode } from "./types";

/** F-18: UAE TRN = 15 digits starting with 1. */
export const isTrn = (t: string) => /^1\d{14}$/.test(t.replace(/[\s-]/g, ""));

interface Rule { kw: RegExp; account: string; taxCode: TaxCode; why: string }
const RULES: Rule[] = [
  { kw: /uber|careem|taxi|rta|salik|airport|flight|emirates airline|etihad/i, account: "6050", taxCode: "SR", why: "Ride-hailing / travel vendor keywords → Transportation and travel." },
  { kw: /fuel|adnoc|enoc|emarat|petrol|diesel/i, account: "6060", taxCode: "SR", why: "Fuel station vendor → Fuel and vehicle running. Input VAT recoverable if vehicle is used for business only." },
  { kw: /rent|lease|tenancy|ejari/i, account: "6100", taxCode: "SR", why: "Commercial rent / tenancy description → Rent expense. Commercial rent is standard-rated." },
  { kw: /trading goods|stock|inventory|wholesale|merchandise|raw material/i, account: "1200", taxCode: "SR", why: "Purchase of goods for resale → Inventory (expensed to COGS on sale)." },
  { kw: /laptop|computer|macbook|server|printer|furniture|vehicle purchase|equipment/i, account: "1500", taxCode: "SR", why: "Durable asset above capitalisation threshold → PPE (IT equipment), IAS 16." },
  { kw: /restaurant|dinner|lunch|hotel|client meeting|hospitality|catering/i, account: "6140", taxCode: "BLK", why: "Hospitality for non-employees → Client entertainment. Input VAT blocked (Exec. Reg. Art 53); CT 50% disallowed (Art 32)." },
  { kw: /dewa|addc|sewa|etisalat|\be&\b|du telecom|\bdu\b|internet|electricity|water/i, account: "6110", taxCode: "SR", why: "Utility / telecom provider → Utilities and telecom." },
  { kw: /audit|legal|consult|accounting|tax agent|advisory/i, account: "6130", taxCode: "SR", why: "Professional services → Professional fees." },
  { kw: /google ads|meta|facebook|instagram|linkedin|advert|marketing|printing/i, account: "6150", taxCode: "SR", why: "Advertising / marketing vendor → Marketing and advertising." },
  { kw: /fine|penalty|violation/i, account: "6160", taxCode: "OS", why: "Government fine → Fines and penalties (outside VAT scope; not CT-deductible, Art 33)." },
  { kw: /visa|licence|license|ded|mohre|immigration|trade licen/i, account: "6120", taxCode: "OS", why: "Government fee → Licences, visas and fees (generally outside VAT scope)." },
  { kw: /personal|family|school fee|gym|grocery|carrefour|lulu/i, account: "6500", taxCode: "BLK", why: "Personal-nature spend → Non-deductible. Input VAT blocked; CT disallowed." },
  { kw: /stationery|office supplies|amazon|noon|software|subscription|microsoft|adobe/i, account: "6180", taxCode: "SR", why: "Office consumables / software → Office supplies and IT." },
  { kw: /bank charge|transfer fee|commission/i, account: "6400", taxCode: "SR", why: "Bank fee → Bank charges." },
];
const NO_MATCH = "No rule matched — defaulted to Office supplies and IT. Please choose the right account.";
const FOREIGN = " Supplier is outside the UAE → reverse charge applies (Art 48).";
const FROM_HISTORY = "Same account and tax code as the last bill from this supplier.";
/** Rule explanations, so the UI can translate them. */
export const RULE_SENTENCES = [...RULES.map((r) => r.why), NO_MATCH, FOREIGN.trim(), FROM_HISTORY, "(Changed by user.)"];

export interface Suggestion { account: string; taxCode: TaxCode; reasoning: string }

/** Keyword rule on supplier name + description (also used for bank narratives). */
export function suggestAccount(text: string, foreign = false): Suggestion {
  const r = RULES.find((x) => x.kw.test(text));
  const base = r ?? { account: "6180", taxCode: "SR" as TaxCode, why: NO_MATCH };
  if (foreign && base.taxCode === "SR") return { account: base.account, taxCode: "RCS", reasoning: base.why + FOREIGN };
  return { account: base.account, taxCode: base.taxCode, reasoning: base.why };
}

/** Preferred default: whatever was used on the last posted bill from the same supplier. */
export function suggestForSupplier(orgId: string, supplier: string, history: PurchaseDoc[], description = "", foreign = false): Suggestion {
  const key = supplier.trim().toLowerCase();
  const last = key ? history.filter((h) => h.orgId === orgId && h.status === "POSTED" && h.supplier.trim().toLowerCase() === key).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  if (last) return { account: last.account, taxCode: last.taxCode, reasoning: FROM_HISTORY };
  return suggestAccount(`${supplier} ${description}`, foreign);
}

/** Article 59 tax-invoice checks + arithmetic + duplicate signals, with a risk score (F-17). */
export function review(doc: Omit<PurchaseDoc, "checks" | "risk" | "riskScore">, history: PurchaseDoc[]): { checks: Check[]; risk: PurchaseDoc["risk"]; riskScore: number } {
  const expectedVat = vatOnNet(doc.net);
  const chargesVat = doc.vat > 0;
  const c: Check[] = [];
  const push = (id: string, label: string, ok: boolean, severity: Check["severity"], detail?: string, dp?: Record<string, string>) => c.push({ id, label, ok, severity, detail, dp });
  if (!doc.foreign) {
    push("heading", "'Tax Invoice' heading present", doc.hasHeading, "error", "Art 59(1)(a)");
    push("trn", "Supplier TRN present & valid format (15 digits)", isTrn(doc.supplierTrn), "error", doc.supplierTrn ? "TRN {trn}" : "TRN missing — input VAT not recoverable", { trn: doc.supplierTrn });
  } else {
    push("foreign", "Foreign supplier — reverse charge self-assessment", true, "info", "No UAE TRN expected; account for output & input VAT (Box 3 & 10)");
  }
  push("supplier", "Supplier name", !!doc.supplier.trim(), "error");
  push("invno", "Sequential invoice number", !!doc.invNo.trim(), "error");
  push("date", "Date of issue", !!doc.date, "error");
  push("desc", "Description of goods / services", doc.description.trim().length > 3, "error");
  push("net", "Taxable value stated", doc.net > 0, "error");
  if (!doc.foreign) push("vatcalc", "VAT = 5% of taxable value", !chargesVat || Math.abs(doc.vat - expectedVat) <= 1, "error", chargesVat && Math.abs(doc.vat - expectedVat) > 1 ? "Expected AED {exp}, invoice shows AED {got}" : undefined, { exp: fmtPlain(expectedVat), got: fmtPlain(doc.vat) });
  push("total", "Total = taxable value + VAT", doc.total === doc.net + doc.vat, "error");
  if (doc.total > TAX_CONFIG.vat.fullInvoiceThreshold.value && !doc.foreign) push("cust", "Recipient name/TRN (full tax invoice > AED 10,000)", !!doc.customerName, "warn", "Exec. Reg. Art 59 — VERIFY");
  const dup = history.find((h) => h.id !== doc.id && h.orgId === doc.orgId && h.status !== "REJECTED" && ((h.invNo === doc.invNo && h.supplier === doc.supplier) || (h.supplierTrn && h.supplierTrn === doc.supplierTrn && h.total === doc.total && h.date === doc.date)));
  push("dup", "Not a duplicate of an earlier invoice", !dup, "error", dup ? "Matches {ref} captured {date}" : undefined, dup ? { ref: dup.invNo, date: dup.createdAt.slice(0, 10) } : undefined);
  if (!doc.supplierTrn && chargesVat && !doc.foreign) push("unreg", "VAT charged by supplier without TRN", false, "error", "Possible fake VAT charge — do not claim");
  const day = new Date(doc.date).getDay();
  if (day === 0 || day === 6) push("weekend", "Weekend-dated invoice", false, "warn", "Unusual for B2B supplier");
  if (doc.net >= 10_000_00 && doc.net % 1_000_00 === 0) push("round", "Round-sum amount", false, "warn", "Round amounts are an audit red flag");
  const daysOld = (Date.now() - new Date(doc.date).getTime()) / 864e5;
  if (daysOld > 365) push("stale", "Invoice older than 12 months", false, "warn");

  const score = c.filter((x) => !x.ok).reduce((s, x) => s + (x.severity === "error" ? (x.id === "dup" || x.id === "unreg" ? 45 : 22) : 10), 0);
  const riskScore = Math.min(100, score);
  return { checks: c, riskScore, risk: riskScore >= 45 ? "High" : riskScore >= 15 ? "Medium" : "Low" };
}
