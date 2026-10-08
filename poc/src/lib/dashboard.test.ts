import { describe, expect, it } from "vitest";
import { attention, dso, firmTotals, sortByAttention, type DashRow } from "./dashboard";

const row = (over: Partial<DashRow>): DashRow => ({
  organization_id: "x", legal_name: "X", vat_registered: true, vat_open_returns: 0, vat_overdue_returns: 0, vat_next_due: "", vat_next_period_end: "",
  pending_journals: 0, pending_invoices: 0, pending_bills: 0, pending_payments: 0, pending_vat_returns: 0, pending_reconciliations: 0,
  ar_open: 0, ar_overdue: 0, ap_open: 0, ap_overdue: 0, revenue_ytd: 0, revenue_365: 0, bank_unmatched: 0, bank_reconciled_to: "",
  integrity_status: "ok", integrity_checked_at: "", ...over,
});

describe("F-23 · days sales outstanding", () => {
  it("open receivables ÷ last year's revenue × 365", () => {
    expect(dso(1050000, 12775000)).toBe(30);            // 10,500 open on 127,750 revenue → 30 days
    expect(dso(0, 1000000)).toBe(0);
    expect(dso(500, 0)).toBeNull();                     // no revenue → not meaningful
  });
});

describe("who needs attention first", () => {
  it("overdue VAT and integrity problems are urgent; approvals next; housekeeping last", () => {
    expect(attention(row({ vat_open_returns: 2, vat_overdue_returns: 1, pending_invoices: 1 }))).toEqual({ level: 3, reasons: ["1 VAT return overdue", "1 waiting for approval", "VAT return to prepare"] });
    expect(attention(row({ bank_unmatched: 3 }))).toEqual({ level: 1, reasons: ["3 bank lines to match"] });
    expect(attention(row({}))).toEqual({ level: 0, reasons: [] });
  });
  it("sorts the most urgent client to the top, then by name", () => {
    const rows = [row({ legal_name: "Calm LLC" }), row({ legal_name: "Busy LLC", pending_bills: 2 }), row({ legal_name: "Late LLC", vat_overdue_returns: 1, vat_open_returns: 1 })];
    expect(sortByAttention(rows).map((r) => r.legal_name)).toEqual(["Late LLC", "Busy LLC", "Calm LLC"]);
  });
  it("firm totals", () => {
    const t = firmTotals([row({ vat_overdue_returns: 1, vat_open_returns: 2, pending_journals: 1, ar_overdue: 500, integrity_status: "error" }), row({ pending_bills: 2, ar_overdue: 250 })]);
    expect(t).toMatchObject({ clients: 2, vatOverdue: 1, vatToPrepare: 2, approvals: 3, arOverdue: 750, integrityProblems: 1 });
  });
});
