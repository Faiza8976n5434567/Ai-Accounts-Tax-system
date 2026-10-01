import { describe, it, expect } from "vitest";
import { aed, computeCt } from "../src";

describe("Corporate Tax computation", () => {
  it("standard regime with add-backs, 0% band and losses", () => {
    const r = computeCt({
      taxPeriodEnd: "2025-12-31", regime: "standard",
      revenueCurrent: aed(12_000_000), revenuePriorPeriods: [aed(9_000_000)],
      accountingProfit: aed(2_000_000), entertainmentClient: aed(80_000),
      finesPenalties: aed(15_000), lossesBf: aed(400_000),
    });
    // TI before losses = 2,000,000 + 40,000 + 15,000 = 2,055,000 ; loss used 400,000
    expect(r.taxableIncome).toBe(aed(1_655_000));
    // (1,655,000 - 375,000) × 9% = 115,200
    expect(r.ctPayable).toBe(aed(115_200));
    expect(r.carryForwards.taxLossCf).toBe(0);
    expect(r.dueDate).toBe("2026-09-30");
  });

  it("caps loss relief at 75%", () => {
    const r = computeCt({ taxPeriodEnd: "2025-12-31", regime: "standard", revenueCurrent: aed(10_000_000),
      accountingProfit: aed(1_000_000), lossesBf: aed(5_000_000) });
    expect(r.taxableIncome).toBe(aed(250_000));
    expect(r.ctPayable).toBe(0);
    expect(r.carryForwards.taxLossCf).toBe(aed(4_250_000));
  });

  it("SBR: nil taxable income when eligible", () => {
    const r = computeCt({ taxPeriodEnd: "2026-12-31", regime: "sbr", revenueCurrent: aed(2_500_000),
      revenuePriorPeriods: [aed(2_000_000)], accountingProfit: aed(900_000) });
    expect(r.ctPayable).toBe(0);
    expect(r.sbrEligible).toBe(true);
  });

  it("SBR: flags ineligibility if any prior period exceeded AED 3m", () => {
    const r = computeCt({ taxPeriodEnd: "2026-12-31", regime: "sbr", revenueCurrent: aed(2_500_000),
      revenuePriorPeriods: [aed(3_200_000)], accountingProfit: aed(900_000) });
    expect(r.sbrEligible).toBe(false);
    expect(r.warnings[0]).toMatch(/eligibility FAILS/);
  });

  it("suggests SBR when a standard-regime entity is eligible", () => {
    const r = computeCt({ taxPeriodEnd: "2026-12-31", regime: "standard", revenueCurrent: aed(1_000_000), accountingProfit: aed(500_000) });
    expect(r.warnings.some((w) => /ELIGIBLE for SBR/.test(w))).toBe(true);
  });

  it("interest limitation below AED 12m de minimis allows all interest", () => {
    const r = computeCt({ taxPeriodEnd: "2025-12-31", regime: "standard", revenueCurrent: aed(15_000_000),
      accountingProfit: aed(500_000), interestExpense: aed(3_000_000), depreciationAmortisation: aed(200_000) });
    expect(r.carryForwards.disallowedInterestCf).toBe(0);
  });

  it("QFZP de minimis breach is flagged", () => {
    const r = computeCt({ taxPeriodEnd: "2025-12-31", regime: "qfzp", revenueCurrent: aed(20_000_000),
      accountingProfit: aed(3_000_000), qfzpTotalRevenue: aed(20_000_000), qfzpNonQualifyingRevenue: aed(1_500_000),
      qfzpQualifyingIncome: aed(2_500_000) });
    expect(r.warnings[0]).toMatch(/BREACHED/); // limit = min(5m, 1m) = 1m
  });
});
