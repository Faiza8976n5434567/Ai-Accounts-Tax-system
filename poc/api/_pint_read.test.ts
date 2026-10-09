import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { officialExample } from "./_pint";
import { buildPint, type PintDoc } from "../src/lib/pint";
import { inboundChecks, readPint, toMinor, toPurchaseDoc } from "../src/lib/pint-read";

const parse = (xml: string) => readPint(new DOMParser().parseFromString(xml, "text/xml") as unknown as Document);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "einvoicing", "pint-ae-1.0.4");

// A supplier's e-invoice to our client (TRN 100234567800003), built with our own generator.
const supplierInvoice: PintDoc = {
  kind: "invoice", number: "SUP-2026-0042", uuid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", issueDate: "2026-10-05", dueDate: "2026-11-04", currency: "AED", fxRate: "1",
  transactionType: "00000000", paymentMeansCode: "30",
  seller: { name: "Peppol Supplier LLC", trn: "100345678900003", countryCode: "AE", emirate: "SHJ", city: "Sharjah", addressLine1: "Industrial Area 4", regType: "TL", regId: "765432", regAuthority: "Sharjah SEDD", iban: "AE070331234567890123456" },
  buyer: { name: "Pilot Trading LLC", trn: "100234567800003", countryCode: "AE", emirate: "DXB", city: "Dubai", addressLine1: "Bay Square 5", regType: "TL", regId: "1234567", regAuthority: "Dubai DET", peppolScheme: "0235", notOnboarded: false },
  lines: [
    { no: 1, name: "Office chair", description: "Ergonomic office chair", quantity: "4", unitCode: "H87", unitPrice: 45000, netFcy: 180000, vatFcy: 9000, netAed: 180000, vatAed: 9000, taxCode: "SR", rateBp: 500, itemType: "G", hsCode: "94013000" },
    { no: 2, name: "Assembly", description: "Assembly service", quantity: "1", unitCode: "C62", unitPrice: 20000, netFcy: 20000, vatFcy: 1000, netAed: 20000, vatAed: 1000, taxCode: "SR", rateBp: 500, itemType: "S", sacCode: "998729" },
  ],
};

describe("Received e-invoices → draft bills (P4-08)", () => {
  it("reads decimal amounts exactly (half-up to the fils)", () => {
    expect([toMinor("10486"), toMinor("532.1645"), toMinor("0.005"), toMinor("-12.5"), toMinor("x")]).toEqual([1048600, 53216, 1, -1250, NaN]);
  });

  it("reads a supplier's e-invoice back: parties, lines, codes, totals", () => {
    const r = parse(buildPint(supplierInvoice));
    expect(r).toMatchObject({ kind: "invoice", number: "SUP-2026-0042", uuid: supplierInvoice.uuid, issueDate: "2026-10-05", dueDate: "2026-11-04", currency: "AED",
      supplier: { name: "Peppol Supplier LLC", trn: "100345678900003", emirate: "SHJ" }, buyer: { trn: "100234567800003" }, totals: { net: 200000, vat: 10000, payable: 210000 } });
    expect(r.lines.map((l) => [l.name, l.quantity, l.net, l.vat, l.category, l.itemType, l.hsCode ?? l.sacCode])).toEqual([
      ["Office chair", "4", 180000, 9000, "S", "G", "94013000"], ["Assembly", "1", 20000, 1000, "S", "S", "998729"]]);
    expect(inboundChecks(r, "100234567800003")).toEqual({ errors: [], warnings: [] });
  });

  it("refuses an e-invoice addressed to another TRN", () => {
    expect(inboundChecks(parse(buildPint(supplierInvoice)), "100999999900003").errors[0]).toMatch(/addressed to TRN 100234567800003/);
  });

  it("builds the draft bill: one line per e-invoice line at its exact net amount", () => {
    const doc = toPurchaseDoc(parse(buildPint(supplierInvoice)), "sup-id", [{ accountId: "a1", taxCode: "SR" }, { accountId: "a2", taxCode: "SR" }]);
    expect(doc).toMatchObject({ contact_id: "sup-id", supplier_invoice_no: "SUP-2026-0042", bill_date: "2026-10-05", supplier_trn_on_invoice: "100345678900003",
      lines: [{ description: "Office chair — Ergonomic office chair — (4 H87)", quantity: "1", unit_price: 180000, account_id: "a1", tax_code: "SR" },
              { description: "Assembly — Assembly service", quantity: "1", unit_price: 20000, account_id: "a2", tax_code: "SR" }] });
  });

  it("a supplier's credit note → debit note on the original bill", () => {
    const r = parse(officialExample("creditnote", "Standard tax credit Note.xml"));
    expect(r.kind).toBe("creditnote");
    expect(r.preceding?.number).toBeTruthy();
    expect(r.creditReason).toBe("DL8.61.1.E");
    expect(toPurchaseDoc(r, "s", r.lines.map(() => ({ accountId: "a", taxCode: "SR" })), "bill-1")).toMatchObject({ doc_type: "debit_note", original_bill_id: "bill-1" });
  });

  it.each(readdirSync(join(ROOT, "trn-invoice", "example")).filter((f) => f.endsWith(".xml")))("reads the official example: %s", (f) => {
    const r = parse(officialExample("invoice", f));
    expect(r.uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.every((l) => !Number.isNaN(l.net))).toBe(true);
  });
});
