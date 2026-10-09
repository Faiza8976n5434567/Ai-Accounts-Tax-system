import { describe, expect, it } from "vitest";
import { isTrn, review, suggestAccount, suggestForSupplier } from "./rules";
import { aed } from "./testkit";
import type { PurchaseDoc } from "./types";

const doc = (over: Partial<PurchaseDoc> = {}): PurchaseDoc => ({
  id: "p1", orgId: "o1", supplier: "Aldar Properties", supplierTrn: "100067549300003", invNo: "A-1", date: "2026-09-01", description: "Office rent September",
  net: aed(25_000), vat: aed(1_250), total: aed(26_250), currency: "AED", hasHeading: true, customerName: "Test LLC", account: "6100", taxCode: "SR", reasoning: "",
  checks: [], risk: "Low", riskScore: 0, status: "REVIEW", createdAt: "2026-09-01T00:00:00Z", createdBy: "a", ...over,
});

describe("rules", () => {
  it("ARAP-07: TRN must be 15 digits starting with 1", () => {
    expect(isTrn("100067549300003")).toBe(true);
    expect(isTrn("10029381")).toBe(false);
    expect(isTrn("200067549300003")).toBe(false);
  });

  it("keyword rule suggests rent; a foreign supplier turns standard-rated into reverse charge", () => {
    expect(suggestAccount("Aldar office rent")).toMatchObject({ account: "6100", taxCode: "SR" });
    expect(suggestAccount("Google Ads campaign", true)).toMatchObject({ account: "6150", taxCode: "RCS" });
  });

  it("prefers the account used on the supplier's last posted bill", () => {
    const history = [doc({ id: "old", status: "POSTED", account: "6130", taxCode: "SR", supplier: "Aldar Properties" })];
    expect(suggestForSupplier("o1", "aldar properties", history)).toMatchObject({ account: "6130" });
  });

  it("valid tax invoice passes every error-level check", () => {
    const r = review(doc(), []);
    expect(r.checks.filter((c) => !c.ok && c.severity === "error")).toEqual([]);
  });

  it("ARAP-06: same supplier + invoice number is flagged as a duplicate (High risk)", () => {
    const r = review(doc({ id: "p2" }), [doc({ id: "p1" })]);
    expect(r.checks.find((c) => c.id === "dup")?.ok).toBe(false);
    expect(r.risk).toBe("High");
  });

  it("wrong VAT amount is flagged", () => {
    const r = review(doc({ vat: aed(1_500), total: aed(26_500) }), []);
    expect(r.checks.find((c) => c.id === "vatcalc")?.ok).toBe(false);
  });
});
