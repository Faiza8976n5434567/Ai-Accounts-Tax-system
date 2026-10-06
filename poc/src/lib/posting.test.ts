import { describe, expect, it } from "vitest";
import { purchaseLines } from "./posting";
import { validateJournal } from "./ledger";
import { vatInGross, vatOnNet } from "./vat";
import { invoiceTotals } from "./einvoice";
import { aed } from "./testkit";
import type { SalesInvoice } from "./types";

const bill = (over: Partial<Parameters<typeof purchaseLines>[0]>) => ({ account: "6100", taxCode: "SR" as const, net: aed(1_000), vat: aed(50), total: aed(1_050), supplierTrn: "100000000000003", ...over });

describe("VAT helpers (rates from config)", () => {
  it("F-01: 5% of 1,000.00 = 50.00", () => expect(vatOnNet(aed(1_000))).toBe(aed(50)));
  it("F-02 / VAT-17: VAT inside a gross 10,500 = 500 (× 5/105)", () => expect(vatInGross(aed(10_500))).toBe(aed(500)));
  it("F-02: VAT inside a gross 58.50 = 2.79 (half-up)", () => expect(vatInGross(aed(58.5))).toBe(279));
});

describe("purchase posting rules", () => {
  it("standard-rated bill: Dr expense net + Dr input VAT / Cr AP gross, balanced", () => {
    const l = purchaseLines(bill({}));
    expect(validateJournal(l)).toEqual([]);
    expect(l.find((x) => x.account === "1300")?.debit).toBe(aed(50));
  });

  it("VAT-05: reverse charge self-accounts 5% output and input VAT; supplier paid the net", () => {
    const l = purchaseLines(bill({ taxCode: "RCS", net: aed(6_000), vat: 0, total: aed(6_000), supplierTrn: "" }));
    expect(validateJournal(l)).toEqual([]);
    expect(l.find((x) => x.account === "1310")?.debit).toBe(aed(300));
    expect(l.find((x) => x.account === "2110")?.credit).toBe(aed(300));
    expect(l.find((x) => x.account === "2000")?.credit).toBe(aed(6_000));
  });

  it("VAT-08: VAT charged by a supplier without a TRN is not recoverable — full amount is cost", () => {
    const l = purchaseLines(bill({ supplierTrn: "" }));
    expect(l.some((x) => x.account === "1300")).toBe(false);
    expect(l[0]).toMatchObject({ account: "6100", debit: aed(1_050), taxCode: "BLK" });
  });

  it("VAT-07: blocked input VAT (entertainment) — full amount is cost", () => {
    const l = purchaseLines(bill({ account: "6140", taxCode: "BLK", net: aed(3_800), vat: aed(190), total: aed(3_990) }));
    expect(validateJournal(l)).toEqual([]);
    expect(l[0].debit).toBe(aed(3_990));
  });
});

describe("sales invoice totals", () => {
  it("line VAT from config rate; zero-rated lines carry no VAT", () => {
    const inv = { lines: [{ desc: "Goods", qty: 2, price: aed(5_000), taxCode: "SR", account: "4000" }, { desc: "Export", qty: 1, price: aed(1_000), taxCode: "ZR", account: "4000" }] } as SalesInvoice;
    expect(invoiceTotals(inv)).toMatchObject({ net: aed(11_000), vat: aed(500), total: aed(11_500) });
  });
});
