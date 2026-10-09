import { describe, expect, it } from "vitest";
import { assetPayload, emptyAsset, pctText, pctToBp, yearsText, yearsToMonths } from "./assets";

const van = { ...emptyAsset(), name: "Delivery van", purchase_date: "2025-01-15", cost: "36,000", life_years: "3" };

describe("Fixed asset form (P5-04)", () => {
  it("converts years and percentages without floating point", () => {
    expect([yearsToMonths("3"), yearsToMonths("2.5"), yearsToMonths("0.25"), yearsToMonths("1.1"), yearsToMonths("x")]).toEqual([36, 30, 3, null, null]);
    expect([pctToBp("20"), pctToBp("12.5"), pctToBp("0"), pctToBp("101"), pctToBp("7.25")]).toEqual([2000, 1250, null, null, 725]);
    expect([yearsText(36), yearsText(30), pctText(2000), pctText(1250)]).toEqual(["3", "2.5", "20", "12.5"]);
  });

  it("FA-01: a straight-line van becomes the database payload in fils and months", () => {
    const r = assetPayload(van, false);
    expect(r.problems).toEqual([]);
    expect(r.payload).toMatchObject({ name: "Delivery van", purchase_date: "2025-01-15", cost: 3600000, residual: 0, method: "straight_line", life_months: 36, opening_as_at: "" });
  });

  it("each method asks for what it needs", () => {
    expect(assetPayload({ ...van, life_years: "" }, false).problems).toContain("Straight line needs a useful life.");
    expect(assetPayload({ ...van, method: "sum_of_years", life_years: "2.5" }, false).problems).toContain("Sum-of-years' digits needs a useful life in whole years.");
    expect(assetPayload({ ...van, method: "reducing_balance", life_years: "" }, false).problems).toContain("Reducing balance needs a yearly rate (%).");
    expect(assetPayload({ ...van, method: "reducing_balance", life_years: "", rate_pct: "20" }, false).payload).toMatchObject({ rate_bp: 2000, life_months: "" });
    expect(assetPayload({ ...van, method: "units", units_total: "100000", units_name: "km" }, false).payload).toMatchObject({ units_total: 100000, units_name: "km" });
    expect(assetPayload({ ...van, residual: "36000" }, false).problems).toContain("The residual value must be below the cost.");
  });

  it("FA-10: an asset owned before the app needs its accumulated depreciation and the date", () => {
    expect(assetPayload({ ...van, has_history: true }, false).problems).toEqual(expect.arrayContaining(["Enter the date the accumulated depreciation is as at."]));
    expect(assetPayload({ ...van, has_history: true, opening_accum: "6,000", opening_as_at: "2024-12-31" }, false).problems).toContain("The 'as at' date cannot be before the purchase date.");
    expect(assetPayload({ ...van, purchase_date: "2024-07-01", has_history: true, opening_accum: "6,000", opening_as_at: "2024-12-31" }, false).payload)
      .toMatchObject({ opening_accum: 600000, opening_as_at: "2024-12-31" });
  });

  it("FA-09: from a bill line the cost and date come from the bill", () => {
    const r = assetPayload({ ...emptyAsset(), name: "Office desks", life_years: "5", source_bill_line_id: "line-1" }, true);
    expect(r.problems).toEqual([]);
    expect(r.payload).toMatchObject({ source_bill_line_id: "line-1", life_months: 60 });
    expect(r.payload).not.toHaveProperty("cost");
  });
});
