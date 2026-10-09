import { describe, expect, it } from "vitest";
import { validateJournal, trialBalance, balanceSheet, reverse } from "./ledger";
import { aed, journal, sale, purchase, expense } from "./testkit";
import type { JLine } from "./types";

const ok = (lines: JLine[]) => expect(validateJournal(lines)).toEqual([]);
const bad = (lines: JLine[], msg: RegExp) => expect(validateJournal(lines).join(" ")).toMatch(msg);

describe("ledger posting rules", () => {
  it("LED-01: Dr Rent 1,000 / Cr Bank 1,000 is valid", () => ok([{ account: "6100", debit: aed(1000), credit: 0 }, { account: "1010", debit: 0, credit: aed(1000) }]));
  it("LED-02: Dr 1,000.00 / Cr 999.99 is rejected", () => bad([{ account: "6100", debit: aed(1000), credit: 0 }, { account: "1010", debit: 0, credit: aed(999.99) }], /does not balance/));
  it("LED-03: a line with both debit and credit is rejected", () => bad([{ account: "6100", debit: 100, credit: 100 }, { account: "1010", debit: 0, credit: 0 }], /both debit and credit/));
  it("LED-04: negative amounts are rejected", () => bad([{ account: "6100", debit: -100, credit: 0 }, { account: "1010", debit: 0, credit: -100 }], /negative/));
  it("LED-05: single-line journal is rejected", () => bad([{ account: "6100", debit: 100, credit: 0 }], /at least two lines/));
  it("LED-06: fractions of a fils are rejected", () => bad([{ account: "6100", debit: 1000.5, credit: 0 }, { account: "1010", debit: 0, credit: 1000.5 }], /whole fils/));
  it("LED-12: unknown account is rejected", () => bad([{ account: "9999", debit: 100, credit: 0 }, { account: "1010", debit: 0, credit: 100 }], /unknown account/));
  it("rejects an all-zero journal", () => bad([{ account: "6100", debit: 0, credit: 0 }, { account: "1010", debit: 0, credit: 0 }], /zero/));
});

describe("trial balance", () => {
  it("LED-13: 1,000 random balanced journals keep total debits = total credits", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const accounts = ["1010", "1100", "1300", "2000", "2100", "4000", "5000", "6100", "6140"];
    const js = Array.from({ length: 1000 }, () => {
      const amt = 1 + Math.floor(rnd() * 10_000_000);
      const dr = accounts[Math.floor(rnd() * accounts.length)];
      const cr = accounts[Math.floor(rnd() * accounts.length)];
      return journal([{ account: dr, debit: amt, credit: 0 }, { account: cr, debit: 0, credit: amt }]);
    });
    const tb = trialBalance(js);
    expect(tb.reduce((s, r) => s + r.debit, 0)).toBe(tb.reduce((s, r) => s + r.credit, 0));
  });

  it("RPT-01: balance sheet balances (assets = liabilities + equity incl. current profit)", () => {
    const js = [
      journal([{ account: "1010", debit: aed(50_000), credit: 0 }, { account: "3000", debit: 0, credit: aed(50_000) }], { source: "OPENING" }),
      sale(10_000, 500, "SR", "AUH"),
      purchase("6100", 4_000, 200, "SR"),
      expense("6000", 2_500),
    ];
    const bs = balanceSheet(js);
    expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity);
  });

  it("LED-09: a reversal mirrors every line so the net effect is zero", () => {
    const j = sale(10_000, 500, "SR", "AUH");
    const rev = journal(reverse(j));
    expect(validateJournal(rev.lines)).toEqual([]);
    const tb = trialBalance([j, rev]);
    expect(tb.every((r) => r.balance === 0)).toBe(true);
  });
});
