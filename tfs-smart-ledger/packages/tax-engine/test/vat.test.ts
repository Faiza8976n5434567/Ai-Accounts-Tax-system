import { describe, it, expect } from "vitest";
import { aed, buildVat201, isValidTrnFormat, type VatLine } from "../src";

describe("VAT 201 builder", () => {
  const lines: VatLine[] = [
    { id: "s1", direction: "SALE", taxCode: "SR", net: aed(100_000), emirate: "AUH" },
    { id: "s2", direction: "SALE", taxCode: "SR", net: aed(40_000), emirate: "DXB" },
    { id: "s3", direction: "SALE", taxCode: "ZR", net: aed(25_000) },          // export
    { id: "s4", direction: "SALE", taxCode: "EX", net: aed(5_000) },
    { id: "cn1", direction: "SALE", taxCode: "SR", net: aed(-10_000), emirate: "AUH" }, // credit note
    { id: "p1", direction: "PURCHASE", taxCode: "SR", net: aed(60_000) },
    { id: "p2", direction: "PURCHASE", taxCode: "RCS", net: aed(20_000) },     // foreign software
    { id: "p3", direction: "PURCHASE", taxCode: "BLK", net: aed(3_000) },      // client entertainment
  ];
  const r = buildVat201(lines);

  it("splits standard-rated sales by emirate net of credit notes", () => {
    expect(r.boxes["1a"]).toMatchObject({ amount: aed(90_000), vat: aed(4_500) });
    expect(r.boxes["1b"]).toMatchObject({ amount: aed(40_000), vat: aed(2_000) });
  });
  it("reports zero-rated and exempt supplies", () => {
    expect(r.boxes["4"].amount).toBe(aed(25_000));
    expect(r.boxes["5"].amount).toBe(aed(5_000));
  });
  it("puts reverse charge on both sides", () => {
    expect(r.boxes["3"]).toMatchObject({ amount: aed(20_000), vat: aed(1_000) });
    expect(r.boxes["10"]).toMatchObject({ amount: aed(20_000), vat: aed(1_000) });
  });
  it("excludes blocked input tax from recoverable VAT", () => {
    expect(r.boxes["9"].vat).toBe(aed(3_000)); // only p1
  });
  it("computes net payable", () => {
    // due = 4,500 + 2,000 + 1,000 = 7,500 ; recoverable = 3,000 + 1,000 = 4,000
    expect(r.box12DueTax).toBe(aed(7_500));
    expect(r.box13RecoverableTax).toBe(aed(4_000));
    expect(r.box14Payable).toBe(aed(3_500));
  });
  it("applies partial recovery", () => {
    const x = buildVat201([{ id: "p", direction: "PURCHASE", taxCode: "SR", net: aed(10_000), recoverableBp: 6_000 }]);
    expect(x.boxes["9"].vat).toBe(aed(300));
  });
  it("rounds half-up at line level", () => {
    const x = buildVat201([{ id: "r", direction: "SALE", taxCode: "SR", net: 1_010, emirate: "SHJ" }]); // AED 10.10 → 0.505
    expect(x.boxes["1c"].vat).toBe(51);
  });
  it("validates TRN format", () => {
    expect(isValidTrnFormat("100123456700003")).toBe(true);
    expect(isValidTrnFormat("12345")).toBe(false);
  });
});
