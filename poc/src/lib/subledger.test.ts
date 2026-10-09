import { describe, expect, it } from "vitest";
import { subledger } from "./subledger";
import { trialBalance } from "./ledger";
import { aed, journal } from "./testkit";

const invoice = (gross: number, date: string, party: string) =>
  journal([{ account: "1100", debit: aed(gross), credit: 0 }, { account: "4000", debit: 0, credit: aed(gross) }], { date, party, source: "SALE" });
const receipt = (amount: number, date: string, party: string) =>
  journal([{ account: "1010", debit: aed(amount), credit: 0 }, { account: "1100", debit: 0, credit: aed(amount) }], { date, party, source: "BANK" });

describe("receivables sub-ledger", () => {
  it("ARAP-01: invoice 10,500, receipt 4,000 → open 6,500, aged by due date (30 days)", () => {
    const L = subledger([invoice(10_500, "2026-08-01", "Acme"), receipt(4_000, "2026-08-20", "Acme")], "1100", "2026-09-30");
    expect(L.total).toBe(aed(6_500));
    expect(L.items[0]).toMatchObject({ open: aed(6_500), due: "2026-08-31", overdueDays: 30 });
  });

  it("ARAP-02: sub-ledger total always equals GL account 1100", () => {
    const js = [invoice(10_500, "2026-07-01", "Acme"), invoice(2_100, "2026-08-01", "Beta"), receipt(5_000, "2026-08-10", "Acme")];
    const L = subledger(js, "1100", "2026-09-30");
    const gl = trialBalance(js).find((r) => r.code === "1100")!.balance;
    expect(L.total).toBe(gl);
  });

  it("settles the oldest invoice first", () => {
    const L = subledger([invoice(1_000, "2026-07-01", "Acme"), invoice(1_000, "2026-08-01", "Acme"), receipt(1_000, "2026-08-15", "Acme")], "1100", "2026-09-30");
    expect(L.items).toHaveLength(1);
    expect(L.items[0].date).toBe("2026-08-01");
  });
});
