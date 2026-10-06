/** PINT AE (UBL 2.1) mapper + pre-validation — POC subset. Verify against current PINT AE spec. */
import { fmtPlain } from "./money";
import { isTrn } from "./rules";
import { vatOnNet } from "./vat";
import { TAX_CONFIG } from "./config";
import type { Org, SalesInvoice } from "./types";

const VAT_CAT: Record<string, string> = { SR: "S", ZR: "Z", EX: "E", OS: "O", RCS: "AE", BLK: "S" };
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const a = fmtPlain;

export function invoiceTotals(inv: SalesInvoice) {
  const lines = inv.lines.map((l) => { const net = Math.round(l.qty * l.price); return { ...l, net, vat: l.taxCode === "SR" ? vatOnNet(net) : 0 }; });
  const net = lines.reduce((s, l) => s + l.net, 0), vat = lines.reduce((s, l) => s + l.vat, 0);
  return { lines, net, vat, total: net + vat };
}

export function validatePint(inv: SalesInvoice, org: Org): { rule: string; ok: boolean; msg: string }[] {
  const t = invoiceTotals(inv);
  return [
    { rule: "IBR-001", ok: !!inv.invNo, msg: "Invoice number (BT-1) is mandatory" },
    { rule: "IBR-002", ok: !!inv.date, msg: "Issue date (BT-2) is mandatory" },
    { rule: "IBR-010", ok: isTrn(org.trn), msg: "Seller TRN (BT-31) must be a valid 15-digit TRN" },
    { rule: "IBR-011", ok: inv.customerCountry !== "AE" || isTrn(inv.customerTrn) || t.total < 10_000_00, msg: "Buyer TRN required for UAE B2B tax invoices" },
    { rule: "IBR-020", ok: inv.lines.length > 0 && inv.lines.every((l) => l.desc && l.qty > 0), msg: "Each line needs a description and positive quantity" },
    { rule: "IBR-030", ok: t.total === t.net + t.vat, msg: "Payable amount = line extension + tax total" },
    { rule: "IBR-040", ok: inv.lines.every((l) => l.taxCode !== "ZR" || inv.customerCountry !== "AE" || /export|international/i.test(l.desc)), msg: "Zero-rated lines to UAE buyers need an export/zero-rating justification" },
    { rule: "IBR-050", ok: (new Date(inv.date).getTime() - Date.now()) / 864e5 < 1, msg: "Issue date cannot be in the future" },
  ];
}

export function toPintXml(inv: SalesInvoice, org: Org): string {
  const t = invoiceTotals(inv);
  const lines = t.lines.map((l, i) => `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="AED">${a(l.net)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.desc)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${VAT_CAT[l.taxCode]}</cbc:ID><cbc:Percent>${l.taxCode === "SR" ? TAX_CONFIG.vat.rateBp.value / 100 : 0}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="AED">${a(l.price)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ID>${esc(inv.invNo)}</cbc:ID>
  <cbc:IssueDate>${inv.date}</cbc:IssueDate>
  <cbc:DueDate>${inv.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0235">${org.trn}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${esc(org.name)}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:CountrySubentity>${org.emirate}</cbc:CountrySubentity><cac:Country><cbc:IdentificationCode>AE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${org.trn}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0235">${esc(inv.customerTrn || "N/A")}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${esc(inv.customer)}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>${inv.customerCountry}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="AED">${a(t.vat)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="AED">${a(t.net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="AED">${a(t.net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="AED">${a(t.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="AED">${a(t.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}
