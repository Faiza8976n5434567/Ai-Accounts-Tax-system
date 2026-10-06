import { describe, expect, it } from "vitest";
import { buildVat201, quarters } from "./vat";
import { aed, sale, purchase } from "./testkit";

describe("VAT 201 box mapping", () => {
  it("VAT-01: standard-rated sale net 10,000 (Abu Dhabi) → Box 1a 10,000 / 500", () => {
    const v = buildVat201([sale(10_000, 500, "SR", "AUH")]);
    expect(v.boxes["1a"]).toMatchObject({ amount: aed(10_000), vat: aed(500) });
  });

  it("VAT-02: supply emirate Dubai → Box 1b, not 1a", () => {
    const v = buildVat201([sale(10_000, 500, "SR", "DXB")]);
    expect(v.boxes["1b"]).toMatchObject({ amount: aed(10_000), vat: aed(500) });
    expect(v.boxes["1a"].amount).toBe(0);
  });

  it("VAT-03: zero-rated export 20,000 → Box 4 20,000 / 0", () => {
    const v = buildVat201([sale(20_000, 0, "ZR")]);
    expect(v.boxes["4"]).toMatchObject({ amount: aed(20_000), vat: 0 });
  });

  it("VAT-04: exempt supply 8,000 → Box 5 8,000", () => {
    const v = buildVat201([sale(8_000, 0, "EX", undefined, "4300")]);
    expect(v.boxes["5"]).toMatchObject({ amount: aed(8_000), vat: 0 });
  });

  it("VAT-05: imported service 6,000 under reverse charge → Box 3 and Box 10 6,000 / 300, net effect 0", () => {
    const v = buildVat201([purchase("6150", 6_000, 300, "RCS")]);
    expect(v.boxes["3"]).toMatchObject({ amount: aed(6_000), vat: aed(300) });
    expect(v.boxes["10"]).toMatchObject({ amount: aed(6_000), vat: aed(300) });
    expect(v.box14).toBe(0);
  });

  it("VAT-06: standard-rated expense 25,000 + 1,250 → Box 9 25,000 / 1,250", () => {
    const v = buildVat201([purchase("6100", 25_000, 1_250, "SR")]);
    expect(v.boxes["9"]).toMatchObject({ amount: aed(25_000), vat: aed(1_250) });
  });

  it("VAT-07: client entertainment 3,800 + 190 is blocked — not in Box 9", () => {
    const v = buildVat201([purchase("6140", 3_800, 190, "BLK")]);
    expect(v.boxes["9"].vat).toBe(0);
    expect(v.blocked.vat).toBe(aed(190));
  });

  it("VAT-11: Box 14 = Box 12 − Box 13", () => {
    const v = buildVat201([sale(10_000, 500, "SR", "AUH"), purchase("6100", 25_000, 1_250, "SR")]);
    expect(v.box12).toBe(aed(500));
    expect(v.box13).toBe(aed(1_250));
    expect(v.box14).toBe(aed(-750));
  });

  it("D-12 / VAT-18: an empty quarter still returns every box at 0", () => {
    const v = buildVat201([]);
    for (const b of Object.values(v.boxes)) expect(b).toMatchObject({ amount: 0, vat: 0 });
    expect(v.box14).toBe(0);
  });
});

describe("VAT periods", () => {
  it("VAT-12: quarter Oct–Dec 2026 is due 28 Jan 2027", () => {
    const q4 = quarters(2026)[3];
    expect(q4).toMatchObject({ from: "2026-10-01", to: "2026-12-31", due: "2027-01-28" });
  });
});
