import { describe, expect, it } from "vitest";
import { ctLines, pct, type CtComputation } from "./live-ct";

const base: CtComputation = {
  period: { id: "p", start_date: "2026-01-01", end_date: "2026-12-31", due_date: "2027-09-30" },
  organization: { legal_name: "X LLC", ct_trn: null, regime: "standard" },
  rules: { rate_bp: 900, zero_band: 37500000, loss_cap_bp: 7500, sbr_limit: 300000000, sbr_last_period_end: "2029-12-31" },
  revenue: 200000000, expenses: 0, accounting_profit: 200000000, profit_lines: [], addbacks: [], addbacks_total: 0, adjustments: [], adjustments_total: 0,
  taxable_income_before_losses: 200000000, sbr_elected: false, sbr_eligible: true, sbr_applied: false,
  losses_bf: 50000000, loss_relief: 50000000, loss_of_period: 0, taxable_income: 150000000, ct_payable: 10125000, losses_cf: 0, warnings: [], return: null,
};

describe("Corporate Tax return layout (P5-01)", () => {
  it("shows basis points as percentages", () => {
    expect([pct(900), pct(7500), pct(5000), pct(10000), pct(950), pct(925)]).toEqual(["9%", "75%", "50%", "100%", "9.5%", "9.25%"]);
  });

  it("CT-06 lines: profit → relief 500,000 → taxable 1,500,000 → 0% band → CT 101,250", () => {
    expect(ctLines(base).map((l) => [l.kind, l.amount])).toEqual([
      ["base", 200000000], ["total", 200000000], ["less", 50000000], ["total", 150000000], ["less", 37500000], ["total", 10125000]]);
  });

  it("add-backs and manual adjustments appear with their legal reference", () => {
    const c = { ...base, addbacks: [{ account_id: "a", account_code: "6140", account_name: "Client entertainment", tag: "ENTERTAINMENT_50", tag_label: "Client entertainment (partly disallowed)",
      legal_reference: "FDL 47/2022 Art 32", expense: 1000000, percent_bp: 5000, add_back: 500000 }],
      adjustments: [{ id: "j", direction: "deduct" as const, amount: 2000000, description: "Exempt dividend", legal_reference: "FDL 47/2022 Art 22" }] };
    const l = ctLines(c);
    expect(l[1]).toMatchObject({ kind: "add", amount: 500000, basis: "FDL 47/2022 Art 32" });
    expect(l[1].label).toContain("50% of 10,000.00");
    expect(l[2]).toMatchObject({ kind: "less", amount: 2000000, label: "Exempt dividend" });
  });

  it("SBR: a note, no 0% band line, CT 0", () => {
    const l = ctLines({ ...base, sbr_applied: true, loss_relief: 0, taxable_income: 0, ct_payable: 0 });
    expect(l.map((x) => x.kind)).toEqual(["base", "total", "note", "total", "total"]);
  });

  it("a loss year shows the loss carried forward", () => {
    const l = ctLines({ ...base, accounting_profit: -20000000, taxable_income_before_losses: -20000000, loss_relief: 0, loss_of_period: 20000000, taxable_income: 0, ct_payable: 0 });
    expect(l.find((x) => x.kind === "note")).toMatchObject({ amount: 20000000 });
    expect(l.find((x) => x.label === "Less 0% band")?.amount).toBe(0);
  });
});
