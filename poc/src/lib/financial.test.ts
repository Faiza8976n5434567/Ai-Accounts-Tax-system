import { describe, expect, it } from "vitest";
import { ageingByContact, bsLayout, bucketOf, DEFAULT_BUCKETS, pnlLayout, safeCell, xlsxRow, type AgeRow, type BsRow, type PnlRow } from "./financial";

const p = (code: string, type: "revenue" | "expense", report_group: string, amount: number) => ({ account_id: code, code, name: code, type, report_group, amount }) as PnlRow;

describe("profit & loss layout", () => {
  it("gross profit, other income, expenses, tax and net profit", () => {
    const r = pnlLayout([p("4010", "revenue", "Revenue", 1000000), p("5000", "expense", "Cost of sales", 400000), p("4300", "revenue", "Other income", 50000),
      p("6100", "expense", "Operating expenses", 250000), p("7000", "expense", "Income tax", 9000)]);
    expect([r.grossProfit, r.beforeTax, r.netProfit]).toEqual([600000, 400000, 391000]);
    expect(r.sections.map((s) => `${s.title} ${s.total}`)).toEqual(["Revenue 1000000", "Cost of sales 400000", "Other income 50000", "Expenses 250000", "Income tax 9000"]);
  });
});

const b = (section: string, report_group: string, amount: number, row_kind = "account") => ({ section, report_group, amount, row_kind, code: null, name: "", account_id: null }) as unknown as BsRow;
describe("balance sheet layout", () => {
  it("RPT-01 · assets = liabilities + equity, grouped by report group", () => {
    const r = bsLayout([b("assets", "Receivables", 350000), b("liabilities", "Payables", 30000), b("equity", "Equity", 200000),
      b("equity", "Equity", 70000, "earlier_years_result"), b("equity", "Equity", 50000, "current_year_result")]);
    expect(r.balanced).toBe(true);
    expect(r.equity.groups).toHaveLength(1);
    expect(r.equity.total).toBe(320000);
  });
  it("flags an imbalance", () => expect(bsLayout([b("assets", "Receivables", 1)]).balanced).toBe(false));
});

const a = (contact_id: string, contact_name: string, days_overdue: number, open_aed: number) => ({ contact_id, contact_name, days_overdue, open_aed }) as AgeRow;
describe("ageing buckets (firm setting)", () => {
  it("not yet due is Current; 1–30, 31–60, 61–90, 90+", () => {
    expect([-5, 0, 1, 30, 31, 90, 91, 400].map((d) => DEFAULT_BUCKETS[bucketOf(d, DEFAULT_BUCKETS)].label)).toEqual(["Current", "Current", "1–30", "1–30", "31–60", "61–90", "90+", "90+"]);
  });
  it("per customer and in total", () => {
    const r = ageingByContact([a("c2", "Beta", 45, 100000), a("c1", "Alpha", -3, 650000), a("c1", "Alpha", 95, 20000)], DEFAULT_BUCKETS);
    expect(r.list.map((c) => `${c.contact} ${c.buckets.join("/")} = ${c.total}`)).toEqual(["Alpha 650000/0/0/0/20000 = 670000", "Beta 0/0/100000/0/0 = 100000"]);
    expect(r.totals).toEqual([650000, 0, 100000, 0, 20000]);
    expect(r.total).toBe(770000);
  });
});

describe("Excel export", () => {
  it("SEC-14 · a contact named =HYPERLINK(...) is escaped", () => {
    expect(safeCell('=HYPERLINK("http://x","click")')).toBe('\'=HYPERLINK("http://x","click")');
    expect(safeCell("+971 50 123 4567")).toBe("'+971 50 123 4567");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("Alpha Buyer LLC")).toBe("Alpha Buyer LLC");
  });
  it("RPT-03 · amounts go out as dirhams and add up to the on-screen total", () => {
    const rows = [xlsxRow(["Revenue", { fils: 1000050 }]), xlsxRow(["Other", { fils: 333 }]), xlsxRow(["-Refund", null])];
    expect(rows).toEqual([["Revenue", 10000.5], ["Other", 3.33], ["'-Refund", null]]);
    expect(Math.round(rows.reduce((s, r) => s + ((r[1] as number) ?? 0), 0) * 100)).toBe(1000383);
  });
});
