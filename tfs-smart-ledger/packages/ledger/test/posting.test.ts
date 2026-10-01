import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { prepareJournal, postSalesInvoice, reverse, assertCanApprove, LedgerError } from "../src/posting";

const open = { isLocked: () => false };

describe("posting engine", () => {
  it("posts a balanced AED sales invoice with VAT", () => {
    const j = postSalesInvoice({ date: "2026-10-05", number: "INV-001", currency: "AED", fxRate: 1, preparedBy: "u1",
      lines: [{ revenueAccount: "4010", net: 1_000_000, vat: 50_000, taxCode: "SR", emirate: "AUH" }] });
    const out = prepareJournal(j, open);
    expect(out.reduce((a, l) => a + l.debitAed, 0)).toBe(1_050_000);
    expect(out.reduce((a, l) => a + l.creditAed, 0)).toBe(1_050_000);
  });
  it("rejects unbalanced journals", () => {
    expect(() => prepareJournal({ date: "2026-10-01", description: "x", currency: "AED", fxRate: 1, preparedBy: "u",
      lines: [{ accountCode: "1010", debit: 100, credit: 0 }, { accountCode: "4010", debit: 0, credit: 99 }] }, open)).toThrow(LedgerError);
  });
  it("rejects postings into locked periods", () => {
    expect(() => prepareJournal({ date: "2025-12-31", description: "x", currency: "AED", fxRate: 1, preparedBy: "u",
      lines: [{ accountCode: "1010", debit: 1, credit: 0 }, { accountCode: "4010", debit: 0, credit: 1 }] }, { isLocked: () => true })).toThrow(/locked/);
  });
  it("reversal swaps sides", () => {
    const j = postSalesInvoice({ date: "2026-10-05", number: "INV-2", currency: "AED", fxRate: 1, preparedBy: "u1",
      lines: [{ revenueAccount: "4010", net: 100, vat: 5, taxCode: "SR" }] });
    const r = reverse(j, "2026-10-06", "u2");
    expect(r.lines[0]).toMatchObject({ debit: 0, credit: 105 });
  });
  it("enforces maker-checker", () => { expect(() => assertCanApprove("a", "a")).toThrow(); });

  it("property: any balanced foreign-currency journal also balances exactly in AED", () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 1, max: 10_000_000 }), { minLength: 1, maxLength: 8 }),
      fc.double({ min: 0.01, max: 50, noNaN: true }),
      (amounts, rate) => {
        const fxRate = Math.round(rate * 1e6) / 1e6 || 0.01;
        const total = amounts.reduce((a, b) => a + b, 0);
        const lines = [
          ...amounts.map((a) => ({ accountCode: "6000", debit: a, credit: 0 })),
          { accountCode: "2000", debit: 0, credit: total },
        ];
        const out = prepareJournal({ date: "2026-10-01", description: "p", currency: "USD", fxRate, preparedBy: "u", lines }, open);
        return out.reduce((a, l) => a + l.debitAed - l.creditAed, 0) === 0;
      }));
  });
});
