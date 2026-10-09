import { describe, expect, it } from "vitest";
import { addDays, endOfMonthAfter, financialYear, monthsBetween } from "./dates";

describe("dates", () => {
  it("financial year for a 31 Dec year end", () => expect(financialYear("2026-12-31", "2026-10-06")).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "FY2026" }));
  it("financial year for a 31 Mar year end", () => expect(financialYear("2026-03-31", "2026-10-06")).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY2027" }));
  it("CT-10: last day of the 9th month after 31 Dec 2026 = 30 Sep 2027", () => expect(endOfMonthAfter("2026-12-31", 9)).toBe("2027-09-30"));
  it("adds days across a month end", () => expect(addDays("2026-01-31", 30)).toBe("2026-03-02"));
  it("months between dates are inclusive", () => expect(monthsBetween("2026-01-01", "2026-03-15")).toEqual(["2026-01", "2026-02", "2026-03"]));
});
