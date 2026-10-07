import { describe, expect, it } from "vitest";
import { attachmentPath, billTotals, debitRemaining, sha256Hex, uploadProblem } from "./bills";
import { lineAmounts } from "./invoices";

describe("purchase bill totals (mirrors app.review_purchase_bill)", () => {
  it("VAT-06 · 25,000 + 1,250 from a registered supplier: VAT recovered, payable 26,250", () => {
    const l = lineAmounts(10000n, 2500000, 500, "1");
    expect(billTotals([{ taxCode: "SR", ...l }], true)).toEqual({ net: 2500000, vat: 125000, recoverable: 125000, payable: 2625000 });
  });
  it("VAT-05 · reverse charge 6,000: VAT 300 self-assessed and recovered, supplier owed 6,000", () => {
    const l = lineAmounts(10000n, 600000, 500, "1");
    expect(billTotals([{ taxCode: "RCS", ...l }], false)).toEqual({ net: 600000, vat: 30000, recoverable: 30000, payable: 600000 });
  });
  it("VAT-07 · blocked entertainment 3,800 + 190: nothing recovered, payable 3,990", () => {
    const l = lineAmounts(10000n, 380000, 500, "1");
    expect(billTotals([{ taxCode: "BLK", ...l }], true)).toEqual({ net: 380000, vat: 19000, recoverable: 0, payable: 399000 });
  });
  it("VAT-08 · failed checks: standard-rated VAT not recovered (D-32)", () => {
    const l = lineAmounts(10000n, 100000, 500, "1");
    expect(billTotals([{ taxCode: "SR", ...l }], false).recoverable).toBe(0);
  });
  it("USD 1,000 → AED 3,672.50 + VAT 183.63 (half-up on the AED line)", () => {
    const l = lineAmounts(10000n, 100000, 500, "3.6725");
    expect(billTotals([{ taxCode: "SR", ...l }], true)).toEqual({ net: 367250, vat: 18363, recoverable: 18363, payable: 385613 });
  });
});

describe("debit notes", () => {
  it("what is left after posted debit notes only", () => {
    const bill = { id: "b", net_total: 2500000, vat_total: 125000 };
    const all = [
      { original_bill_id: "b", status: "posted" as const, net_total: 500000, vat_total: 25000 },
      { original_bill_id: "b", status: "draft" as const, net_total: 900000, vat_total: 45000 },
      { original_bill_id: "x", status: "posted" as const, net_total: 100, vat_total: 5 },
    ];
    expect(debitRemaining(bill, all)).toEqual({ net: 2000000, vat: 100000 });
  });
});

describe("attachments (S-2.5, DM-08)", () => {
  it("accepts PDF/JPG/PNG up to 10 MB only", () => {
    expect(uploadProblem({ type: "application/pdf", size: 52_000 })).toBeNull();
    expect(uploadProblem({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
    expect(uploadProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(uploadProblem({ type: "application/zip", size: 10 })).toMatch(/PDF, JPG or PNG/);
    expect(uploadProblem({ type: "application/pdf", size: 0 })).toMatch(/empty/);
  });
  it("stores under the client's private folder, named by content hash", () => {
    expect(attachmentPath("org1", "bill1", "ab".repeat(32), "image/jpeg")).toBe(`org1/bills/bill1/${"ab".repeat(32)}.jpg`);
  });
  it("SHA-256 of 'abc' is the standard test vector", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
