import { describe, it, expect } from "vitest";
import { buildCalendar, ctReturnDue, vatReturnDue, addMonths } from "../src";

describe("deadlines", () => {
  it("VAT due 28 days after period end", () => { expect(vatReturnDue("2026-09-30")).toBe("2026-10-28"); });
  it("CT due 9 months after period end (month-end aware)", () => {
    expect(ctReturnDue("2025-12-31")).toBe("2026-09-30");
    expect(ctReturnDue("2026-06-30")).toBe("2027-03-31");
  });
  it("addMonths keeps non-month-end days", () => { expect(addMonths("2026-01-15", 1)).toBe("2026-02-15"); });
  it("builds a sorted SME calendar with e-invoicing milestones", () => {
    const cal = buildCalendar({ vatPeriods: [{ start: "2026-10-01", end: "2026-12-31" }], ctPeriodEnds: ["2026-12-31"], einvoiceCohort: "REVENUE_BELOW_50M" });
    expect(cal.map((e) => e.kind)).toEqual(["VAT_RETURN", "EINV_ASP", "EINV_GOLIVE", "CT_RETURN"]);
    expect(cal[1]!.dueDate).toBe("2027-03-31");
  });
});
