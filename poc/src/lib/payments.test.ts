import { describe, expect, it } from "vitest";
import { advanceVat, daysOverdue, settlement, suggestAllocations } from "./payments";

const docs = [
  { id: "b2", doc_date: "2026-10-05", doc_no: "INV-2026-10-0002", open_fcy: 210000 },
  { id: "b1", doc_date: "2026-10-02", doc_no: "INV-2026-10-0001", open_fcy: 105000 },
];

describe("automatic allocation (mirrors app.post_payment)", () => {
  it("ARAP-09 · oldest invoice first: 2,000 settles 1,050 then 950", () => {
    expect(suggestAllocations(docs, 200000, 100)).toEqual([{ id: "b1", amount: 105000 }, { id: "b2", amount: 95000 }]);
  });
  it("D-34 · 1,049.40 for a 1,050 invoice settles it (0.60 written off)", () => {
    expect(suggestAllocations([docs[1]], 104940, 100)).toEqual([{ id: "b1", amount: 105000 }]);
  });
  it("a 10.00 shortfall is not topped up", () => {
    expect(suggestAllocations([docs[1]], 104000, 100)).toEqual([{ id: "b1", amount: 104000 }]);
  });
  it("ARAP-05 · overpayment allocates only the open amount", () => {
    expect(suggestAllocations([{ id: "a2", doc_date: "2026-10-02", doc_no: "A", open_fcy: 1050000 }], 1100000, 100)).toEqual([{ id: "a2", amount: 1050000 }]);
  });
  it("ignores documents with nothing open", () => {
    expect(suggestAllocations([{ id: "x", doc_date: "2026-10-01", doc_no: "X", open_fcy: 0 }], 5000, 100)).toEqual([]);
  });
});

describe("settlement of the difference", () => {
  it("ARAP-05 · 11,000 against 10,500 → 500 Customer Credit, nothing written off", () => {
    expect(settlement(1100000, 1050000, 100)).toEqual({ writeoff: 0, credit: 50000, error: null });
  });
  it("D-34 · 0.60 short → written off", () => {
    expect(settlement(104940, 105000, 100)).toEqual({ writeoff: 60, credit: 0, error: null });
  });
  it("D-34 · 0.50 over with documents → written off, not a credit", () => {
    expect(settlement(105050, 105000, 100)).toEqual({ writeoff: -50, credit: 0, error: null });
  });
  it("on account (nothing allocated) → all credit", () => {
    expect(settlement(50000, 0, 100)).toEqual({ writeoff: 0, credit: 50000, error: null });
  });
  it("10.00 short → refused", () => {
    expect(settlement(104000, 105000, 100).error).toMatch(/more than the amount/);
  });
  it("USD: the limit is compared in AED (USD 0.30 = AED 1.10 > 1.00)", () => {
    expect(settlement(104970, 105000, 100, "3.6725").error).not.toBeNull();
    expect(settlement(104980, 105000, 100, "3.6725").writeoff).toBe(20);
  });
});

describe("ageing", () => {
  it("days past the due date", () => {
    expect(daysOverdue("2026-10-31", "2026-11-30")).toBe(30);
    expect(daysOverdue("2026-10-31", "2026-10-07")).toBe(-24);
  });
});

describe("advance for a specific supply (D-58, F-02)", () => {
  it("10,500 received → VAT 500", () => expect(advanceVat(1050000, 500)).toBe(50000));
  it("2,100 → VAT 100; 1,000 → VAT 47.62 (half-up)", () => expect([advanceVat(210000, 500), advanceVat(100000, 500)]).toEqual([10000, 4762]));
});
