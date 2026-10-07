import { describe, expect, it } from "vitest";
import { creditRemaining, documentTotals, lineAmounts, parseQuantity, taxDateWarnings } from "./invoices";

const SR = 500; // 5% in basis points (the database reads it from the tax rules)

describe("lineAmounts — same results as the database (F-01, F-24)", () => {
  it("VAT-01 · net 10,000 → VAT 500", () => expect(lineAmounts(10000n, 1000000, SR, "1")).toEqual({ netFcy: 1000000, vatFcy: 50000, net: 1000000, vat: 50000 }));
  it("VAT-09 · 33.33 → VAT 1.67 per line; three lines total 5.01", () => {
    const l = lineAmounts(10000n, 3333, SR, "1");
    expect(l.vat).toBe(167);
    expect(documentTotals([l, l, l]).vat).toBe(501);
  });
  it("fractional quantity: 1.5 × 10.01 = 15.015 → 15.02 (half-up)", () => expect(lineAmounts(15000n, 1001, SR, "1").net).toBe(1502));
  it("FX-01 · USD 1,000.00 → AED 3,672.50, VAT 183.63 (183.625 half-up), USD gross 1,050.00", () => {
    const l = lineAmounts(10000n, 100000, SR, "3.6725");
    expect(l).toEqual({ netFcy: 100000, vatFcy: 5000, net: 367250, vat: 18363 });
    expect(documentTotals([l])).toMatchObject({ gross: 385613, grossFcy: 105000 });
  });
  it("zero-rated / exempt lines have no VAT", () => expect(lineAmounts(10000n, 2000000, 0, "1").vat).toBe(0));
  it("large amounts stay exact (no floating point): 1,234.5678 × AED 1,234,567.89", () =>
    expect(lineAmounts(12345678n, 123456789, SR, "1")).toMatchObject({ net: 152415776391, vat: 7620788820 }));
});

describe("parseQuantity", () => {
  it("up to 4 decimals", () => {
    expect(parseQuantity("1.5")).toBe(15000n);
    expect(parseQuantity("2")).toBe(20000n);
    expect(parseQuantity("0.0001")).toBe(1n);
  });
  it("refuses zero, negatives, text and 5 decimals", () => {
    for (const bad of ["0", "-1", "abc", "1.23456", ""]) expect(parseQuantity(bad)).toBeNull();
  });
});

describe("taxDateWarnings — D-29 / Art 67", () => {
  const periods = [{ start_date: "2026-06-01", end_date: "2026-08-31" }, { start_date: "2026-09-01", end_date: "2026-11-30" }];
  it("no warnings when supply and invoice dates are close and in the same period", () => expect(taxDateWarnings("2026-10-05", "2026-10-01", periods, 14)).toEqual([]));
  it("warns when issued more than 14 days after the supply", () => expect(taxDateWarnings("2026-10-20", "2026-10-01", periods, 14)[0]).toMatch(/19 days after the supply/));
  it("warns when the supply is in an earlier VAT period", () => expect(taxDateWarnings("2026-09-02", "2026-08-31", periods, 14).join(" ")).toMatch(/earlier VAT period/));
  it("no supply date → no warnings", () => expect(taxDateWarnings("2026-10-05", null, periods, 14)).toEqual([]));
});

describe("creditRemaining — D-30", () => {
  it("what is left after posted credit notes (drafts don't count)", () => {
    const inv = { id: "i1", net_total: 1000000, vat_total: 50000 };
    const docs = [{ original_invoice_id: "i1", status: "posted" as const, net_total: 200000, vat_total: 10000 }, { original_invoice_id: "i1", status: "draft" as const, net_total: 900000, vat_total: 45000 }];
    expect(creditRemaining(inv, docs)).toEqual({ net: 800000, vat: 40000 });
  });
});
