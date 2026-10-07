import { describe, expect, it } from "vitest";
import { applyBp, fmt, parseAedToFils, toFils } from "./money";

describe("money (fils, half-up)", () => {
  it("converts AED to whole fils without float drift", () => {
    expect(toFils(0.1 + 0.2)).toBe(30);
    expect(toFils("1,234.56")).toBe(123456);
    expect(toFils("abc")).toBe(0);
  });

  it("VAT-09: 5% of 33.33 rounds half-up to 1.67 per line; 3 lines = 5.01", () => {
    const line = applyBp(toFils(33.33), 500);
    expect(line).toBe(167);
    expect(line * 3).toBe(501);
  });

  it("rounds negative amounts symmetrically (credit notes)", () => {
    expect(applyBp(-toFils(33.33), 500)).toBe(-167);
  });

  it("D-12: zero displays as 0.00, negatives in brackets", () => {
    expect(fmt(0)).toBe("0.00");
    expect(fmt(-150)).toBe("(1.50)");
  });
});

describe("parseAedToFils — exact, no floating point", () => {
  it("reads typed amounts", () => {
    expect(parseAedToFils("1,234.56")).toBe(123456);
    expect(parseAedToFils(" 1234.5 ")).toBe(123450);
    expect(parseAedToFils("3000000")).toBe(300000000);
    expect(parseAedToFils("0.1")).toBe(10);
    expect(parseAedToFils("-10")).toBe(-1000);
    expect(parseAedToFils("-0")).toBe(0);
  });
  it("LED-06 · refuses a fraction of a fils instead of rounding it", () => expect(parseAedToFils("10.005")).toBeNull());
  it("refuses text that isn't an amount", () => {
    for (const bad of ["", "abc", "1.2.3", "1e5", "AED 10", "--1"]) expect(parseAedToFils(bad)).toBeNull();
  });
});
