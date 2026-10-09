import { describe, expect, it } from "vitest";
import { validatePint } from "./_pint";
import { einvoiceReadiness, toPintDoc } from "../src/lib/einvoice-ready";
import { buildPint } from "../src/lib/pint";
import type { Client } from "../src/lib/clients";
import type { Contact } from "../src/lib/contacts";
import type { InvoiceWithLines } from "../src/lib/invoices";

// Database-shaped rows (only the columns the e-invoice uses). Amounts in fils.
const client = {
  id: "c1", legal_name: "Pilot Trading LLC", trade_name: null, trn: "100234567800003", emirate_code: "DXB", address_line1: "Office 1203, Bay Square 5",
  address_line2: null, city: "Dubai", reg_type: "TL", licence_no: "1234567", licence_authority: "Dubai Department of Economy and Tourism",
  iban: "AE070331234567890123456", bank_name: "Emirates NBD", payment_means_code: "30",
} as unknown as Client;
const customer = {
  id: "k1", name: "Peppol Buyer LLC", customer_type: "business", trn: "100345678900003", country_code: "AE", emirate_code: "AUH", region: null,
  address_line1: "Plot 12, Mussafah", city: "Abu Dhabi", reg_type: "TL", reg_id: "CN-7654321", reg_authority: "Abu Dhabi DED", passport_country: null,
  peppol_scheme: "0235", peppol_id: null, einv_not_onboarded: false,
} as unknown as Contact;
const line = (n: number, p: Record<string, unknown>) => ({ line_no: n, description: "Advisory services", quantity: 1, unit_price: 100000, net_fcy: 100000, vat_fcy: 5000,
  net: 100000, vat: 5000, tax_code: "SR", unit_code: "HUR", item_type: "S", hs_code: null, sac_code: "998311", exemption_reason: null, ...p });
const invoice = {
  id: "i1", doc_type: "invoice", status: "posted", invoice_no: "INV-2026-10-0001", einv_uuid: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b", issue_date: "2026-10-05",
  due_date: "2026-11-04", currency: "AED", fx_rate: 1, transaction_type: "00000000", payment_means_code: "30", credit_reason_code: null, incoterms: null,
  customer_reference: "PO-77", prices_include_vat: false, contact_id: "k1",
  lines: [line(1, { description: "Business laptop, 14 inch", quantity: 2, unit_price: 350000, net_fcy: 700000, vat_fcy: 35000, net: 700000, vat: 35000, unit_code: "H87", item_type: "G", hs_code: "84713000", sac_code: null }), line(2, {})],
} as unknown as InvoiceWithLines;

describe("E-invoice ready? + conversion → passes the official UAE rules (P4-05, P4-06)", () => {
  it("a complete posted invoice is ready and its PINT AE file passes", () => {
    expect(einvoiceReadiness(invoice, client, customer)).toEqual({ status: "ready", problems: [] });
    const r = validatePint(buildPint(toPintDoc(invoice, client, customer, 500)), "invoice");
    expect(r.fatal.map((f) => `${f.id}: ${f.text}`)).toEqual([]);
  }, 120_000);

  it("a credit note with its reason and original invoice passes", () => {
    const cn = { ...invoice, id: "i2", doc_type: "credit_note", invoice_no: "CN-2026-10-0001", einv_uuid: "8b1e9c2d-3f4a-4b5c-9d6e-7f8a9b0c1d2e",
      credit_reason_code: "DL8.61.1.D", payment_means_code: null, lines: [line(1, {})] } as unknown as InvoiceWithLines;
    expect(einvoiceReadiness(cn, client, customer).status).toBe("ready");
    const r = validatePint(buildPint(toPintDoc(cn, client, customer, 500, invoice)), "creditnote");
    expect(r.fatal.map((f) => `${f.id}: ${f.text}`)).toEqual([]);
  }, 120_000);

  it("lists what is missing in plain words", () => {
    const bare = { ...client, address_line1: null, iban: null } as unknown as Client;
    const draft = { ...invoice, status: "draft", invoice_no: null, lines: [line(1, { item_type: null, sac_code: null })] } as unknown as InvoiceWithLines;
    expect(einvoiceReadiness(draft, bare, { ...customer, city: null } as Contact).problems).toEqual([
      "Approve the invoice first — it gets its number then.",
      "Client: add address line 1 and city (Edit details → E-invoicing).",
      "Customer Peppol Buyer LLC: add address line 1 and city (E-invoicing details).",
      "Client: add the IBAN for bank payments (Edit details → E-invoicing).",
      "Line 1: pick an item (goods / services with its HS or service code).",
    ]);
  });

  it("consumers are not in scope (D-59)", () => {
    expect(einvoiceReadiness(invoice, client, { ...customer, customer_type: "consumer" } as Contact).status).toBe("not_in_scope");
  });
});
