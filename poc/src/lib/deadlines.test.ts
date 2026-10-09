import { describe, expect, it } from "vitest";
import { daysUntil, groupByMonth, type Deadline } from "./deadlines";

const d = (due_date: string, status: string, legal_name = "Alpha LLC", title = "VAT return and payment") => ({ due_date, status, legal_name, title }) as Deadline;

describe("compliance calendar", () => {
  it("days left (negative = late)", () => {
    expect(daysUntil("2027-01-28", "2027-01-21")).toBe(7);
    expect(daysUntil("2026-10-01", "2026-10-08")).toBe(-7);
  });
  it("overdue first, then month by month in date order", () => {
    const g = groupByMonth([d("2026-11-28", "open"), d("2026-07-28", "overdue"), d("2026-10-31", "open", "Beta LLC", "Trade licence renewal"), d("2026-10-28", "ready_to_file")], "2026-10-08");
    expect(g.map((x) => `${x.label}: ${x.items.map((i) => i.due_date).join(",")}`)).toEqual([
      "Overdue: 2026-07-28", "October 2026: 2026-10-28,2026-10-31", "November 2026: 2026-11-28",
    ]);
  });
});
