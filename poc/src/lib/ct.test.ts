import { describe, expect, it } from "vitest";
import { computeCt } from "./ct";
import { aed, journal, expense, org } from "./testkit";

/** Revenue booked as a plain sale to bank; expenses paid from bank. */
const revenue = (amount: number) => journal([{ account: "1010", debit: aed(amount), credit: 0 }, { account: "4000", debit: 0, credit: aed(amount) }]);

describe("Corporate Tax computation", () => {
  it("CT-01: taxable income 375,000 → CT 0", () => {
    expect(computeCt([revenue(375_000)], org()).ct).toBe(0);
  });

  it("CT-02: taxable income 1,000,000 → CT 56,250", () => {
    expect(computeCt([revenue(1_000_000)], org()).ct).toBe(aed(56_250));
  });

  it("CT-03: entertainment 10,000 → add-back 5,000", () => {
    const r = computeCt([revenue(1_000_000), expense("6140", 10_000)], org());
    expect(r.adds).toBe(aed(5_000));
    expect(r.taxable).toBe(aed(995_000));
  });

  it("CT-04: fines 1,500 and non-qualifying donation 5,000 are added back in full", () => {
    const r = computeCt([revenue(1_000_000), expense("6160", 1_500), expense("6170", 5_000)], org());
    expect(r.adds).toBe(aed(6_500));
  });

  it("CT-05: accounting loss → CT 0", () => {
    const r = computeCt([revenue(100_000), expense("6100", 300_000)], org());
    expect(r.profit).toBe(aed(-200_000));
    expect(r.ct).toBe(0);
  });

  it("CT-08: SBR elected, revenue 3,000,000 this and prior period → eligible, CT 0", () => {
    const r = computeCt([revenue(3_000_000)], org({ regime: "sbr", priorRevenue: aed(3_000_000) }));
    expect(r.sbrEligible).toBe(true);
    expect(r.ct).toBe(0);
  });

  it("CT-09: SBR elected but revenue 3,000,001 → not eligible, standard computation", () => {
    const r = computeCt([revenue(3_000_001)], org({ regime: "sbr", priorRevenue: aed(1_000_000) }));
    expect(r.sbrEligible).toBe(false);
    expect(r.ct).toBe(aed((3_000_001 - 375_000) * 0.09));
  });

  it("CT-10: FY ending 31 Dec 2026 → due 30 Sep 2027", () => {
    expect(computeCt([], org(), "2026-12-31").dueDate).toBe("2027-09-30");
  });
});
