/**
 * UAE VAT engine: line-level VAT and VAT 201 return builder.
 * Pure functions. Amounts in fils. Credit notes = negative net amounts.
 * Box mapping must be re-verified against the live EmaraTax VAT 201 form (see
 * docs/UAE_COMPLIANCE_RULES.md §1).
 */
import { applyRateBp, assertInteger, type Fils } from "./money";
import { CURRENT_CONFIG, type UaeTaxConfig } from "./config/uae-tax-config";

export type Emirate = "AUH" | "DXB" | "SHJ" | "AJM" | "UAQ" | "RAK" | "FUJ";

export type TaxCode =
  | "SR"   // standard rated 5%
  | "ZR"   // zero rated
  | "EX"   // exempt
  | "OS"   // out of scope
  | "RCS"  // reverse charge — imported services / goods from abroad not via customs
  | "IMP"  // goods imported through UAE customs (reverse charge)
  | "BLK"; // standard-rated purchase with blocked input tax (Exec. Reg. Art 53)

export const TAX_CODES: Record<TaxCode, { labelEn: string; labelAr: string; rated: boolean }> = {
  SR: { labelEn: "Standard rated 5%", labelAr: "خاضع للنسبة الأساسية 5%", rated: true },
  ZR: { labelEn: "Zero rated", labelAr: "خاضع لنسبة الصفر", rated: false },
  EX: { labelEn: "Exempt", labelAr: "معفى", rated: false },
  OS: { labelEn: "Out of scope", labelAr: "خارج النطاق", rated: false },
  RCS: { labelEn: "Reverse charge", labelAr: "احتساب عكسي", rated: true },
  IMP: { labelEn: "Imports via customs (reverse charge)", labelAr: "استيراد عبر الجمارك", rated: true },
  BLK: { labelEn: "Standard rated – input blocked", labelAr: "مدخلات غير قابلة للاسترداد", rated: true },
};

export interface VatLine {
  id: string;
  direction: "SALE" | "PURCHASE";
  taxCode: TaxCode;
  net: Fils;                 // AED fils; negative for credit/debit notes
  vat?: Fils;                // if omitted, computed at the standard rate for rated codes
  emirate?: Emirate;         // required for SR sales (Box 1a–1g)
  recoverableBp?: number;    // input apportionment, 10000 = fully recoverable
  isImportAdjustment?: boolean; // Box 7
}

export type BoxKey =
  | "1a" | "1b" | "1c" | "1d" | "1e" | "1f" | "1g"
  | "3" | "4" | "5" | "6" | "7" | "9" | "10";

export interface BoxValue { amount: Fils; vat: Fils; lineIds: string[] }

export interface Vat201 {
  configVersion: string;
  boxes: Record<BoxKey, BoxValue>;
  box8: { amount: Fils; vat: Fils };
  box11: { amount: Fils; vat: Fils };
  box12DueTax: Fils;
  box13RecoverableTax: Fils;
  box14Payable: Fils; // negative = refundable
  warnings: string[];
}

const EMIRATE_BOX: Record<Emirate, BoxKey> = {
  AUH: "1a", DXB: "1b", SHJ: "1c", AJM: "1d", UAQ: "1e", RAK: "1f", FUJ: "1g",
};

export function lineVat(line: VatLine, cfg: UaeTaxConfig = CURRENT_CONFIG): Fils {
  assertInteger(line.net, `net on ${line.id}`);
  if (line.vat !== undefined) return line.vat;
  return TAX_CODES[line.taxCode].rated ? applyRateBp(line.net, cfg.vat.standardRateBp.value) : 0;
}

export function buildVat201(lines: VatLine[], cfg: UaeTaxConfig = CURRENT_CONFIG): Vat201 {
  const keys: BoxKey[] = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "3", "4", "5", "6", "7", "9", "10"];
  const boxes = Object.fromEntries(keys.map((k) => [k, { amount: 0, vat: 0, lineIds: [] as string[] }])) as Record<BoxKey, BoxValue>;
  const warnings: string[] = [];

  const add = (k: BoxKey, amount: Fils, vat: Fils, id: string) => {
    boxes[k].amount += amount;
    boxes[k].vat += vat;
    boxes[k].lineIds.push(id);
  };

  for (const l of lines) {
    const vat = lineVat(l, cfg);
    const recBp = l.recoverableBp ?? 10_000;
    const recoverable = applyRateBp(vat, recBp);

    if (l.direction === "SALE") {
      switch (l.taxCode) {
        case "SR": {
          if (!l.emirate) { warnings.push(`Line ${l.id}: standard-rated sale without emirate — defaulted to Abu Dhabi, fix before filing.`); }
          add(EMIRATE_BOX[l.emirate ?? "AUH"], l.net, vat, l.id);
          break;
        }
        case "ZR": add("4", l.net, 0, l.id); break;
        case "EX": add("5", l.net, 0, l.id); break;
        case "OS": break;
        default: warnings.push(`Line ${l.id}: tax code ${l.taxCode} is not valid on a sale.`);
      }
    } else {
      switch (l.taxCode) {
        case "SR":
          add("9", l.net, recoverable, l.id);
          if (recBp < 10_000) warnings.push(`Line ${l.id}: input VAT apportioned at ${recBp / 100}%.`);
          break;
        case "RCS":
          add("3", l.net, vat, l.id);            // output side
          boxes["10"].amount += l.net; boxes["10"].vat += recoverable; boxes["10"].lineIds.push(l.id);
          break;
        case "IMP":
          add(l.isImportAdjustment ? "7" : "6", l.net, vat, l.id);
          boxes["10"].amount += l.net; boxes["10"].vat += recoverable; boxes["10"].lineIds.push(l.id);
          break;
        case "BLK":
          // Blocked input tax: not reported as recoverable. VERIFY whether the net
          // amount should appear in Box 9 with nil recoverable VAT per current FTA guide.
          break;
        case "ZR": case "EX": case "OS": break;
      }
    }
  }

  const outKeys: BoxKey[] = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "3", "4", "5", "6", "7"];
  const box8 = outKeys.reduce((a, k) => ({ amount: a.amount + boxes[k].amount, vat: a.vat + boxes[k].vat }), { amount: 0, vat: 0 });
  const box11 = { amount: boxes["9"].amount + boxes["10"].amount, vat: boxes["9"].vat + boxes["10"].vat };

  return {
    configVersion: cfg.version,
    boxes,
    box8,
    box11,
    box12DueTax: box8.vat,
    box13RecoverableTax: box11.vat,
    box14Payable: box8.vat - box11.vat,
    warnings,
  };
}

/** UAE TRN: 15 digits (format check only — validate live against FTA TRN verification). */
export const isValidTrnFormat = (trn: string): boolean => /^\d{15}$/.test(trn.replace(/\s|-/g, ""));
