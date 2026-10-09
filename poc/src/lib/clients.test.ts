import { describe, expect, it } from "vitest";
import { nextVatDue, vatSummary, type TaxPeriod } from "./clients";

const p = (start: string, end: string, due: string, kind: "vat" | "ct" = "vat") => ({ start_date: start, end_date: end, due_date: due, kind }) as TaxPeriod;

describe("nextVatDue", () => {
  const periods = [p("2026-06-01", "2026-08-31", "2026-09-28"), p("2026-09-01", "2026-11-30", "2026-12-28"), p("2026-01-01", "2026-12-31", "2027-09-30", "ct")];
  it("picks the first VAT return due on or after today", () => expect(nextVatDue(periods, "2026-10-07")?.due_date).toBe("2026-12-28"));
  it("includes a return due today", () => expect(nextVatDue(periods, "2026-09-28")?.due_date).toBe("2026-09-28"));
  it("ignores Corporate Tax periods and returns nothing when none are left", () => expect(nextVatDue(periods, "2027-01-01")).toBeUndefined());
});

describe("vatSummary", () => {
  it("describes the VAT set-up", () => {
    expect(vatSummary({ vat_registered: false, vat_period: null })).toBe("Not VAT registered");
    expect(vatSummary({ vat_registered: true, vat_period: "quarterly" })).toBe("VAT · quarterly");
    expect(vatSummary({ vat_registered: true, vat_period: "monthly" })).toBe("VAT · monthly");
  });
});
