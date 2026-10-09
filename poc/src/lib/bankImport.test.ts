import { describe, expect, it } from "vitest";
import { findHeaderRow, guessMapping, mapStatement, numberText, parseStatementAmount, parseStatementDate } from "./bankImport";

describe("statement dates (D-38)", () => {
  it("UAE banks write day first", () => {
    expect(parseStatementDate("06/10/2026", "dd/mm/yyyy")).toBe("2026-10-06");
    expect(parseStatementDate("6-10-26", "dd/mm/yyyy")).toBe("2026-10-06");
    expect(parseStatementDate("10/06/2026", "mm/dd/yyyy")).toBe("2026-10-06");
    expect(parseStatementDate("06-Oct-2026", "dd-mmm-yyyy")).toBe("2026-10-06");
    expect(parseStatementDate("06 October 2026", "dd-mmm-yyyy")).toBe("2026-10-06");
    expect(parseStatementDate("2026/10/06", "yyyy-mm-dd")).toBe("2026-10-06");
  });
  it("Excel dates already arrive as YYYY-MM-DD", () => {
    expect(parseStatementDate("2026-10-06", "dd/mm/yyyy")).toBe("2026-10-06");
  });
  it("refuses impossible dates", () => {
    expect(parseStatementDate("31/02/2026", "dd/mm/yyyy")).toBeNull();
    expect(parseStatementDate("13/13/2026", "dd/mm/yyyy")).toBeNull();
    expect(parseStatementDate("Opening balance", "dd/mm/yyyy")).toBeNull();
  });
});

describe("statement amounts", () => {
  it("reads the usual bank formats exactly in fils", () => {
    expect(parseStatementAmount("1,234.50")).toBe(123450);
    expect(parseStatementAmount("-1,234.50")).toBe(-123450);
    expect(parseStatementAmount("(1,234.50)")).toBe(-123450);
    expect(parseStatementAmount("1,234.50 DR")).toBe(-123450);
    expect(parseStatementAmount("AED 1,234.50 CR")).toBe(123450);
    expect(parseStatementAmount("1234.5-")).toBe(-123450);
    expect(parseStatementAmount("")).toBe(0);
    expect(parseStatementAmount("abc")).toBeNull();
    expect(parseStatementAmount("1.234")).toBeNull();          // 3 decimals is not money
  });
  it("Excel numbers become plain text without float noise", () => {
    expect(numberText(1234.5)).toBe("1234.50");
    expect(numberText(0.1 + 0.2)).toBe("0.30");
    expect(numberText(1050000)).toBe("1050000");
  });
});

const enbd = [
  ["Emirates NBD — Account statement", "", "", "", "", ""],
  ["Account 1012xxxx4321", "", "", "", "", ""],
  ["Value Date", "Narration", "Cheque/Ref", "Debit", "Credit", "Balance"],
  ["", "Opening balance", "", "", "", "0.00"],
  ["06/10/2026", "TRANSFER FROM ALPHA BUYER", "FT123", "", "10,500.00", "10,500.00"],
  ["07/10/2026", "BANK CHARGE", "", "52.50", "", "10,447.50"],
  ["", "", "", "", "", ""],
  ["31/10/2026", "Closing balance", "", "", "", "10,447.50"],
];

describe("mapping a statement", () => {
  it("finds the title row and guesses the columns", () => {
    expect(findHeaderRow(enbd)).toBe(2);
    expect(guessMapping(enbd)).toEqual({ header_row: 2, date: "Value Date", description: "Narration", reference: "Cheque/Ref", in: "Credit", out: "Debit", balance: "Balance", date_format: "dd/mm/yyyy" });
  });
  it("money in/out columns → signed lines; title and balance lines skipped", () => {
    const r = mapStatement(enbd, guessMapping(enbd));
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { date: "2026-10-06", description: "TRANSFER FROM ALPHA BUYER", reference: "FT123", amount: 1050000, balance: 1050000 },
      { date: "2026-10-07", description: "BANK CHARGE", reference: null, amount: -5250, balance: 1044750 },
    ]);
    expect(r.skipped).toBe(2);
  });
  it("a single signed amount column", () => {
    const rows = [["Date", "Description", "Amount"], ["2026-10-08", "SALARY OCT", "-3,000.00"]];
    expect(mapStatement(rows, guessMapping(rows)).rows).toEqual([{ date: "2026-10-08", description: "SALARY OCT", reference: null, amount: -300000, balance: null }]);
  });
  it("tells the user exactly which row is wrong", () => {
    const rows = [["Date", "Description", "Amount"], ["2026-13-45", "BAD", "10.00"], ["01/11/2026", "OK", "x"]];
    expect(mapStatement(rows, guessMapping(rows)).errors).toEqual(['Row 2: "2026-13-45" is not a date in dd/mm/yyyy format.', "Row 3: the amount is not a number."]);
  });
  it("asks for the missing columns", () => {
    expect(mapStatement(enbd, { header_row: 2, date: "", description: "Narration", date_format: "dd/mm/yyyy" }).errors)
      .toEqual(["Choose the date column.", "Choose either one amount column, or both the money-in and money-out columns."]);
  });
});
