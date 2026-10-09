import { describe, expect, it } from "vitest";
import { validatePint } from "./_pint";
import { amt, buildPint, buyerEndpoint, tinOf, type PintDoc, type PintLine } from "../src/lib/pint";

// Realistic fixtures (anonymised). Amounts in fils / cents.
const seller: PintDoc["seller"] = {
  name: "Pilot Trading LLC", tradeName: "Pilot Trading", trn: "100234567800003", countryCode: "AE", emirate: "DXB",
  addressLine1: "Office 1203, Bay Square 5", city: "Dubai", regType: "TL", regId: "1234567", regAuthority: "Dubai Department of Economy and Tourism",
  iban: "AE070331234567890123456", bankName: "Emirates NBD",
};
const buyer: PintDoc["buyer"] = {
  name: "Peppol Buyer LLC", trn: "100345678900003", countryCode: "AE", emirate: "AUH", addressLine1: "Plot 12, Mussafah", city: "Abu Dhabi",
  regType: "TL", regId: "CN-7654321", regAuthority: "Abu Dhabi Department of Economic Development", peppolScheme: "0235", notOnboarded: false,
};
const line = (p: Partial<PintLine> & Pick<PintLine, "no" | "netFcy" | "vatFcy">): PintLine => ({
  name: "Item", description: "Item description", quantity: "1", unitCode: "H87", unitPrice: p.netFcy, netAed: p.netFcy, vatAed: p.vatFcy,
  taxCode: "SR", rateBp: 500, itemType: "S", sacCode: "998311", ...p,
});
const doc = (p: Partial<PintDoc>): PintDoc => ({
  kind: "invoice", number: "INV-2026-10-0001", uuid: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b", issueDate: "2026-10-05", dueDate: "2026-11-04",
  currency: "AED", fxRate: "1", transactionType: "00000000", paymentMeansCode: "30", seller, buyer, lines: [], ...p,
});
const fatal = (d: PintDoc) => validatePint(buildPint(d), d.kind).fatal.map((f) => `${f.id}: ${f.text}`);

describe("PINT AE document builder — passes the official UAE rules (P4-06)", () => {
  it("formats amounts exactly and derives the TIN", () => {
    expect([amt(123456), amt(-50), amt(5)]).toEqual(["1234.56", "-0.50", "0.05"]);
    expect([tinOf("100234567800003"), tinOf("123")]).toEqual(["1002345678", null]);
  });

  it("standard tax invoice: goods (HS) + services (SAC), bank transfer with IBAN", () => {
    expect(fatal(doc({ lines: [
      line({ no: 1, name: "Laptop 14\"", description: "Business laptop, 14 inch", quantity: "2", unitPrice: 350000, netFcy: 700000, vatFcy: 35000, itemType: "G", hsCode: "84713000", sacCode: null }),
      line({ no: 2, name: "Consulting", description: "Advisory services per hour", quantity: "3", unitCode: "HUR", unitPrice: 50000, netFcy: 150000, vatFcy: 7500 }),
    ] }))).toEqual([]);
  }, 120_000);

  it("prices including VAT (D-54): paid 60.00 → 57.14 + 2.86", () => {
    expect(fatal(doc({ lines: [line({ no: 1, unitPrice: 6000, netFcy: 5714, vatFcy: 286, pricesIncludeVat: true })] }))).toEqual([]);
  }, 120_000);

  it("fractional quantity: 1.5 hours × 333.33", () => {
    expect(fatal(doc({ lines: [line({ no: 1, quantity: "1.5", unitCode: "HUR", unitPrice: 33333, netFcy: 50000, vatFcy: 2500 })] }))).toEqual([]);
  }, 120_000);

  it("exempt (with reason) and out-of-scope lines", () => {
    expect(fatal(doc({ lines: [
      line({ no: 1, name: "Arrangement fee", netFcy: 100000, vatFcy: 0, taxCode: "EX", exemptionReason: "DL8.46.1" }),
      line({ no: 2, name: "Government fee recharge", netFcy: 20000, vatFcy: 0, taxCode: "OS" }),
      line({ no: 3, netFcy: 100000, vatFcy: 5000 }),
    ] }))).toEqual([]);
  }, 120_000);

  it("export in USD, zero-rated, buyer not on Peppol (predefined 9900000099), Incoterms", () => {
    const d = doc({ currency: "USD", fxRate: "3.6725", transactionType: "00000001", incoterms: "CIF",
      buyer: { ...buyer, name: "Overseas Buyer Ltd", trn: null, countryCode: "GB", emirate: null, region: "England", city: "London", addressLine1: "1 King Street", regType: null, regId: null, regAuthority: null },
      lines: [line({ no: 1, itemType: "G", hsCode: "84713000", sacCode: null, quantity: "10", unitPrice: 100000, netFcy: 1000000, vatFcy: 0, netAed: 3672500, vatAed: 0, taxCode: "ZR" })] });
    expect(buyerEndpoint(d)).toEqual({ scheme: "0235", id: "9900000099" });
    expect(fatal(d)).toEqual([]);
  }, 120_000);

  it("buyer registered for VAT but not yet on Peppol → 9900000098", () => {
    const d = doc({ buyer: { ...buyer, notOnboarded: true }, lines: [line({ no: 1, netFcy: 100000, vatFcy: 5000 })] });
    expect(buyerEndpoint(d).id).toBe("9900000098");
    expect(fatal(d)).toEqual([]);
  }, 120_000);

  it("tax credit note: reason code and the original invoice", () => {
    expect(fatal(doc({ kind: "creditnote", number: "CN-2026-10-0001", uuid: "8b1e9c2d-3f4a-4b5c-9d6e-7f8a9b0c1d2e", dueDate: null, paymentMeansCode: null,
      creditReasonCode: "DL8.61.1.D", preceding: { number: "INV-2026-10-0001", date: "2026-10-05" },
      lines: [line({ no: 1, netFcy: 50000, vatFcy: 2500 })] }))).toEqual([]);
  }, 120_000);

  it("known limit (for Faizan's decision): VAT rounded per line can drift > 0.02 from taxable × 5% (ALIGNED-IBRP-S-09)", () => {
    // 10 lines of 0.10 → line VAT 0.005 → 0.01 each (half-up) = 0.10, but 1.00 × 5% = 0.05: a 0.05 difference.
    const lines = Array.from({ length: 10 }, (_, i) => line({ no: i + 1, netFcy: 10, vatFcy: 1 }));
    expect(fatal(doc({ lines })).join(" ")).toMatch(/ALIGNED-IBRP-S-09/);
  }, 120_000);

  it("the rules catch what is missing: a service without a service accounting code", () => {
    expect(fatal(doc({ lines: [line({ no: 1, netFcy: 100000, vatFcy: 5000, sacCode: null })] })).join(" ")).toMatch(/IBR-185-AE/);
  }, 120_000);
});
