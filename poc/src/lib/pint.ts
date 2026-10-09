/** P4-06 · PINT AE Billing 1.0.4 document (UBL 2.1) for a sales invoice or credit note. Element order and conventions
 *  follow the official UAE Peppol Authority examples (poc/einvoicing/pint-ae-1.0.4); the official rules are run over the
 *  output in tests (api/_pint.ts). Pure — amounts are integer minor units (fils / cents), formatted exactly. */

export type PintTaxCode = "SR" | "ZR" | "EX" | "OS";
export interface PintParty {
  name: string; tradeName?: string | null; trn?: string | null; countryCode: string; emirate?: string | null; region?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  regType?: string | null; regId?: string | null; regAuthority?: string | null; passportCountry?: string | null;
}
export interface PintBuyer extends PintParty { peppolScheme: string; peppolId?: string | null; notOnboarded: boolean }
export interface PintSeller extends PintParty { iban?: string | null; bankName?: string | null }
export interface PintLine {
  no: number; name: string; description: string; quantity: string; unitCode: string;
  unitPrice: number; netFcy: number; vatFcy: number; netAed: number; vatAed: number;
  taxCode: PintTaxCode; rateBp: number; itemType: "G" | "S" | "B"; hsCode?: string | null; sacCode?: string | null;
  exemptionReason?: string | null; pricesIncludeVat?: boolean;
}
export interface PintDoc {
  kind: "invoice" | "creditnote"; number: string; uuid: string; issueDate: string; dueDate?: string | null;
  currency: "AED" | "USD"; fxRate: string; transactionType: string; paymentMeansCode?: string | null;
  creditReasonCode?: string | null; preceding?: { number: string; date: string } | null; incoterms?: string | null;
  buyerReference?: string | null; note?: string | null;
  seller: PintSeller; buyer: PintBuyer; lines: PintLine[];
}

/** UAE predefined endpoints (MoF e-invoicing guidelines): deemed supply, buyer not on Peppol, export to a buyer not on Peppol. */
export const PREDEFINED = { deemed: "9900000097", notOnboarded: "9900000098", export: "9900000099" } as const;
const CATEGORY: Record<PintTaxCode, "S" | "Z" | "E" | "O"> = { SR: "S", ZR: "Z", EX: "E", OS: "O" };
const PAYMENT_MEANS: Record<string, string> = { "1": "Instrument not defined", "10": "In cash", "20": "Cheque", "30": "Credit transfer", "31": "Debit transfer",
  "42": "Payment to bank account", "48": "Bank card", "49": "Direct debit", "54": "Credit card", "55": "Debit card", "58": "SEPA credit transfer" };

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
/** Minor units → "1234.56" exactly. */
export const amt = (minor: number) => { const s = minor < 0 ? "-" : "", a = Math.abs(minor); return `${s}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`; };
const pct = (bp: number) => amt(bp);                                         // 500 bp → "5.00" (IBR-190-AE)
/** The TIN: the first 10 digits of a 15-digit TRN. */
export const tinOf = (trn: string | null | undefined) => (trn && /^1\d{14}$/.test(trn) ? trn.slice(0, 10) : null);

/** The buyer's electronic address (IBT-049): own Peppol ID, else the predefined endpoints, else the TIN. */
export function buyerEndpoint(d: Pick<PintDoc, "transactionType" | "buyer">): { scheme: string; id: string } {
  const b = d.buyer;
  if (d.transactionType[1] === "1") return { scheme: "0235", id: PREDEFINED.deemed };
  if (b.peppolId) return { scheme: b.peppolScheme, id: b.peppolId };
  if (b.countryCode !== "AE") return { scheme: "0235", id: PREDEFINED.export };
  if (b.notOnboarded || !tinOf(b.trn)) return { scheme: "0235", id: PREDEFINED.notOnboarded };
  return { scheme: "0235", id: tinOf(b.trn)! };
}

function party(p: PintParty, endpoint: { scheme: string; id: string }, ind: string): string {
  const L: string[] = [];
  L.push(`<cbc:EndpointID schemeID="${esc(endpoint.scheme)}">${esc(endpoint.id)}</cbc:EndpointID>`);
  if (p.tradeName) L.push(`<cac:PartyName><cbc:Name>${esc(p.tradeName)}</cbc:Name></cac:PartyName>`);
  L.push("<cac:PostalAddress>");
  if (p.addressLine1) L.push(`  <cbc:StreetName>${esc(p.addressLine1)}</cbc:StreetName>`);
  if (p.addressLine2) L.push(`  <cbc:AdditionalStreetName>${esc(p.addressLine2)}</cbc:AdditionalStreetName>`);
  if (p.city) L.push(`  <cbc:CityName>${esc(p.city)}</cbc:CityName>`);
  const sub = p.countryCode === "AE" ? p.emirate : p.region;                                   // IBR-128 / IBR-144-AE
  if (sub) L.push(`  <cbc:CountrySubentity>${esc(sub)}</cbc:CountrySubentity>`);
  L.push(`  <cac:Country><cbc:IdentificationCode>${esc(p.countryCode)}</cbc:IdentificationCode></cac:Country>`, "</cac:PostalAddress>");
  if (p.trn) L.push(`<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.trn)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`);
  L.push("<cac:PartyLegalEntity>", `  <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`);
  if (p.regId) {
    const attrs = [p.regType ? `schemeAgencyID="${esc(p.regType)}"` : "", p.regAuthority ? `schemeAgencyName="${esc(p.regAuthority)}"` : ""].filter(Boolean).join(" ");
    L.push(`  <cbc:CompanyID${attrs ? " " + attrs : ""}>${esc(p.regId)}</cbc:CompanyID>`);
  }
  L.push("</cac:PartyLegalEntity>");
  return L.map((l) => ind + l).join("\n");
}

const taxCategory = (code: PintTaxCode, rateBp: number, reason?: string | null) => {
  const c = CATEGORY[code];
  return `<cbc:ID>${c}</cbc:ID>${c === "S" || c === "Z" ? `<cbc:Percent>${c === "S" ? pct(rateBp) : "0"}</cbc:Percent>` : ""}`
    + (c === "E" && reason ? `<cbc:TaxExemptionReasonCode>${esc(reason)}</cbc:TaxExemptionReasonCode>` : "")
    + `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
};

/** Unit price that keeps IBT-147 exact: the unit price when quantity × price gives the line amount, else the line
 *  amount over the whole quantity as base (prices including VAT, fractional quantities). */
function price(l: PintLine): { amount: number; base: string } {
  const q = Number(l.quantity);
  if (!l.pricesIncludeVat && Number.isInteger(q) && q * l.unitPrice === l.netFcy) return { amount: l.unitPrice, base: "1" };
  return { amount: l.netFcy, base: l.quantity };
}

export function buildPint(d: PintDoc): string {
  const cn = d.kind === "creditnote", cur = d.currency, usd = cur !== "AED";
  const root = cn ? "CreditNote" : "Invoice", lineTag = cn ? "CreditNoteLine" : "InvoiceLine", qtyTag = cn ? "CreditedQuantity" : "InvoicedQuantity";
  const net = d.lines.reduce((s, l) => s + l.netFcy, 0), vat = d.lines.reduce((s, l) => s + l.vatFcy, 0);
  const vatAed = d.lines.reduce((s, l) => s + l.vatAed, 0), grossAed = d.lines.reduce((s, l) => s + l.netAed + l.vatAed, 0);
  const groups = new Map<string, { code: PintTaxCode; rateBp: number; reason?: string | null; taxable: number; tax: number }>();
  for (const l of d.lines) {
    const k = `${CATEGORY[l.taxCode]}|${l.taxCode === "SR" ? l.rateBp : 0}|${l.taxCode === "EX" ? l.exemptionReason ?? "" : ""}`;
    const g = groups.get(k) ?? { code: l.taxCode, rateBp: l.rateBp, reason: l.exemptionReason, taxable: 0, tax: 0 };
    g.taxable += l.netFcy; g.tax += l.vatFcy; groups.set(k, g);
  }
  const X: string[] = [];
  const t = (n: number) => "\t".repeat(n);
  X.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  X.push(`<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`);
  X.push(`${t(1)}<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>`, `${t(1)}<cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>`);
  X.push(`${t(1)}<cbc:ProfileExecutionID>${esc(d.transactionType)}</cbc:ProfileExecutionID>`, `${t(1)}<cbc:ID>${esc(d.number)}</cbc:ID>`, `${t(1)}<cbc:UUID>${esc(d.uuid)}</cbc:UUID>`);
  X.push(`${t(1)}<cbc:IssueDate>${d.issueDate}</cbc:IssueDate>`);
  if (!cn && d.dueDate) X.push(`${t(1)}<cbc:DueDate>${d.dueDate}</cbc:DueDate>`);
  X.push(cn ? `${t(1)}<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>` : `${t(1)}<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>`);
  if (d.note) X.push(`${t(1)}<cbc:Note>${esc(d.note)}</cbc:Note>`);
  X.push(`${t(1)}<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`);
  if (usd) X.push(`${t(1)}<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>`);
  if (d.buyerReference) X.push(`${t(1)}<cbc:BuyerReference>${esc(d.buyerReference)}</cbc:BuyerReference>`);
  if (cn && d.creditReasonCode) X.push(`${t(1)}<cac:DiscrepancyResponse><cbc:ResponseCode>${esc(d.creditReasonCode)}</cbc:ResponseCode></cac:DiscrepancyResponse>`);
  if (d.preceding) X.push(`${t(1)}<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(d.preceding.number)}</cbc:ID><cbc:IssueDate>${d.preceding.date}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`);
  if (usd) X.push(`${t(1)}<cac:AdditionalDocumentReference><cbc:ID>AED</cbc:ID><cbc:DocumentTypeCode>aedtotal-incl-vat</cbc:DocumentTypeCode><cbc:DocumentDescription>AED ${amt(grossAed)}</cbc:DocumentDescription></cac:AdditionalDocumentReference>`);
  X.push(`${t(1)}<cac:AccountingSupplierParty>`, `${t(2)}<cac:Party>`, party(d.seller, { scheme: "0235", id: tinOf(d.seller.trn) ?? "" }, t(3)), `${t(2)}</cac:Party>`, `${t(1)}</cac:AccountingSupplierParty>`);
  X.push(`${t(1)}<cac:AccountingCustomerParty>`, `${t(2)}<cac:Party>`, party(d.buyer, buyerEndpoint(d), t(3)), `${t(2)}</cac:Party>`, `${t(1)}</cac:AccountingCustomerParty>`);
  const exportTo = d.transactionType[7] === "1" && d.buyer.countryCode !== "AE" ? d.buyer : null;     // IBR-152-AE: deliver to the buyer's address
  if (exportTo || d.incoterms) {
    X.push(`${t(1)}<cac:Delivery>`);
    if (exportTo) X.push(`${t(2)}<cac:DeliveryLocation><cac:Address>${exportTo.addressLine1 ? `<cbc:StreetName>${esc(exportTo.addressLine1)}</cbc:StreetName>` : ""}`
      + `${exportTo.city ? `<cbc:CityName>${esc(exportTo.city)}</cbc:CityName>` : ""}${exportTo.region ? `<cbc:CountrySubentity>${esc(exportTo.region)}</cbc:CountrySubentity>` : ""}`
      + `<cac:Country><cbc:IdentificationCode>${esc(exportTo.countryCode)}</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation>`);
    if (d.incoterms) X.push(`${t(2)}<cac:DeliveryTerms><cbc:ID schemeID="Incoterms">${esc(d.incoterms)}</cbc:ID></cac:DeliveryTerms>`);
    X.push(`${t(1)}</cac:Delivery>`);
  }
  if (d.paymentMeansCode) {
    X.push(`${t(1)}<cac:PaymentMeans>`, `${t(2)}<cbc:PaymentMeansCode name="${esc(PAYMENT_MEANS[d.paymentMeansCode] ?? "Payment")}">${esc(d.paymentMeansCode)}</cbc:PaymentMeansCode>`);
    if (d.seller.iban && ["30", "42", "58"].includes(d.paymentMeansCode)) {
      X.push(`${t(2)}<cac:PayeeFinancialAccount><cbc:ID>${esc(d.seller.iban)}</cbc:ID>${d.seller.bankName ? `<cbc:Name>${esc(d.seller.bankName)}</cbc:Name>` : ""}</cac:PayeeFinancialAccount>`);
    }
    X.push(`${t(1)}</cac:PaymentMeans>`);
  }
  if (usd) X.push(`${t(1)}<cac:TaxExchangeRate><cbc:SourceCurrencyCode>${cur}</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>AED</cbc:TargetCurrencyCode><cbc:CalculationRate>${esc(d.fxRate)}</cbc:CalculationRate></cac:TaxExchangeRate>`);
  X.push(`${t(1)}<cac:TaxTotal>`, `${t(2)}<cbc:TaxAmount currencyID="${cur}">${amt(vat)}</cbc:TaxAmount>`);
  for (const g of groups.values()) {
    X.push(`${t(2)}<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${amt(g.taxable)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${amt(g.tax)}</cbc:TaxAmount><cac:TaxCategory>${taxCategory(g.code, g.rateBp, g.reason)}</cac:TaxCategory></cac:TaxSubtotal>`);
  }
  X.push(`${t(1)}</cac:TaxTotal>`);
  if (usd) X.push(`${t(1)}<cac:TaxTotal><cbc:TaxAmount currencyID="AED">${amt(vatAed)}</cbc:TaxAmount></cac:TaxTotal>`);
  X.push(`${t(1)}<cac:LegalMonetaryTotal>`, `${t(2)}<cbc:LineExtensionAmount currencyID="${cur}">${amt(net)}</cbc:LineExtensionAmount>`,
    `${t(2)}<cbc:TaxExclusiveAmount currencyID="${cur}">${amt(net)}</cbc:TaxExclusiveAmount>`, `${t(2)}<cbc:TaxInclusiveAmount currencyID="${cur}">${amt(net + vat)}</cbc:TaxInclusiveAmount>`,
    `${t(2)}<cbc:PayableAmount currencyID="${cur}">${amt(net + vat)}</cbc:PayableAmount>`, `${t(1)}</cac:LegalMonetaryTotal>`);
  for (const l of d.lines) {
    const p = price(l), cat = CATEGORY[l.taxCode];
    X.push(`${t(1)}<cac:${lineTag}>`, `${t(2)}<cbc:ID>${l.no}</cbc:ID>`, `${t(2)}<cbc:${qtyTag} unitCode="${esc(l.unitCode)}">${esc(l.quantity)}</cbc:${qtyTag}>`,
      `${t(2)}<cbc:LineExtensionAmount currencyID="${cur}">${amt(l.netFcy)}</cbc:LineExtensionAmount>`);
    if (usd) X.push(`${t(2)}<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${amt(l.vatFcy)}</cbc:TaxAmount></cac:TaxTotal>`);
    X.push(`${t(2)}<cac:Item>`, `${t(3)}<cbc:Description>${esc(l.description)}</cbc:Description>`, `${t(3)}<cbc:Name>${esc(l.name)}</cbc:Name>`);
    if (l.sacCode && l.itemType !== "G") X.push(`${t(3)}<cac:AdditionalItemIdentification><cbc:ID schemeID="SAC">${esc(l.sacCode)}</cbc:ID></cac:AdditionalItemIdentification>`);
    X.push(`${t(3)}<cac:CommodityClassification><cbc:CommodityCode>${l.itemType}</cbc:CommodityCode>${l.hsCode && l.itemType !== "S" ? `<cbc:ItemClassificationCode listID="HS">${esc(l.hsCode)}</cbc:ItemClassificationCode>` : ""}</cac:CommodityClassification>`);
    X.push(`${t(3)}<cac:ClassifiedTaxCategory>${taxCategory(l.taxCode, l.rateBp, l.exemptionReason)}</cac:ClassifiedTaxCategory>`, `${t(2)}</cac:Item>`);
    X.push(`${t(2)}<cac:Price><cbc:PriceAmount currencyID="${cur}">${amt(p.amount)}</cbc:PriceAmount><cbc:BaseQuantity unitCode="${esc(l.unitCode)}">${esc(p.base)}</cbc:BaseQuantity>`
      + `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="${cur}">0.00</cbc:Amount><cbc:BaseAmount currencyID="${cur}">${amt(p.amount)}</cbc:BaseAmount></cac:AllowanceCharge></cac:Price>`);
    X.push(`${t(2)}<cac:ItemPriceExtension><cbc:Amount currencyID="${cur}">${amt(l.netFcy + l.vatFcy)}</cbc:Amount>`
      + (cat === "E" ? "" : `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${amt(l.vatFcy)}</cbc:TaxAmount></cac:TaxTotal>`) + `</cac:ItemPriceExtension>`);
    X.push(`${t(1)}</cac:${lineTag}>`);
  }
  X.push(`</${root}>`);
  return X.join("\n") + "\n";
}
