/**
 * Simulated AI layer (POC). Deterministic, rule-based stand-ins for document extraction,
 * classification, compliance review and "ask your books". AI proposes; rules validate; humans approve.
 */
import { TAX_CONFIG } from "./config";
import { applyBp, toFils, type Fils } from "./money";
import type { Check, PurchaseDoc, TaxCode, Journal } from "./types";

export const isTrn = (t: string) => /^1\d{14}$/.test(t.replace(/[\s-]/g, ""));

interface Rule { kw: RegExp; account: string; taxCode: TaxCode; conf: number; why: string }
const RULES: Rule[] = [
  { kw: /uber|careem|taxi|rta|salik|airport|flight|emirates airline|etihad/i, account: "6050", taxCode: "SR", conf: 0.94, why: "Ride-hailing / travel vendor keywords → Transportation and travel." },
  { kw: /fuel|adnoc|enoc|emarat|petrol|diesel/i, account: "6060", taxCode: "SR", conf: 0.95, why: "Fuel station vendor → Fuel and vehicle running. Input VAT recoverable if vehicle is used for business only." },
  { kw: /rent|lease|tenancy|ejari/i, account: "6100", taxCode: "SR", conf: 0.93, why: "Commercial rent / tenancy description → Rent expense. Commercial rent is standard-rated." },
  { kw: /trading goods|stock|inventory|wholesale|merchandise|raw material/i, account: "1200", taxCode: "SR", conf: 0.9, why: "Purchase of goods for resale → Inventory (expensed to COGS on sale)." },
  { kw: /laptop|computer|macbook|server|printer|furniture|vehicle purchase|equipment/i, account: "1500", taxCode: "SR", conf: 0.88, why: "Durable asset above capitalisation threshold → PPE (IT equipment), IAS 16." },
  { kw: /restaurant|dinner|lunch|hotel|client meeting|hospitality|catering/i, account: "6140", taxCode: "BLK", conf: 0.86, why: "Hospitality for non-employees → Client entertainment. Input VAT blocked (Exec. Reg. Art 53); CT 50% disallowed (Art 32)." },
  { kw: /dewa|addc|sewa|etisalat|\be&\b|du telecom|\bdu\b|internet|electricity|water/i, account: "6110", taxCode: "SR", conf: 0.95, why: "Utility / telecom provider → Utilities and telecom." },
  { kw: /audit|legal|consult|accounting|tax agent|advisory/i, account: "6130", taxCode: "SR", conf: 0.9, why: "Professional services → Professional fees." },
  { kw: /google ads|meta|facebook|instagram|linkedin|advert|marketing|printing/i, account: "6150", taxCode: "SR", conf: 0.91, why: "Advertising / marketing vendor → Marketing and advertising." },
  { kw: /fine|penalty|violation/i, account: "6160", taxCode: "OS", conf: 0.92, why: "Government fine → Fines and penalties (outside VAT scope; not CT-deductible, Art 33)." },
  { kw: /visa|licence|license|ded|mohre|immigration|trade licen/i, account: "6120", taxCode: "OS", conf: 0.9, why: "Government fee → Licences, visas and fees (generally outside VAT scope)." },
  { kw: /personal|family|school fee|gym|grocery|carrefour|lulu/i, account: "6500", taxCode: "BLK", conf: 0.8, why: "Personal-nature spend → Non-deductible. Input VAT blocked; CT disallowed." },
  { kw: /stationery|office supplies|amazon|noon|software|subscription|microsoft|adobe/i, account: "6180", taxCode: "SR", conf: 0.87, why: "Office consumables / software → Office supplies and IT." },
  { kw: /bank charge|transfer fee|commission/i, account: "6400", taxCode: "SR", conf: 0.92, why: "Bank fee → Bank charges." },
];

export function classify(text: string, foreign = false): { account: string; taxCode: TaxCode; confidence: number; reasoning: string } {
  const r = RULES.find((x) => x.kw.test(text));
  const base = r ?? { account: "6180", taxCode: "SR" as TaxCode, conf: 0.55, why: "No strong pattern matched — defaulted to Office supplies and IT. Needs human review." };
  if (foreign && base.taxCode === "SR") return { account: base.account, taxCode: "RCS", confidence: base.conf - 0.05, reasoning: base.why + " Supplier is outside the UAE → reverse charge applies (Art 48)." };
  return { account: base.account, taxCode: base.taxCode, confidence: base.conf, reasoning: base.why };
}

export interface Extracted { supplier: string; supplierTrn: string; invNo: string; date: string; description: string; net: Fils; vat: Fils; total: Fils; currency: string; hasHeading: boolean; customerName: string; foreign?: boolean }

const SAMPLES: (Extracted & { key: string; title: string })[] = [
  { key: "uber", title: "Uber trip — Airport", supplier: "Uber Technologies (UAE) LLC", supplierTrn: "100354872600003", invNo: "UB-77812", date: "2026-09-27", description: "Uber Trip Abu Dhabi Airport to Office", net: toFils(100), vat: toFils(5), total: toFils(105), currency: "AED", hasHeading: true, customerName: "" },
  { key: "rent", title: "Office rent — Sep 2026", supplier: "Aldar Properties PJSC", supplierTrn: "100067549300003", invNo: "ALD-2026-0931", date: "2026-09-01", description: "Office Rent - September 2026, Unit 1204 Al Maryah", net: toFils(25000), vat: toFils(1250), total: toFils(26250), currency: "AED", hasHeading: true, customerName: "CLIENT" },
  { key: "goods", title: "Trading goods", supplier: "Gulf Wholesale Trading LLC", supplierTrn: "100288471900003", invNo: "GW-55120", date: "2026-09-24", description: "Purchase of Trading Goods - 400 cartons", net: toFils(48000), vat: toFils(2400), total: toFils(50400), currency: "AED", hasHeading: true, customerName: "CLIENT" },
  { key: "laptop", title: "Laptop purchase", supplier: "Sharaf DG LLC", supplierTrn: "100045122800003", invNo: "SDG-998127", date: "2026-09-21", description: "Laptop Purchase - MacBook Pro 14 x2", net: toFils(14200), vat: toFils(710), total: toFils(14910), currency: "AED", hasHeading: true, customerName: "CLIENT" },
  { key: "dinner", title: "Client dinner", supplier: "Zuma Restaurant Abu Dhabi", supplierTrn: "100391029400003", invNo: "Z-44102", date: "2026-09-26", description: "Client dinner - project kickoff, 6 guests", net: toFils(3800), vat: toFils(190), total: toFils(3990), currency: "AED", hasHeading: true, customerName: "" },
  { key: "fuel", title: "ADNOC fuel", supplier: "ADNOC Distribution", supplierTrn: "100022339800003", invNo: "ADN-88213", date: "2026-09-28", description: "Fuel - Super 98", net: toFils(100), vat: toFils(5), total: toFils(105), currency: "AED", hasHeading: true, customerName: "" },
  { key: "badvat", title: "Wrong VAT + no TRN", supplier: "Quick Print Services", supplierTrn: "", invNo: "QP-118", date: "2026-09-20", description: "Marketing flyers printing", net: toFils(2000), vat: toFils(150), total: toFils(2150), currency: "AED", hasHeading: false, customerName: "" },
  { key: "foreign", title: "Google Ads (foreign)", supplier: "Google Ireland Ltd", supplierTrn: "", invNo: "GIE-5512309", date: "2026-09-30", description: "Google Ads - September campaign", net: toFils(6000), vat: 0, total: toFils(6000), currency: "AED", hasHeading: false, customerName: "", foreign: true },
];
export const sampleList = SAMPLES.map((s) => ({ key: s.key, title: s.title }));
export const REASON_SENTENCES = [...RULES.map((r) => r.why), "No strong pattern matched — defaulted to Office supplies and IT. Needs human review.", "Supplier is outside the UAE → reverse charge applies (Art 48).", "(Overridden by user.)", "Auto-classified from supplier and description patterns.", "Purchase of goods for resale → Inventory.", "Hospitality for non-employees → Client entertainment.", "Bank narrative pattern"];
export function extract(fileNameOrKey: string): Extracted {
  const k = fileNameOrKey.toLowerCase();
  const hit = SAMPLES.find((s) => k.includes(s.key)) ?? SAMPLES.find((s) => s.title.toLowerCase().split(" ").some((w) => w.length > 3 && k.includes(w)));
  if (hit) { const { key: _k, title: _t, ...rest } = hit; return { ...rest }; }
  const pick = SAMPLES[Math.abs([...k].reduce((a, c) => a + c.charCodeAt(0), 0)) % SAMPLES.length];
  const { key: _k, title: _t, ...rest } = pick; return { ...rest, invNo: `${rest.invNo}-${Math.floor(Math.random() * 900 + 100)}` };
}

/** Article 59 tax-invoice checks + arithmetic + duplicate/fraud signals. */
export function review(doc: Omit<PurchaseDoc, "checks" | "risk" | "riskScore">, history: PurchaseDoc[]): { checks: Check[]; risk: PurchaseDoc["risk"]; riskScore: number } {
  const rate = TAX_CONFIG.vat.rateBp.value;
  const expectedVat = applyBp(doc.net, rate);
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
  if (!doc.foreign) push("vatcalc", "VAT = 5% of taxable value", !chargesVat || Math.abs(doc.vat - expectedVat) <= 1, "error", chargesVat && Math.abs(doc.vat - expectedVat) > 1 ? "Expected AED {exp}, invoice shows AED {got}" : undefined, { exp: (expectedVat / 100).toFixed(2), got: (doc.vat / 100).toFixed(2) });
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

/** Ask-your-books: intent matching over the tenant's own ledger. Returns answer + the "query" used. */
export interface Answer { text: string; query: string; rows?: { label: string; value: string; tone?: "good" | "bad" }[] }
type Tr = (k: string, p?: Record<string, string | number>) => string;
export function ask(q: string, ctx: { journals: Journal[]; monthly: { label: string; month: string; pl: { revenue: number; cogs: number; opex: number; net: number; opexLines: [string, number][] } }[]; ageing: { name: string; days: number; amount: number }[]; vatNet: number }, t: Tr = (k, p) => { let o = k; if (p) for (const [a, b] of Object.entries(p)) o = o.split(`{${a}}`).join(String(b)); return o; }, acc: (code: string) => string = (c) => c, mon: (m: string) => string = (m) => m): Answer {
  const s = q.toLowerCase();
  const f = (n: number) => `AED ${(n / 100).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
  const sg = (n: number) => `${n >= 0 ? "+" : "-"}${f(Math.abs(n))}`;
  if (/profit|margin|why|decrease|drop|increase|ربح|انخفض|لماذا/.test(s)) {
    const m = ctx.monthly.filter((x) => x.pl.revenue || x.pl.opex);
    const cur = m[m.length - 1], prev = m[m.length - 2];
    if (!cur || !prev) return { text: t("Not enough monthly history yet."), query: "profit_variance(month)" };
    const dNet = cur.pl.net - prev.pl.net, dRev = cur.pl.revenue - prev.pl.revenue;
    const prevMap = new Map(prev.pl.opexLines), drivers: Answer["rows"] = [];
    drivers.push({ label: t("Revenue"), value: sg(dRev), tone: dRev >= 0 ? "good" : "bad" });
    const dC = cur.pl.cogs - prev.pl.cogs;
    drivers.push({ label: t("Cost of sales"), value: sg(dC), tone: dC <= 0 ? "good" : "bad" });
    const moves = cur.pl.opexLines.map(([n, v]) => [n, v - (prevMap.get(n) ?? 0)] as const).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
    for (const [n, d] of moves) if (d) drivers.push({ label: acc(n), value: sg(d), tone: d <= 0 ? "good" : "bad" });
    return { text: t(dNet >= 0 ? "Net profit increased by {amt} in {cur} vs {prev} ({a} → {b}). Main drivers:" : "Net profit decreased by {amt} in {cur} vs {prev} ({a} → {b}). Main drivers:", { amt: f(Math.abs(dNet)), cur: mon(cur.month), prev: mon(prev.month), a: f(prev.pl.net), b: f(cur.pl.net) }), query: `SELECT fs_line, SUM(amount) FROM posted_lines WHERE month IN ('${prev.month}','${cur.month}') GROUP BY month, fs_line`, rows: drivers };
  }
  if (/90|30|60|overdue|ageing|aging|owe|receivable|customers|متأخر|العملاء|مدين/.test(s)) {
    const n = /(\d+)/.exec(s)?.[1] ? Number(/(\d+)/.exec(s)![1]) : 60;
    const over = ctx.ageing.filter((a) => a.days > n);
    return { text: over.length ? t("{n} customer invoice(s) are past {d} days, totalling {amt}.", { n: over.length, d: n, amt: f(over.reduce((a, b) => a + b.amount, 0)) }) : t("No customers are over that age bucket."), query: "SELECT customer, days_overdue, balance FROM ar_open_items WHERE days_overdue > :n ORDER BY balance DESC", rows: over.map((o) => ({ label: `${o.name} · ${t("{n} days", { n: o.days })}`, value: f(o.amount) })) };
  }
  if (/vat|ضريبة القيمة/.test(s) && !/fuel|show|وقود/.test(s)) return { text: t(ctx.vatNet >= 0 ? "Net VAT position for the current quarter is payable: {amt}." : "Net VAT position for the current quarter is refundable: {amt}.", { amt: f(Math.abs(ctx.vatNet)) }), query: "buildVat201(posted_lines WHERE date IN current_quarter)" };
  const AR_KW: Record<string, string> = { "وقود": "fuel", "إيجار": "rent", "ضيافة": "entertain", "تسويق": "marketing", "رواتب": "salar", "مرافق": "utilit", "غرام": "fine" };
  const arHit = Object.keys(AR_KW).find((k) => s.includes(k));
  const kw = arHit ? AR_KW[arHit] : /(fuel|rent|uber|travel|marketing|salar|entertain|dinner|utilit|fine|laptop|google|dewa)/.exec(s)?.[1];
  if (kw) {
    const key = kw === "entertain" ? "hospitality" : kw;
    const hits = ctx.journals.filter((j) => (j.memo + " " + j.ref).toLowerCase().includes(key) || (kw === "entertain" && /dinner|entertain/i.test(j.memo))).slice(-12);
    const tot = hits.reduce((a, j) => a + j.lines.reduce((x, l) => x + l.debit, 0), 0);
    return { text: t("Found {n} posted entries matching \"{kw}\" (gross {amt}). Each links to its source document and audit trail.", { n: hits.length, kw: arHit ?? kw, amt: f(tot) }), query: `SELECT * FROM journals WHERE memo ILIKE '%${key}%' AND status='POSTED'`, rows: hits.map((j) => ({ label: `${j.date} · ${j.ref} · ${j.memo}`, value: f(j.lines.reduce((x, l) => x + l.debit, 0)) })) };
  }
  if (/revenue|sales|إيراد|مبيعات/.test(s)) return { text: t("Revenue by month:"), query: "SELECT month, SUM(credit-debit) FROM posted_lines WHERE account LIKE '40%' GROUP BY month", rows: ctx.monthly.map((m) => ({ label: mon(m.month), value: f(m.pl.revenue) })) };
  if (/expense|cost|spend|مصروف|تكلف/.test(s)) { const last = ctx.monthly[ctx.monthly.length - 1]; return { text: t("Top operating expenses in {m}:", { m: last ? mon(last.month) : "" }), query: "SELECT account, SUM(debit-credit) FROM posted_lines WHERE type='EXPENSE' GROUP BY account ORDER BY 2 DESC", rows: last?.pl.opexLines.slice(0, 8).map(([n, v]) => ({ label: acc(n), value: f(v) })) }; }
  return { text: t("I can answer questions about profit movements, revenue/expenses by month, overdue customers, VAT position, and expense searches (e.g. fuel, rent, entertainment). Try one of the suggestions."), query: "—" };
}
