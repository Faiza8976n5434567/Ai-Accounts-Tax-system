/**
 * Versioned UAE tax parameters. Engines take a config object; outputs record `version`.
 * Every entry carries its legal reference and the date it was last verified.
 * Anything with verify: true MUST be confirmed by the product owner before release.
 */
export interface Sourced<T> { value: T; ref: string; lastVerified: string; verify?: boolean }

export interface UaeTaxConfig {
  version: string;
  effectiveFrom: string; // ISO date
  vat: {
    standardRateBp: Sourced<number>;
    mandatoryRegistrationThreshold: Sourced<number>; // fils
    voluntaryRegistrationThreshold: Sourced<number>;
    returnDueDaysAfterPeriodEnd: Sourced<number>;
    invoiceIssueDays: Sourced<number>;
  };
  ct: {
    rateBp: Sourced<number>;
    zeroRateBand: Sourced<number>; // fils
    sbrRevenueLimit: Sourced<number>;
    sbrLastPeriodEnd: Sourced<string>;
    interestDeMinimis: Sourced<number>;
    interestEbitdaPctBp: Sourced<number>;
    lossReliefCapBp: Sourced<number>;
    entertainmentDisallowBp: Sourced<number>;
    qfzpDeMinimisAbs: Sourced<number>;
    qfzpDeMinimisPctBp: Sourced<number>;
    returnDueMonthsAfterPeriodEnd: Sourced<number>;
  };
  einvoicing: {
    cohorts: Record<
      "REVENUE_50M_PLUS" | "REVENUE_BELOW_50M" | "GOVERNMENT",
      Sourced<{ aspAppointBy: string; goLive: string }>
    >;
  };
}

const V = "2026-09-30";

export const UAE_TAX_CONFIG_2026_09: UaeTaxConfig = {
  version: "uae-2026.09",
  effectiveFrom: "2026-01-01",
  vat: {
    standardRateBp: { value: 500, ref: "FDL 8/2017 Art 3", lastVerified: V },
    mandatoryRegistrationThreshold: { value: 375_000_00, ref: "FDL 8/2017 Art 13", lastVerified: V },
    voluntaryRegistrationThreshold: { value: 187_500_00, ref: "FDL 8/2017 Art 17", lastVerified: V },
    returnDueDaysAfterPeriodEnd: { value: 28, ref: "Exec. Reg. Art 69", lastVerified: V, verify: true },
    invoiceIssueDays: { value: 14, ref: "FDL 8/2017 Art 67", lastVerified: V },
  },
  ct: {
    rateBp: { value: 900, ref: "FDL 47/2022 Art 3", lastVerified: V },
    zeroRateBand: { value: 375_000_00, ref: "CD 116/2022", lastVerified: V },
    sbrRevenueLimit: { value: 3_000_000_00, ref: "Art 21; MD 73/2023", lastVerified: V },
    sbrLastPeriodEnd: { value: "2029-12-31", ref: "MD 131/2026", lastVerified: V, verify: true },
    interestDeMinimis: { value: 12_000_000_00, ref: "Art 30; MD 126/2023", lastVerified: V },
    interestEbitdaPctBp: { value: 3000, ref: "Art 30", lastVerified: V },
    lossReliefCapBp: { value: 7500, ref: "Art 37", lastVerified: V },
    entertainmentDisallowBp: { value: 5000, ref: "Art 32", lastVerified: V },
    qfzpDeMinimisAbs: { value: 5_000_000_00, ref: "CD 100/2023; MD 229/2025", lastVerified: V },
    qfzpDeMinimisPctBp: { value: 500, ref: "CD 100/2023", lastVerified: V },
    returnDueMonthsAfterPeriodEnd: { value: 9, ref: "Art 53", lastVerified: V },
  },
  einvoicing: {
    cohorts: {
      REVENUE_50M_PLUS: { value: { aspAppointBy: "2026-10-30", goLive: "2027-01-01" }, ref: "MD 244/2025 as amended", lastVerified: V, verify: true },
      REVENUE_BELOW_50M: { value: { aspAppointBy: "2027-03-31", goLive: "2027-07-01" }, ref: "MD 244/2025", lastVerified: V, verify: true },
      GOVERNMENT: { value: { aspAppointBy: "2027-03-31", goLive: "2027-10-01" }, ref: "MD 244/2025", lastVerified: V, verify: true },
    },
  },
};

export const CURRENT_CONFIG = UAE_TAX_CONFIG_2026_09;
