import { describe, expect, it } from "vitest";
import { drCr, fyStart, tbTotals } from "./live-reports";

describe("drCr — balances in Debit / Credit columns", () => {
  it("debit balances go left, credit balances right", () => {
    expect(drCr(100000)).toEqual({ dr: 100000, cr: 0 });
    expect(drCr(-250050)).toEqual({ dr: 0, cr: 250050 });
    expect(drCr(0)).toEqual({ dr: 0, cr: 0 });
  });
});

describe("tbTotals", () => {
  it("totals a balanced trial balance (opening balances + Feb rent accrual and its reversal)", () => {
    const rows = [
      { opening: 5000000, debit: 0, credit: 0, closing: 5000000 },      // 1010 Bank
      { opening: -100000, debit: 50000, credit: 50000, closing: -100000 }, // 2010 Accruals
      { opening: -5000000, debit: 0, credit: 0, closing: -5000000 },     // 3000 Share capital
      { opening: 100000, debit: 50000, credit: 50000, closing: 100000 },   // 6100 Rent
    ];
    expect(tbTotals(rows)).toEqual({ openingDr: 5100000, openingCr: 5100000, debit: 100000, credit: 100000, closingDr: 5100000, closingCr: 5100000, balanced: true });
  });
  it("flags an imbalance (should never happen — the database refuses unbalanced journals)", () =>
    expect(tbTotals([{ opening: 0, debit: 100000, credit: 99999, closing: 1 }]).balanced).toBe(false));
});

describe("fyStart — default report range starts at the financial year", () => {
  it("calendar year", () => expect(fyStart("2026-10-07", 1)).toBe("2026-01-01"));
  it("April year, after April", () => expect(fyStart("2026-10-07", 4)).toBe("2026-04-01"));
  it("April year, before April → previous year", () => expect(fyStart("2026-02-15", 4)).toBe("2025-04-01"));
  it("first day of the year itself", () => expect(fyStart("2026-07-01", 7)).toBe("2026-07-01"));
});
