import { describe, expect, it } from "vitest";
import { buildFaf, fafAmount, fafDate, fafText, type FafData } from "./faf";

const data: FafData = {
  company: { name_en: "Pilot Co, LLC", name_ar: "", trn: "100000000000003", product: "TFS+ Smart Ledger" },
  purchases: [
    { supplier: "Registered Supplier LLC", trn: "100300400500003", date: "2026-10-10", invoice_no: "B1", line_no: 1, description: "Purchase", value: 40000, vat: 2000, tax_code: "SR", currency: "AED", value_fcy: 40000, vat_fcy: 2000 },
    { supplier: "Registered Supplier LLC", trn: "100300400500003", date: "2026-10-13", invoice_no: "DN1", line_no: 1, description: "Return", value: -10000, vat: -500, tax_code: "SR", currency: "AED", value_fcy: -10000, vat_fcy: -500 },
  ],
  supplies: [
    { customer: "Export Buyer Ltd", trn: "", date: "2026-10-08", invoice_no: "INV-2026-10-0002", line_no: 1, description: "Supply,\nwith comma", value: 36725, vat: 1836, tax_code: "SR", country: "GB", currency: "USD", value_fcy: 10000, vat_fcy: 500 },
  ],
  ledger: [
    { date: "2026-10-10", account_code: "6180", account_name: "Office supplies and IT", description: "Purchase", name: "Registered Supplier LLC", transaction_id: "JV-2026-10-0001", source_document: "B1", source_type: "AP", debit: 40000, credit: 0, balance: 40000 },
    { date: "2026-10-10", account_code: "2000", account_name: "Trade payables", description: "Purchase", name: "Registered Supplier LLC", transaction_id: "JV-2026-10-0001", source_document: "B1", source_type: "AP", debit: 0, credit: 40000, balance: -40000 },
  ],
};

describe("FTA Audit File (FAF v1.0.0, FTA Appendix 5)", () => {
  it("formats dates DD-MM-YYYY and amounts exactly with 2 decimals", () => {
    expect(fafDate("2026-10-05")).toBe("05-10-2026");
    expect(fafDate(null)).toBe("31-12-9999");
    expect([fafAmount(36725), fafAmount(-500), fafAmount(5), fafAmount(0)]).toEqual(["367.25", "-5.00", "0.05", "0.00"]);
  });
  it("keeps the separator out of text and cuts to the FTA length", () => {
    expect(fafText("Supply,\r\nwith comma", 250)).toBe("Supply; with comma");
    expect(fafText("x".repeat(120), 100)).toHaveLength(100);
  });
  it("writes the four tables with markers and footer totals, in the FTA field order", () => {
    const rows = buildFaf(data, { start: "2026-10-01", end: "2026-10-31", created: "2026-11-02" }).split("\r\n");
    expect(rows).toEqual([
      "CompInfoStart",
      "Pilot Co; LLC,,100000000000003,,,,,01-10-2026,31-10-2026,02-11-2026,TFS+ Smart Ledger 1.0,FAFv1.0.0",
      "CompInfoEnd",
      "PurcDataStart",
      "Registered Supplier LLC,100300400500003,10-10-2026,B1,,1,Purchase,400.00,20.00,SR,XXX,0.00,0.00",
      "Registered Supplier LLC,100300400500003,13-10-2026,DN1,,1,Return,-100.00,-5.00,SR,XXX,0.00,0.00",
      "PurcDataEnd,300.00,15.00,2",
      "SuppDataStart",
      "Export Buyer Ltd,,08-10-2026,INV-2026-10-0002,1,Supply; with comma,367.25,18.36,SR,GB,USD,100.00,5.00",
      "SuppDataEnd,367.25,18.36,1",
      "GLDataStart",
      "10-10-2026,6180,Office supplies and IT,Purchase,Registered Supplier LLC,JV-2026-10-0001,B1,AP,400.00,0.00,400.00",
      "10-10-2026,2000,Trade payables,Purchase,Registered Supplier LLC,JV-2026-10-0001,B1,AP,0.00,400.00,-400.00",
      "GLDataEnd,400.00,400.00,2,AED",
      "",
    ]);
  });
  it("an empty period still has every table with zero totals", () => {
    const rows = buildFaf({ ...data, purchases: [], supplies: [], ledger: [] }, { start: "2026-10-01", end: "2026-10-31", created: "2026-11-02" }).split("\r\n");
    expect(rows.filter((r) => /End/.test(r))).toEqual(["CompInfoEnd", "PurcDataEnd,0.00,0.00,0", "SuppDataEnd,0.00,0.00,0", "GLDataEnd,0.00,0.00,0,AED"]);
  });
});
