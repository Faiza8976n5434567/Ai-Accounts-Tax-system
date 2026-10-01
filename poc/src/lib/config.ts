/**
 * Versioned UAE tax parameters (mirrors packages/tax-engine/src/config/uae-tax-config.ts).
 * Tax rules are data, not code. Items flagged verify:true need product-owner sign-off.
 */
export const TAX_CONFIG = {
  version: "uae-2026.09",
  lastVerified: "2026-09-30",
  vat: {
    rateBp: { value: 500, ref: "FDL 8/2017 Art 3" },
    mandatoryThreshold: { value: 375_000_00, ref: "FDL 8/2017 Art 13" },
    voluntaryThreshold: { value: 187_500_00, ref: "FDL 8/2017 Art 17" },
    returnDueDays: { value: 28, ref: "Exec. Reg. Art 69", verify: true },
    invoiceIssueDays: { value: 14, ref: "FDL 8/2017 Art 67" },
    fullInvoiceThreshold: { value: 10_000_00, ref: "Exec. Reg. Art 59(2)", verify: true },
  },
  ct: {
    rateBp: { value: 900, ref: "FDL 47/2022 Art 3" },
    zeroBand: { value: 375_000_00, ref: "CD 116/2022" },
    sbrLimit: { value: 3_000_000_00, ref: "Art 21; MD 73/2023" },
    sbrLastPeriodEnd: { value: "2029-12-31", ref: "MD 131/2026", verify: true },
    entertainmentDisallowBp: { value: 5000, ref: "Art 32" },
    lossCapBp: { value: 7500, ref: "Art 37" },
    returnDueMonths: { value: 9, ref: "Art 53" },
  },
  einvoicing: {
    below50m: { aspBy: "2027-03-31", goLive: "2027-07-01", ref: "MD 244/2025", verify: true },
  },
} as const;
