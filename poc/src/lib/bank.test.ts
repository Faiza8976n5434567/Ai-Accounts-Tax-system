import { describe, expect, it } from "vitest";
import { matchCandidates, previousMonthEnd, type BookLine } from "./bank";

const line = (id: string, entry_date: string, amount: number, matched_txn: string | null = null) => ({ line_id: id, entry_date, amount, matched_txn }) as BookLine;

describe("manual match choices", () => {
  it("same amount, unmatched only, closest date first", () => {
    const book = [line("far", "2026-10-20", -5250), line("near", "2026-10-08", -5250), line("taken", "2026-10-07", -5250, "t9"), line("other", "2026-10-07", -5000)];
    expect(matchCandidates({ amount: -5250, txn_date: "2026-10-07" }, book).map((b) => b.line_id)).toEqual(["near", "far"]);
  });
});

describe("reconciliation date", () => {
  it("defaults to the end of last month", () => {
    expect(previousMonthEnd("2026-11-08")).toBe("2026-10-31");
    expect(previousMonthEnd("2026-03-01")).toBe("2026-02-28");
    expect(previousMonthEnd("2027-01-15")).toBe("2026-12-31");
  });
});
