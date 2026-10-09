import { describe, expect, it } from "vitest";
import { emptyItem, itemProblems } from "./items";

describe("items list checks (P4-04, same rules as the database)", () => {
  const ok = { ...emptyItem(), name: "Consulting", itemType: "S" as const, sacCode: "998311", unitCode: "HUR" };
  it("a complete service is ready to save", () => expect(itemProblems(ok)).toEqual([]));
  it("goods need an HS code, services a service accounting code, both need both", () => {
    expect(itemProblems({ ...ok, itemType: "G", sacCode: "" })).toContain("Goods need an HS code (customs tariff code).");
    expect(itemProblems({ ...ok, sacCode: "" })).toContain("Services need a service accounting code.");
    expect(itemProblems({ ...ok, itemType: "B", hsCode: "" })).toContain("Goods need an HS code (customs tariff code).");
  });
  it("exempt items need a reason; prices must be above zero", () => {
    expect(itemProblems({ ...ok, taxCode: "EX" })).toContain("Exempt items need an exemption reason.");
    expect(itemProblems({ ...ok, defaultPrice: "0" })).toContain("The default price must be above zero (at most 2 decimals).");
  });
});
