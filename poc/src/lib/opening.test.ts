import { describe, expect, it } from "vitest";
import { OPENING_COLUMNS, parseOpeningSheet } from "./opening";

describe("opening documents template (D-52)", () => {
  it("reads customers and suppliers with day-first dates and AED amounts", () => {
    const r = parseOpeningSheet([[...OPENING_COLUMNS],
      ["Customer", "Customer A", "INV-OLD-101", "15/05/2026", "14/06/2026", "10,500.00"],
      ["supplier", "Supplier S", "BILL-77", "2026-06-10", "", "4200"], ["", "", ""]]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row: 2, kind: "customer", contact_name: "Customer A", number: "INV-OLD-101", date: "2026-05-15", due_date: "2026-06-14", amount: 1050000 },
      { row: 3, kind: "supplier", contact_name: "Supplier S", number: "BILL-77", date: "2026-06-10", due_date: null, amount: 420000 },
    ]);
  });
  it("names the row of every problem", () => {
    const r = parseOpeningSheet([[...OPENING_COLUMNS], ["Vendor", "X", "1", "01/01/2026", "", "5"], ["Customer", "Y", "2", "31/02/2026", "", "5"], ["Customer", "Z", "3", "01/03/2026", "", "0"]]);
    expect(r.errors).toEqual(["Row 2: Type must be Customer or Supplier.", 'Row 3: "31/02/2026" is not a date (day/month/year).', "Row 4: the amount must be above zero."]);
  });
  it("refuses another file", () => {
    expect(parseOpeningSheet([["Date", "Narration"]]).errors[0]).toMatch(/not the opening balances template/);
    expect(parseOpeningSheet([[...OPENING_COLUMNS]]).errors).toEqual(["The sheet has no rows."]);
  });
});
