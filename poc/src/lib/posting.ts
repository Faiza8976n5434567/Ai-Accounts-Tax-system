/** Posting rules: how a document becomes journal lines. One place, used by preview and posting. */
import { vatOnNet } from "./vat";
import type { JLine, PurchaseDoc } from "./types";

/** Purchase bill → journal lines (Spec 01 §4.7). */
export function purchaseLines(p: Pick<PurchaseDoc, "account" | "taxCode" | "net" | "vat" | "total" | "supplierTrn">): JLine[] {
  if (p.taxCode === "RCS") {
    // Reverse charge: self-account output and input VAT (Boxes 3 & 10); supplier is paid the net.
    const vat = vatOnNet(p.net);
    return [
      { account: p.account, debit: p.net, credit: 0, taxCode: "RCS", vat },
      { account: "1310", debit: vat, credit: 0 },
      { account: "2110", debit: 0, credit: vat },
      { account: "2000", debit: 0, credit: p.total },
    ];
  }
  // Blocked input VAT, or VAT charged by a supplier without a TRN: whole amount is cost.
  if (p.taxCode === "BLK" || (!p.supplierTrn && p.vat > 0)) return [{ account: p.account, debit: p.total, credit: 0, taxCode: "BLK", vat: p.vat }, { account: "2000", debit: 0, credit: p.total }];
  if (p.taxCode === "SR") return [{ account: p.account, debit: p.net, credit: 0, taxCode: "SR", vat: p.vat }, { account: "1300", debit: p.vat, credit: 0 }, { account: "2000", debit: 0, credit: p.total }];
  return [{ account: p.account, debit: p.total, credit: 0, taxCode: p.taxCode }, { account: "2000", debit: 0, credit: p.total }];
}
