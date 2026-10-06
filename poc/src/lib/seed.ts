/** Deterministic demo data: 3 UAE SME clients, Jan–Sep 2026. */
import { applyBp, toFils } from "./money";
import { review } from "./ai";
import { TAX_CONFIG } from "./config";
import type { AppState, Journal, JLine, Org, SalesInvoice, BankLine, PurchaseDoc, Emirate, TaxCode } from "./types";

let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
const pad = (n: number) => String(n).padStart(2, "0");

export const ORGS: Org[] = [
  { id: "alnoor", name: "Al Noor General Trading LLC", nameAr: "النور للتجارة العامة ذ.م.م", trn: "100384729100003", emirate: "AUH", industry: "Trading", regime: "standard", vatPeriod: "QUARTERLY", fyEnd: "2026-12-31", priorRevenue: toFils(3_900_000), licenceExpiry: "2026-10-22", color: "#059669", assignedTo: "Aisha", autoApprove: { enabled: true, maxAmount: toFils(5000), minConfidence: 0.9 } },
  { id: "brightpath", name: "Bright Path Consultancy LLC", nameAr: "المسار المشرق للاستشارات ذ.م.م", trn: "100519283700003", emirate: "DXB", industry: "Professional services", regime: "sbr", vatPeriod: "QUARTERLY", fyEnd: "2026-12-31", priorRevenue: toFils(2_350_000), licenceExpiry: "2027-03-14", color: "#6366f1", assignedTo: "Aisha", autoApprove: { enabled: true, maxAmount: toFils(3000), minConfidence: 0.9 } },
  { id: "gulffresh", name: "Gulf Fresh Restaurants LLC", nameAr: "مطاعم الخليج الطازجة ذ.م.م", trn: "100672910400003", emirate: "SHJ", industry: "Food & beverage", regime: "standard", vatPeriod: "QUARTERLY", fyEnd: "2026-12-31", priorRevenue: toFils(6_100_000), licenceExpiry: "2026-11-30", color: "#f59e0b", assignedTo: "Rahul", autoApprove: { enabled: false, maxAmount: toFils(2000), minConfidence: 0.95 } },
];

const CUSTOMERS: Record<string, { name: string; trn: string; country: string; emirate: Emirate }[]> = {
  alnoor: [
    { name: "Emirates Build Mart LLC", trn: "100211938400003", country: "AE", emirate: "AUH" },
    { name: "Dubai Retail Hub LLC", trn: "100938172600003", country: "AE", emirate: "DXB" },
    { name: "Sharjah Hardware Co.", trn: "100563729100003", country: "AE", emirate: "SHJ" },
    { name: "Muscat Traders SAOC (Oman)", trn: "", country: "OM", emirate: "AUH" },
    { name: "RAK Ceramics Distributors", trn: "100728193600003", country: "AE", emirate: "RAK" },
  ],
  brightpath: [
    { name: "Nakheel Facilities Mgmt", trn: "100118273600003", country: "AE", emirate: "DXB" },
    { name: "Abu Dhabi Ports Logistics", trn: "100283746500003", country: "AE", emirate: "AUH" },
    { name: "Bahrain FinTech WLL", trn: "", country: "BH", emirate: "DXB" },
    { name: "Ajman Free Zone Co.", trn: "100837261900003", country: "AE", emirate: "AJM" },
  ],
  gulffresh: [
    { name: "Walk-in customers (POS)", trn: "", country: "AE", emirate: "SHJ" },
    { name: "Talabat Delivery", trn: "100493827100003", country: "AE", emirate: "DXB" },
    { name: "Corporate catering — ADNOC", trn: "100022339800003", country: "AE", emirate: "AUH" },
  ],
};

export function buildSeed(): AppState {
  s = 42;
  let n = 0;
  const id = (p: string) => `${p}-${(++n).toString(36)}`;
  const journals: Journal[] = [];
  const sales: SalesInvoice[] = [];
  const bank: BankLine[] = [];
  const J = (orgId: string, date: string, ref: string, memo: string, source: Journal["source"], lines: JLine[], preparedBy = "Aisha (Accountant)"): Journal => {
    const j: Journal = { id: id("j"), orgId, date, ref, memo, source, status: "POSTED", lines, preparedBy, approvedBy: "Faizan (Partner)", postedAt: date + "T10:00:00Z" };
    if (source === "PURCHASE" && rnd() > 0.25) { j.ai = { confidence: 0.88 + rnd() * 0.1, reasoning: "Auto-classified from supplier and description patterns." }; j.preparedBy = "AI assistant"; }
    journals.push(j); return j;
  };
  const exp = (orgId: string, date: string, ref: string, memo: string, acc: string, net: number, tc: TaxCode | undefined, viaAp = false) => {
    const nf = toFils(net), vat = tc === "SR" || tc === "BLK" ? applyBp(nf, 500) : 0;
    const lines: JLine[] = tc === "BLK"
      ? [{ account: acc, debit: nf + vat, credit: 0, taxCode: "BLK", vat }]
      : [{ account: acc, debit: nf, credit: 0, taxCode: tc, vat: tc === "SR" ? vat : undefined }];
    if (tc === "SR") lines.push({ account: "1300", debit: vat, credit: 0 });
    lines.push({ account: viaAp ? "2000" : "1010", debit: 0, credit: nf + vat });
    return J(orgId, date, ref, memo, "PURCHASE", lines);
  };

  for (const org of ORGS) {
    const scale = org.id === "alnoor" ? 1 : org.id === "brightpath" ? 0.5 : 1.35;
    J(org.id, "2026-01-01", "OB-2026", "Opening balances 1 Jan 2026", "OPENING", [
      { account: "1010", debit: toFils(420_000 * scale), credit: 0 },
      { account: "1500", debit: toFils(180_000 * scale), credit: 0 },
      { account: "1510", debit: 0, credit: toFils(40_000 * scale) },
      { account: "3000", debit: 0, credit: toFils(300_000) },
      { account: "3200", debit: 0, credit: toFils(260_000 * scale - 300_000 + 180_000 * scale - 40_000 * scale + 300_000 - 260_000 * scale + 260_000 * scale) },
    ]);
    // fix opening to balance exactly
    const ob = journals[journals.length - 1];
    const dr = ob.lines.reduce((a, l) => a + l.debit, 0), cr = ob.lines.slice(0, 4).reduce((a, l) => a + l.credit, 0);
    ob.lines[4].credit = dr - cr;

    let invSeq = 1000;
    const sup = org.id === "gulffresh" ? "Al Islami Foods LLC" : org.id === "brightpath" ? "Talent Hub FZE" : "Gulf Wholesale Trading LLC";
    const apOpen: { ref: string; party: string; amt: number }[] = [];
    const bill = (j: Journal, party: string) => { j.party = party; apOpen.push({ ref: j.ref, party, amt: j.lines.find((l) => l.account === "2000")!.credit }); };
    const revAcc = org.id === "brightpath" ? "4010" : "4000";
    for (let m = 1; m <= 9; m++) {
      const mm = `2026-${pad(m)}`;
      const dip = org.id === "alnoor" && m === 9 ? 0.78 : 1;
      const nSales = org.id === "gulffresh" ? 4 : 3;
      for (let k = 0; k < nSales; k++) {
        const c = CUSTOMERS[org.id][k % CUSTOMERS[org.id].length === 0 ? 0 : between(0, CUSTOMERS[org.id].length - 1)];
        const tc: TaxCode = c.country !== "AE" ? "ZR" : "SR";
        const price = toFils(between(90_000, 150_000) * scale * dip / nSales * 2.9);
        const day = pad(between(3, 26));
        const inv: SalesInvoice = {
          id: id("s"), orgId: org.id, invNo: `INV-${org.id.slice(0, 2).toUpperCase()}-${++invSeq}`, date: `${mm}-${day}`, dueDate: `${mm}-${day}`,
          customer: c.name, customerTrn: c.trn, customerCountry: c.country, emirate: c.emirate,
          lines: [{ desc: tc === "ZR" ? "Export of goods — international shipment" : org.id === "brightpath" ? "Advisory services" : org.id === "gulffresh" ? "Food & beverage sales" : "Building materials supply", qty: 1, price, taxCode: tc, account: revAcc }],
          status: "POSTED", einv: "NOT_SENT", einvLog: [],
        };
        const due = new Date(inv.date); due.setDate(due.getDate() + 30); inv.dueDate = due.toISOString().slice(0, 10);
        const vat = tc === "SR" ? applyBp(price, 500) : 0;
        const jj = J(org.id, inv.date, inv.invNo, `Sales invoice — ${c.name}`, "SALE", [
          { account: "1100", debit: price + vat, credit: 0 },
          { account: revAcc, debit: 0, credit: price, taxCode: tc, vat, emirate: c.emirate },
          ...(vat ? [{ account: "2100", debit: 0, credit: vat }] : []),
        ]);
        inv.journalId = jj.id; jj.party = c.name;
        const paid = m <= 6 || (m === 7 && k > 0) || (m === 8 && k === 0);
        if (paid) {
          inv.status = "PAID";
          const pd = new Date(inv.date); pd.setDate(pd.getDate() + between(15, 40));
          const pds = pd.toISOString().slice(0, 10) > "2026-09-30" ? "2026-09-29" : pd.toISOString().slice(0, 10);
          const rj = J(org.id, pds, `RCPT-${inv.invNo}`, `Receipt — ${c.name}`, "BANK", [{ account: "1010", debit: price + vat, credit: 0 }, { account: "1100", debit: 0, credit: price + vat }]);
          rj.party = c.name;
          if (pds.startsWith("2026-09")) bank.push({ id: id("b"), orgId: org.id, date: pds, desc: `INWARD TT ${c.name.toUpperCase().slice(0, 22)}`, amount: price + vat, journalId: org.id === "alnoor" ? undefined : rj.id });
        }
        sales.push(inv);
      }
      // costs
      // AP: last month's supplier bills are paid on the 10th (Al Noor pays only 60% of August stock → overdue balance)
      for (const b of apOpen.splice(0)) {
        const amt = org.id === "alnoor" && m === 9 && b.party === sup ? Math.round(b.amt * 0.6) : b.amt;
        const pj = J(org.id, `${mm}-10`, `PAY-${b.ref}`, `Supplier payment — ${b.party}`, "BANK", [{ account: "2000", debit: amt, credit: 0 }, { account: "1010", debit: 0, credit: amt }]);
        pj.party = b.party;
      }
      if (org.id !== "brightpath") bill(exp(org.id, `${mm}-05`, `PO-${m}01`, org.id === "gulffresh" ? "Food supplies — Al Islami Foods" : "Purchase of trading goods — Gulf Wholesale", "5000", between(120_000, 150_000) * scale * dip, "SR", true), sup);
      else bill(exp(org.id, `${mm}-07`, `SUB-${m}`, "Subcontracted consultants — Talent Hub FZE", "5010", between(40_000, 55_000), "SR", true), sup);
      if (m === 7) { bill(exp(org.id, `${mm}-20`, "AUD-H1-2026", "Half-year review fee — Al Masar Audit & Advisory", "6130", 18_000, "SR", true), "Al Masar Audit & Advisory"); apOpen.pop(); }
      const sal = toFils(between(62_000, 66_000) * scale + (org.id === "alnoor" && m >= 8 ? 18_000 : 0));
      const sj = J(org.id, `${mm}-28`, `WPS-${mm}`, `Salaries ${mm} — WPS run`, "BANK", [{ account: "6000", debit: sal, credit: 0 }, { account: "1010", debit: 0, credit: sal }]);
      if (m === 9) bank.push({ id: id("b"), orgId: org.id, date: sj.date, desc: "WPS SALARY TRANSFER", amount: -sal, journalId: org.id === "alnoor" ? undefined : sj.id });
      J(org.id, `${mm}-28`, `EOSB-${mm}`, "End-of-service benefits accrual (IAS 19)", "MANUAL", [{ account: "6010", debit: toFils(4_200 * scale), credit: 0 }, { account: "2500", debit: 0, credit: toFils(4_200 * scale) }]);
      const rent = org.id === "alnoor" && m === 9 ? 38_000 : 22_000 * Math.max(scale, 0.6);
      const rj = exp(org.id, `${mm}-01`, `RENT-${mm}`, "Office / warehouse rent — Aldar Properties", "6100", rent, "SR");
      if (m === 9) bank.push({ id: id("b"), orgId: org.id, date: rj.date, desc: "DD ALDAR PROPERTIES PJSC", amount: -rj.lines[rj.lines.length - 1].credit, journalId: org.id === "alnoor" ? undefined : rj.id });
      const util = org.emirate === "SHJ" ? "SEWA" : org.emirate === "DXB" ? "DEWA" : "ADDC";
      bill(exp(org.id, `${mm}-12`, `UTIL-${mm}`, `${util} electricity & water`, "6110", between(3_500, 6_000) * scale, "SR", true), util);
      exp(org.id, `${mm}-15`, `FUEL-${mm}`, "ADNOC fuel card — fleet", "6060", between(1_800, 3_200) * scale, "SR");
      exp(org.id, `${mm}-17`, `TRV-${mm}`, "Uber / Careem business travel", "6050", between(900, 2_400), "SR");
      exp(org.id, `${mm}-19`, `MKT-${mm}`, "Google Ads & Meta marketing", "6150", between(4_000, 9_000) * scale, "SR");
      if (m % 2 === 0) exp(org.id, `${mm}-22`, `ENT-${mm}`, "Client dinner — hospitality", "6140", between(2_000, 5_500), "BLK");
      J(org.id, `${mm}-30`.replace("02-30", "02-28"), `DEP-${mm}`, "Monthly depreciation — PPE", "MANUAL", [{ account: "6200", debit: toFils(3_000 * scale), credit: 0 }, { account: "1510", debit: 0, credit: toFils(3_000 * scale) }]);
      J(org.id, `${mm}-25`, `BC-${mm}`, "Bank charges", "BANK", [{ account: "6400", debit: toFils(between(150, 400)), credit: 0 }, { account: "1010", debit: 0, credit: toFils(0) }]).lines[1].credit = journals[journals.length - 1].lines[0].debit;
      if (m === 4) exp(org.id, `${mm}-09`, "FINE-ADP", "Abu Dhabi Police traffic fine", "6160", 1_500, "OS");
      if (m === 6 && org.id !== "gulffresh") exp(org.id, `${mm}-11`, "DON-01", "Donation — community event (non-QPBE)", "6170", 5_000, "OS");
      if (m === 3) exp(org.id, `${mm}-14`, "LIC-2026", "Trade licence renewal — DED", "6120", 14_500, "OS");
    }
    if (org.id === "alnoor") {
      bank.push({ id: id("b"), orgId: org.id, date: "2026-09-29", desc: "POS ENOC 4471 ABU DHABI", amount: -toFils(210), suggestion: "6060" });
      bank.push({ id: id("b"), orgId: org.id, date: "2026-09-29", desc: "SALIK RECHARGE ONLINE", amount: -toFils(200), suggestion: "6050" });
      bank.push({ id: id("b"), orgId: org.id, date: "2026-09-30", desc: "ETISALAT BILL PAYMENT", amount: -toFils(1_890), suggestion: "6110" });
      bank.push({ id: id("b"), orgId: org.id, date: "2026-09-30", desc: "CARREFOUR MOE PERSONAL", amount: -toFils(640), suggestion: "6500" });
    }
  }

  // Every quarter, each client also has a zero-rated export (Box 4), an exempt residential
  // sublease (Box 5) and an imported service under reverse charge (Boxes 3 & 10).
  // Fixed amounts (no rnd) so the rest of the demo data is unchanged.
  const EXTRA: Record<string, { zr: { customer: string; country: string; desc: string; aed: number }; ex: { desc: string; aed: number }; rc: { supplier: string; desc: string; account: string; aed: number } }> = {
    alnoor: { zr: { customer: "Muscat Traders SAOC (Oman)", country: "OM", desc: "Export of goods — shipment to Oman", aed: 64_500 }, ex: { desc: "Staff accommodation sublease — residential (exempt)", aed: 12_000 }, rc: { supplier: "Google Ireland Ltd", desc: "Google Ads — imported service", account: "6150", aed: 8_400 } },
    brightpath: { zr: { customer: "Bahrain FinTech WLL", country: "BH", desc: "Advisory services — exported to Bahrain", aed: 38_000 }, ex: { desc: "Residential flat sublease — staff (exempt)", aed: 9_000 }, rc: { supplier: "Microsoft Ireland Operations Ltd", desc: "Microsoft 365 & Azure — imported service", account: "6180", aed: 5_600 } },
    gulffresh: { zr: { customer: "Muscat Food Co. (Oman)", country: "OM", desc: "Export of packaged food — shipment to Oman", aed: 27_000 }, ex: { desc: "Staff accommodation sublease — residential (exempt)", aed: 15_000 }, rc: { supplier: "Meta Platforms Ireland Ltd", desc: "Meta Ads — imported service", account: "6150", aed: 6_900 } },
  };
  for (const org of ORGS) {
    const x = EXTRA[org.id];
    const revAcc = org.id === "brightpath" ? "4010" : "4000";
    [2, 5, 8].forEach((m, q) => {
      const mm = `2026-${pad(m)}`;
      const grow = 1 + q / 10;
      // Box 4 — zero-rated export
      const zr = toFils(Math.round(x.zr.aed * grow));
      const inv: SalesInvoice = {
        id: id("s"), orgId: org.id, invNo: `EXP-${org.id.slice(0, 2).toUpperCase()}-${q + 1}`, date: `${mm}-14`, dueDate: `${mm}-28`,
        customer: x.zr.customer, customerTrn: "", customerCountry: x.zr.country, emirate: org.emirate,
        lines: [{ desc: x.zr.desc, qty: 1, price: zr, taxCode: "ZR", account: revAcc }], status: "POSTED", einv: "NOT_SENT", einvLog: [],
      };
      const zj = J(org.id, inv.date, inv.invNo, `Sales invoice — ${x.zr.customer}`, "SALE", [
        { account: "1100", debit: zr, credit: 0 },
        { account: revAcc, debit: 0, credit: zr, taxCode: "ZR", vat: 0, emirate: org.emirate },
      ]);
      zj.party = x.zr.customer; inv.journalId = zj.id; sales.push(inv);
      // Box 5 — exempt supply (residential sublease income, received quarterly)
      const ex = toFils(x.ex.aed);
      J(org.id, `${mm}-01`, `RES-${mm}`, x.ex.desc, "BANK", [
        { account: "1010", debit: ex, credit: 0 },
        { account: "4300", debit: 0, credit: ex, taxCode: "EX", vat: 0 },
      ]);
      // Boxes 3 & 10 — imported service, VAT self-accounted under reverse charge
      const rc = toFils(Math.round(x.rc.aed * grow));
      const rcVat = applyBp(rc, TAX_CONFIG.vat.rateBp.value);
      const rj = J(org.id, `${mm}-18`, `RC-${mm}`, `${x.rc.supplier} — ${x.rc.desc}`, "PURCHASE", [
        { account: x.rc.account, debit: rc, credit: 0, taxCode: "RCS", vat: rcVat },
        { account: "1310", debit: rcVat, credit: 0 },
        { account: "2110", debit: 0, credit: rcVat },
        { account: "1010", debit: 0, credit: rc },
      ]);
      rj.party = x.rc.supplier;
    });
  }

  const state: AppState = { orgs: ORGS, journals, purchases: [], sales, bank, audit: [], session: { role: "FIRM_PARTNER", user: "Faizan (Partner)", orgId: "FIRM", lang: "en" }, seq: n };
  // Seed an inbox with docs awaiting review (drives the Tax Risk dashboard)
  const inbox: Omit<PurchaseDoc, "checks" | "risk" | "riskScore">[] = [
    { id: id("p"), orgId: "alnoor", fileName: "quickprint_flyers.pdf", supplier: "Quick Print Services", supplierTrn: "", invNo: "QP-118", date: "2026-09-20", description: "Marketing flyers printing", net: toFils(2000), vat: toFils(150), total: toFils(2150), currency: "AED", hasHeading: false, customerName: "", account: "6150", taxCode: "SR", confidence: 0.91, reasoning: "Advertising / marketing vendor → Marketing and advertising.", status: "PENDING", createdAt: "2026-09-30T08:12:00Z", createdBy: "Priya (Finance)" },
    { id: id("p"), orgId: "alnoor", fileName: "steel_supplier_inv.jpg", supplier: "Emirates Steel Traders", supplierTrn: "10029381", invNo: "EST-2291", date: "2026-09-27", description: "Purchase of trading goods - steel rods", net: toFils(40000), vat: toFils(2000), total: toFils(42000), currency: "AED", hasHeading: true, customerName: "Al Noor General Trading LLC", account: "1200", taxCode: "SR", confidence: 0.9, reasoning: "Purchase of goods for resale → Inventory.", status: "PENDING", createdAt: "2026-09-30T09:40:00Z", createdBy: "Priya (Finance)" },
    { id: id("p"), orgId: "gulffresh", fileName: "majlis_catering.pdf", supplier: "Majlis Catering", supplierTrn: "", invNo: "MC-77", date: "2026-09-26", description: "Catering for client launch event", net: toFils(9000), vat: toFils(450), total: toFils(9450), currency: "AED", hasHeading: true, customerName: "", account: "6140", taxCode: "BLK", confidence: 0.86, reasoning: "Hospitality for non-employees → Client entertainment.", status: "PENDING", createdAt: "2026-09-29T14:00:00Z", createdBy: "Rahul (Accountant)" },
  ];
  state.purchases = inbox.map((d) => ({ ...d, ...review(d, []) }));
  state.seq = n;
  return state;
}
