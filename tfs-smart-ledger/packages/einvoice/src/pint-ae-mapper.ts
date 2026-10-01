/**
 * Canonical invoice → PINT AE (UBL 2.1) XML.
 * STARTER ONLY: element coverage must be completed against the official PINT AE
 * specification and validation artefacts published by the UAE MoF / Peppol
 * (save them to docs/specs/pint-ae/ and ask Claude Code to generate full mapping +
 * schematron tests). Values marked TODO-SPEC are placeholders.
 */
export interface CanonicalParty { name: string; trn: string; peppolId: string; address: { street: string; city: string; emirate: string; country: string } }
export interface CanonicalLine { id: string; description: string; quantity: number; unitCode: string; unitPrice: number; net: number; vatCategory: "S" | "Z" | "E" | "O" | "AE"; vatRatePct: number }
export interface CanonicalInvoice {
  type: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  seller: CanonicalParty;
  buyer: CanonicalParty;
  lines: CanonicalLine[];
  vatTotal: number;
  precedingInvoiceNumber?: string; // required for credit notes
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const amt = (n: number, cur: string) => `currencyID="${cur}">${n.toFixed(2)}`;

export function validateCanonical(inv: CanonicalInvoice): string[] {
  const e: string[] = [];
  if (!/^\d{15}$/.test(inv.seller.trn)) e.push("Seller TRN must be 15 digits.");
  if (!inv.lines.length) e.push("At least one line required.");
  if (inv.type === "CREDIT_NOTE" && !inv.precedingInvoiceNumber) e.push("Credit note must reference the original invoice.");
  const net = inv.lines.reduce((a, l) => a + l.net, 0);
  const calcVat = inv.lines.reduce((a, l) => a + Math.round(l.net * l.vatRatePct) / 100, 0);
  if (Math.abs(calcVat - inv.vatTotal) > 0.01 * inv.lines.length) e.push(`VAT total ${inv.vatTotal} differs from line VAT ${calcVat.toFixed(2)}.`);
  if (net === 0) e.push("Zero-value document.");
  return e;
}

export function toPintAeXml(inv: CanonicalInvoice): string {
  const root = inv.type === "INVOICE" ? "Invoice" : "CreditNote";
  const net = inv.lines.reduce((a, l) => a + l.net, 0);
  const party = (p: CanonicalParty) => `
      <cac:Party>
        <cbc:EndpointID schemeID="TODO-SPEC">${esc(p.peppolId)}</cbc:EndpointID>
        <cac:PostalAddress><cbc:StreetName>${esc(p.address.street)}</cbc:StreetName><cbc:CityName>${esc(p.address.city)}</cbc:CityName><cbc:CountrySubentity>${esc(p.address.emirate)}</cbc:CountrySubentity><cac:Country><cbc:IdentificationCode>${p.address.country}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
        <cac:PartyTaxScheme><cbc:CompanyID>${p.trn}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
        <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
      </cac:Party>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>TODO-SPEC: PINT AE customization identifier</cbc:CustomizationID>
  <cbc:ProfileID>TODO-SPEC</cbc:ProfileID>
  <cbc:ID>${esc(inv.number)}</cbc:ID>
  <cbc:IssueDate>${inv.issueDate}</cbc:IssueDate>${inv.dueDate ? `\n  <cbc:DueDate>${inv.dueDate}</cbc:DueDate>` : ""}
  <cbc:DocumentCurrencyCode>${inv.currency}</cbc:DocumentCurrencyCode>${inv.precedingInvoiceNumber ? `
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(inv.precedingInvoiceNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ""}
  <cac:AccountingSupplierParty>${party(inv.seller)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party(inv.buyer)}
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount ${amt(inv.vatTotal, inv.currency)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${amt(net, inv.currency)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${amt(net, inv.currency)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${amt(net + inv.vatTotal, inv.currency)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount ${amt(net + inv.vatTotal, inv.currency)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${inv.lines.map((l) => `
  <cac:${root}Line>
    <cbc:ID>${esc(l.id)}</cbc:ID>
    <cbc:${inv.type === "INVOICE" ? "InvoicedQuantity" : "CreditedQuantity"} unitCode="${l.unitCode}">${l.quantity}</cbc:${inv.type === "INVOICE" ? "InvoicedQuantity" : "CreditedQuantity"}>
    <cbc:LineExtensionAmount ${amt(l.net, inv.currency)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${l.vatCategory}</cbc:ID><cbc:Percent>${l.vatRatePct}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount ${amt(l.unitPrice, inv.currency)}</cbc:PriceAmount></cac:Price>
  </cac:${root}Line>`).join("")}
</${root}>`;
}
