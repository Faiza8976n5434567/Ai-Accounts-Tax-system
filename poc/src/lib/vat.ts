/** VAT 201 builder from posted journal lines tagged with tax codes. Box map: docs/UAE_COMPLIANCE_RULES.md §1. */
import { ACC } from "./coa";
import type { Journal, Emirate } from "./types";
import { applyBp, type Fils } from "./money";
import { TAX_CONFIG } from "./config";

/** F-01: VAT on a net amount at the standard rate, half-up to the fils. */
export const vatOnNet = (net: Fils, rateBp: number = TAX_CONFIG.vat.rateBp.value): Fils => applyBp(net, rateBp);

/** F-02: VAT contained in a VAT-inclusive (gross) amount: gross × rate ÷ (10,000 + rate), half-up. */
export function vatInGross(gross: Fils, rateBp: number = TAX_CONFIG.vat.rateBp.value): Fils {
  const raw = (gross * rateBp) / (10_000 + rateBp);
  return raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
}

/** Net amount grossed up by the standard rate (display ratios only). */
export const withVat = (net: Fils): Fils => net + vatOnNet(net);

export type Box = "1a" | "1b" | "1c" | "1d" | "1e" | "1f" | "1g" | "3" | "4" | "5" | "6" | "9" | "10";
export interface BoxVal { amount: Fils; vat: Fils; refs: { jid: string; ref: string; date: string; amount: Fils; vat: Fils; memo: string }[] }
const EBOX: Record<Emirate, Box> = { AUH: "1a", DXB: "1b", SHJ: "1c", AJM: "1d", UAQ: "1e", RAK: "1f", FUJ: "1g" };
export const BOX_LABEL: Record<string, string> = {
  "1a": "Standard rated supplies — Abu Dhabi", "1b": "Standard rated supplies — Dubai", "1c": "Standard rated supplies — Sharjah",
  "1d": "Standard rated supplies — Ajman", "1e": "Standard rated supplies — Umm Al Quwain", "1f": "Standard rated supplies — Ras Al Khaimah",
  "1g": "Standard rated supplies — Fujairah", "3": "Supplies subject to reverse charge", "4": "Zero rated supplies", "5": "Exempt supplies",
  "6": "Goods imported into the UAE", "9": "Standard rated expenses", "10": "Supplies subject to reverse charge (input)",
};

export function buildVat201(js: Journal[]) {
  const keys: Box[] = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "3", "4", "5", "6", "9", "10"];
  const boxes = Object.fromEntries(keys.map((k) => [k, { amount: 0, vat: 0, refs: [] }])) as unknown as Record<Box, BoxVal>;
  const blocked: BoxVal = { amount: 0, vat: 0, refs: [] };
  const warnings: string[] = [];
  const add = (b: BoxVal, j: Journal, amount: Fils, vat: Fils) => { b.amount += amount; b.vat += vat; b.refs.push({ jid: j.id, ref: j.ref, date: j.date, amount, vat, memo: j.memo }); };

  for (const j of js) for (const l of j.lines) {
    if (!l.taxCode) continue;
    const isSale = ACC[l.account]?.type === "REVENUE";
    const net = isSale ? l.credit - l.debit : l.debit - l.credit;
    const vat = l.vat ?? 0;
    if (isSale) {
      if (l.taxCode === "SR") { if (!l.emirate) warnings.push(`${j.ref}: standard-rated sale without emirate — defaulted to Abu Dhabi.`); add(boxes[EBOX[l.emirate ?? "AUH"]], j, net, vat); }
      else if (l.taxCode === "ZR") add(boxes["4"], j, net, 0);
      else if (l.taxCode === "EX") add(boxes["5"], j, net, 0);
    } else {
      if (l.taxCode === "SR") add(boxes["9"], j, net, vat);
      else if (l.taxCode === "RCS") { add(boxes["3"], j, net, vat); add(boxes["10"], j, net, vat); }
      else if (l.taxCode === "BLK") add(blocked, j, net, vat);
    }
  }
  const outKeys: Box[] = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "3", "4", "5", "6"];
  const box8 = outKeys.reduce((a, k) => ({ amount: a.amount + boxes[k].amount, vat: a.vat + boxes[k].vat }), { amount: 0, vat: 0 });
  const box11 = { amount: boxes["9"].amount + boxes["10"].amount, vat: boxes["9"].vat + boxes["10"].vat };
  return { configVersion: TAX_CONFIG.version, boxes, blocked, box8, box11, box12: box8.vat, box13: box11.vat, box14: box8.vat - box11.vat, warnings };
}

export function quarters(year = 2026) {
  return [1, 2, 3, 4].map((q) => {
    const from = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
    const endMonth = q * 3;
    const last = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    const to = `${year}-${String(endMonth).padStart(2, "0")}-${last}`;
    const due = new Date(Date.UTC(year, endMonth - 1, last + TAX_CONFIG.vat.returnDueDays.value)).toISOString().slice(0, 10);
    return { key: `Q${q}-${year}`, label: `Q${q} ${year}`, from, to, due };
  });
}
