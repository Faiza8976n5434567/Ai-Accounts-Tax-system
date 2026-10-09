import { describe, expect, it } from "vitest";
import { parseContactsSheet, TEMPLATE_COLUMNS } from "./contactsImport";

const header = TEMPLATE_COLUMNS.map(([t]) => t);

describe("contacts template", () => {
  it("reads rows under the titles, with Excel row numbers, skipping blank rows", () => {
    const sheet = [header, ["Customer", " Gulf Trading LLC ", "100222333444003", "AE", "DXB", "", "", "", "45", "4010", "SR", "No"], ["", "", ""], ["Supplier", "Cloud Software Inc"]];
    expect(parseContactsSheet(sheet)).toEqual({
      rows: [
        { row: 2, kind: "Customer", name: "Gulf Trading LLC", trn: "100222333444003", country_code: "AE", emirate_code: "DXB", payment_terms_days: "45", default_account_code: "4010", default_tax_code: "SR", is_related_party: "No" },
        { row: 4, kind: "Supplier", name: "Cloud Software Inc" },
      ],
      errors: [],
    });
  });
  it("finds the titles even below a heading and in any letter case", () => {
    const sheet = [["Contacts for Alpha LLC"], ["TYPE", "name", "trn"], ["Both", "Sister Co"]];
    expect(parseContactsSheet(sheet).rows).toEqual([{ row: 3, kind: "Both", name: "Sister Co" }]);
  });
  it("refuses another file", () => {
    expect(parseContactsSheet([["Date", "Amount"], ["2026-10-01", "5"]]).errors[0]).toMatch(/not the contacts template/);
    expect(parseContactsSheet([header]).errors).toEqual(["The Contacts sheet has no rows."]);
  });
});
