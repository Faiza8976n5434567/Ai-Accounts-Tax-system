import { describe, expect, it } from "vitest";
import { accountLedger, monthly, posted } from "./ledger";
import { ctTreatment } from "./ct";
import { compact } from "./money";
import { toPintXml, validatePint } from "./einvoice";
import { aed, journal, sale, expense, org } from "./testkit";
import type { SalesInvoice } from "./types";

describe("ledger reports", () => {
  it("posted() keeps only posted/reversed journals of the client within the date range", () => {
    const js = [sale(1_000, 50, "SR", "AUH"), journal([{ account: "6100", debit: 100, credit: 0 }, { account: "1010", debit: 0, credit: 100 }], { status: "PENDING" }), sale(1_000, 50, "SR", "AUH")];
    js[2].orgId = "other";
    expect(posted(js, "o1", "2026-01-01", "2026-12-31")).toHaveLength(1);
  });

  it("monthly P&L splits by month", () => {
    const a = sale(1_000, 50, "SR", "AUH"); a.date = "2026-07-10";
    const b = expense("6100", 400); b.date = "2026-08-05";
    const m = monthly([a, b], ["2026-07", "2026-08"]);
    expect(m[0].revenue).toBe(1_000);
    expect(m[1].expenses).toBe(400);
  });

  it("account ledger keeps a running balance", () => {
    const r = accountLedger([expense("6100", 400), expense("6100", 600)], "6100");
    expect(r.map((x) => x.running)).toEqual([aed(400), aed(1_000)]);
  });
});

describe("CT treatment labels and display", () => {
  it("shows the CT effect of each expense account", () => {
    expect(ctTreatment("6140").label).toBe("50% deductible");
    expect(ctTreatment("6160").label).toBe("Disallowed");
    expect(ctTreatment("1500").label).toBe("Capital / balance sheet");
    expect(ctTreatment("6100").label).toBe("Deductible");
  });
  it("compact amounts", () => {
    expect(compact(aed(2_500_000))).toBe("AED 2.50M");
    expect(compact(aed(12_300))).toBe("AED 12.3K");
    expect(compact(aed(-950))).toBe("-AED 950");
  });
});

describe("e-invoice (PINT AE) pre-validation", () => {
  const inv = (over: Partial<SalesInvoice> = {}): SalesInvoice => ({
    id: "s1", orgId: "o1", invNo: "INV-2026-10-0001", date: "2026-10-01", dueDate: "2026-10-31", customer: "Buyer LLC", customerTrn: "100211938400003", customerCountry: "AE", emirate: "AUH",
    lines: [{ desc: "Goods", qty: 1, price: aed(20_000), taxCode: "SR", account: "4000" }], status: "POSTED", einv: "NOT_SENT", einvLog: [], ...over,
  });

  it("a complete invoice passes every rule", () => expect(validatePint(inv(), org()).filter((r) => !r.ok)).toEqual([]));
  it("UAE B2B invoice over AED 10,000 without buyer TRN fails IBR-011", () => {
    expect(validatePint(inv({ customerTrn: "" }), org()).find((r) => r.rule === "IBR-011")?.ok).toBe(false);
  });
  it("XML carries totals in AED and escapes special characters", () => {
    const xml = toPintXml(inv({ customer: "A & B <Trading>" }), org());
    expect(xml).toContain("<cbc:TaxAmount currencyID=\"AED\">1000.00</cbc:TaxAmount>");
    expect(xml).toContain("<cbc:PayableAmount currencyID=\"AED\">21000.00</cbc:PayableAmount>");
    expect(xml).toContain("A &amp; B &lt;Trading&gt;");
  });
});
