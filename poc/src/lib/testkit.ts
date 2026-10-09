/** Test helpers: build journals and orgs in AED with minimal boilerplate. */
import { toFils } from "./money";
import type { Journal, JLine, Org, TaxCode, Emirate } from "./types";

let n = 0;
export const aed = toFils;

export function journal(lines: JLine[], over: Partial<Journal> = {}): Journal {
  n += 1;
  return { id: `t-${n}`, orgId: "o1", date: "2026-08-15", ref: `T-${n}`, memo: "test", source: "MANUAL", status: "POSTED", lines, preparedBy: "a", approvedBy: "b", ...over };
}

/** Sale: Dr AR gross / Cr revenue net (+ Cr VAT output). */
export function sale(net: number, vat: number, taxCode: TaxCode, emirate?: Emirate, account = "4000"): Journal {
  const lines: JLine[] = [
    { account: "1100", debit: aed(net + vat), credit: 0 },
    { account, debit: 0, credit: aed(net), taxCode, vat: aed(vat), emirate },
  ];
  if (vat) lines.push({ account: "2100", debit: 0, credit: aed(vat) });
  return journal(lines, { source: "SALE" });
}

/** Purchase: Dr expense net (+ Dr VAT input) / Cr AP gross. */
export function purchase(account: string, net: number, vat: number, taxCode: TaxCode): Journal {
  if (taxCode === "BLK") return journal([{ account, debit: aed(net + vat), credit: 0, taxCode, vat: aed(vat) }, { account: "2000", debit: 0, credit: aed(net + vat) }], { source: "PURCHASE" });
  if (taxCode === "RCS") return journal([
    { account, debit: aed(net), credit: 0, taxCode, vat: aed(vat) },
    { account: "1310", debit: aed(vat), credit: 0 },
    { account: "2110", debit: 0, credit: aed(vat) },
    { account: "2000", debit: 0, credit: aed(net) },
  ], { source: "PURCHASE" });
  const lines: JLine[] = [{ account, debit: aed(net), credit: 0, taxCode, vat: aed(vat) }];
  if (vat) lines.push({ account: "1300", debit: aed(vat), credit: 0 });
  lines.push({ account: "2000", debit: 0, credit: aed(net + vat) });
  return journal(lines, { source: "PURCHASE" });
}

/** Simple expense paid from bank, no VAT tagging. */
export const expense = (account: string, amount: number) => journal([{ account, debit: aed(amount), credit: 0 }, { account: "1010", debit: 0, credit: aed(amount) }]);

export function org(over: Partial<Org> = {}): Org {
  return {
    id: "o1", name: "Test LLC", nameAr: "", trn: "100000000000003", emirate: "AUH", industry: "Trading", regime: "standard", vatPeriod: "QUARTERLY",
    fyEnd: "2026-12-31", priorRevenue: 0, licenceExpiry: "2027-01-01", color: "#000", assignedTo: "x",
    ...over,
  };
}
