import { describe, expect, it } from "vitest";
import { attachmentPath, billTotals, contentProblem, debitRemaining, sha256Hex, SIGNED_LINK_SECONDS, sniffMime, uploadProblem } from "./bills";
import { lineAmounts } from "./invoices";

describe("purchase bill totals (mirrors app.review_purchase_bill)", () => {
  it("VAT-06 · 25,000 + 1,250 from a registered supplier: VAT recovered, payable 26,250", () => {
    const l = lineAmounts(10000n, 2500000, 500, "1");
    expect(billTotals([{ taxCode: "SR", ...l }], true)).toEqual({ net: 2500000, vat: 125000, recoverable: 125000, payable: 2625000 });
  });
  it("VAT-05 · reverse charge 6,000: VAT 300 self-assessed and recovered, supplier owed 6,000", () => {
    const l = lineAmounts(10000n, 600000, 500, "1");
    expect(billTotals([{ taxCode: "RCS", ...l }], false)).toEqual({ net: 600000, vat: 30000, recoverable: 30000, payable: 600000 });
  });
  it("D-42 · imported goods 10,000: VAT 500 self-assessed like reverse charge, supplier owed 10,000", () => {
    const l = lineAmounts(10000n, 1000000, 500, "1");
    expect(billTotals([{ taxCode: "IMG", ...l }], false)).toEqual({ net: 1000000, vat: 50000, recoverable: 50000, payable: 1000000 });
  });
  it("VAT-07 · blocked entertainment 3,800 + 190: nothing recovered, payable 3,990", () => {
    const l = lineAmounts(10000n, 380000, 500, "1");
    expect(billTotals([{ taxCode: "BLK", ...l }], true)).toEqual({ net: 380000, vat: 19000, recoverable: 0, payable: 399000 });
  });
  it("VAT-08 · failed checks: standard-rated VAT not recovered (D-32)", () => {
    const l = lineAmounts(10000n, 100000, 500, "1");
    expect(billTotals([{ taxCode: "SR", ...l }], false).recoverable).toBe(0);
  });
  it("USD 1,000 → AED 3,672.50 + VAT 183.63 (half-up on the AED line)", () => {
    const l = lineAmounts(10000n, 100000, 500, "3.6725");
    expect(billTotals([{ taxCode: "SR", ...l }], true)).toEqual({ net: 367250, vat: 18363, recoverable: 18363, payable: 385613 });
  });
});

describe("debit notes", () => {
  it("what is left after posted debit notes only", () => {
    const bill = { id: "b", net_total: 2500000, vat_total: 125000 };
    const all = [
      { original_bill_id: "b", status: "posted" as const, net_total: 500000, vat_total: 25000 },
      { original_bill_id: "b", status: "draft" as const, net_total: 900000, vat_total: 45000 },
      { original_bill_id: "x", status: "posted" as const, net_total: 100, vat_total: 5 },
    ];
    expect(debitRemaining(bill, all)).toEqual({ net: 2000000, vat: 100000 });
  });
});

describe("attachments (S-2.5, DM-08)", () => {
  it("accepts PDF/JPG/PNG up to 10 MB only", () => {
    expect(uploadProblem({ type: "application/pdf", size: 52_000 })).toBeNull();
    expect(uploadProblem({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
    expect(uploadProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(uploadProblem({ type: "application/zip", size: 10 })).toMatch(/PDF, JPG or PNG/);
    expect(uploadProblem({ type: "application/pdf", size: 0 })).toMatch(/empty/);
  });
  it("stores under the client's private folder, named by content hash", () => {
    expect(attachmentPath("org1", "bill1", "ab".repeat(32), "image/jpeg")).toBe(`org1/bills/bill1/${"ab".repeat(32)}.jpg`);
  });
  it("SHA-256 of 'abc' is the standard test vector", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("SEC-13 · the file's content must match its type", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("recognises real PDF, PNG and JPG files", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 "))).toBe("application/pdf");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });
  it("rejects a Windows program renamed to .pdf", () => {
    expect(sniffMime(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();                       // "MZ" = .exe
    expect(contentProblem(bytes(0x4d, 0x5a, 0x90, 0x00), "application/pdf")).toMatch(/not a real PDF/);
  });
  it("rejects a PNG claiming to be a PDF, accepts a matching file", () => {
    expect(contentProblem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "application/pdf")).not.toBeNull();
    expect(contentProblem(new TextEncoder().encode("%PDF-1.4"), "application/pdf")).toBeNull();
  });
  it("SEC-20 · document links expire after 60 seconds", () => expect(SIGNED_LINK_SECONDS).toBe(60));
});
