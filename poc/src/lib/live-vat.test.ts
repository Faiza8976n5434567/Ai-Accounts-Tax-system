import { describe, expect, it } from "vitest";
import { adjustmentsEffect, columns, netPosition, totalsAgree, type VatBox } from "./live-vat";

const box = (box_code: string, amount: number, vat: number, adjustment = 0) => ({ box_code, label: "", sort: 0, amount, vat, adjustment }) as VatBox;
// The worked quarter of the database test (16_vat_return.sql) after the -100 bad-debt adjustment
const quarter = [
  box("1a", 800000, 40000, -10000), box("1b", 1000000, 50000), box("1c", 0, 0), box("1d", 0, 0), box("1e", 0, 0), box("1f", 0, 0), box("1g", 0, 0),
  box("2", 0, 0), box("3", 600000, 30000), box("4", 2000000, 0), box("5", 800000, 0), box("6", 1000000, 50000), box("7", 0, 0),
  box("8", 6200000, 170000, -10000), box("9", 2500000, 125000), box("10", 1600000, 80000), box("11", 4100000, 205000),
  box("12", 0, 160000), box("13", 0, 205000), box("14", 0, -45000),
];

describe("VAT 201 layout", () => {
  it("VAT-11 · box 14 negative = refundable, positive = payable", () => {
    expect(netPosition(quarter)).toEqual({ label: "Refundable by the FTA", amount: 45000 });
    expect(netPosition([box("14", 0, 12000)])).toEqual({ label: "Payable to the FTA", amount: 12000 });
  });
  it("the totals of the worked quarter agree; a tampered total is caught", () => {
    expect(totalsAgree(quarter)).toBe(true);
    expect(totalsAgree(quarter.map((b) => (b.box_code === "12" ? { ...b, vat: 170000 } : b)))).toBe(false);
  });
  it("FTA columns: zero-rated and exempt have no VAT; 12–14 only VAT; 1a–1g, 8, 9, 11 have an adjustment column", () => {
    expect(columns("4")).toEqual({ amount: true, vat: false, adjustment: false });
    expect(columns("14")).toEqual({ amount: false, vat: true, adjustment: false });
    expect(columns("1c")).toEqual({ amount: true, vat: true, adjustment: true });
    expect(columns("6")).toEqual({ amount: true, vat: true, adjustment: false });
  });
});

describe("reconciliation (VAT-14)", () => {
  it("manual adjustments explain the gap between box 14 and the ledger", () => {
    expect(adjustmentsEffect([{ box_code: "1a", amount: 0, vat: 0, adjustment: -1000, reason: "Bad debt relief" }])).toBe(-1000);
    expect(adjustmentsEffect([{ box_code: "9", amount: 0, vat: 0, adjustment: 500, reason: "More input VAT" }])).toBe(-500);
    expect(adjustmentsEffect([{ box_code: "2", amount: 10000, vat: 500, adjustment: 0, reason: "Tourist refunds" }])).toBe(500);
  });
});
