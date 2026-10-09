/** P4-05 / P4-06 · "E-invoice ready?" — what a posted sales invoice or credit note still needs for PINT AE 1.0.4, in plain
 *  words, and the conversion of the document into the PINT AE builder's input. The official rules (api/_pint.ts) make
 *  the final check; this list catches the usual gaps before that. D-59: consumers (B2C) are not in scope. */
import type { Client } from "./clients";
import type { Contact } from "./contacts";
import type { InvoiceWithLines } from "./invoices";
import { buildPint, tinOf, type PintDoc, type PintTaxCode } from "./pint";

export type Readiness = { status: "ready" | "not_in_scope" | "missing"; problems: string[] };

export function einvoiceReadiness(inv: InvoiceWithLines, client: Client, customer: Contact | undefined): Readiness {
  if (!customer) return { status: "missing", problems: ["The customer could not be found."] };
  if (customer.customer_type === "consumer") return { status: "not_in_scope", problems: ["Consumer (B2C) — not e-invoiced for now (D-59)."] };
  const p: string[] = [];
  const cn = inv.doc_type === "credit_note";
  if (inv.status !== "posted" || !inv.invoice_no) p.push(`Approve the ${cn ? "credit note" : "invoice"} first — it gets its number then.`);
  // Seller (the client)
  if (!tinOf(client.trn)) p.push("Client: the TRN is missing (its first 10 digits are the Peppol address).");
  if (!client.address_line1 || !client.city) p.push("Client: add address line 1 and city (Edit details → E-invoicing).");
  if (!client.licence_no) p.push("Client: add the trade licence number (Edit details).");
  if (client.licence_no && !client.licence_authority) p.push("Client: add the licensing authority (Edit details).");
  // Buyer
  const foreign = customer.country_code !== "AE";
  if (!customer.address_line1 || !customer.city) p.push(`Customer ${customer.name}: add address line 1 and city (E-invoicing details).`);
  if (!foreign && !customer.emirate_code) p.push(`Customer ${customer.name}: choose the emirate.`);
  if (foreign && !customer.region) p.push(`Customer ${customer.name}: add the state / province / region.`);
  if (customer.reg_id && !customer.reg_type) p.push(`Customer ${customer.name}: choose the registration type for the registration number.`);
  if (!foreign && !customer.trn && !customer.reg_id && !customer.peppol_id) p.push(`Customer ${customer.name}: add the TRN or a registration number (licence / Emirates ID).`);
  // Document
  if (!cn) {
    if (!inv.payment_means_code) p.push("Choose the payment means (E-invoicing section of the invoice).");
    if (["30", "42"].includes(inv.payment_means_code ?? "") && !client.iban) p.push("Client: add the IBAN for bank payments (Edit details → E-invoicing).");
  } else if (!inv.credit_reason_code) p.push("Choose the credit note reason (E-invoicing section).");
  if (inv.transaction_type[7] === "1") {
    if (!inv.incoterms) p.push("Exports need Incoterms (e.g. CIF) on the invoice.");
    if (!foreign) p.push("An export must be to a customer outside the UAE.");
  }
  inv.lines.forEach((l) => {
    const n = `Line ${l.line_no}`;
    if (!l.item_type) p.push(`${n}: pick an item (goods / services with its HS or service code).`);
    if (l.item_type && l.item_type !== "S" && !l.hs_code) p.push(`${n}: the item needs an HS code.`);
    if (l.item_type && l.item_type !== "G" && !l.sac_code) p.push(`${n}: the item needs a service accounting code.`);
    if (l.tax_code === "EX" && !l.exemption_reason) p.push(`${n}: exempt lines need an exemption reason (set it on the item).`);
  });
  return { status: p.length ? "missing" : "ready", problems: p };
}

/** The document as the PINT AE builder's input. `rateBp` = the standard rate on the invoice date; `original` = the invoice a credit note credits. */
export function toPintDoc(inv: InvoiceWithLines, client: Client, customer: Contact, rateBp: number, original?: InvoiceWithLines): PintDoc {
  const cur = inv.currency === "USD" ? "USD" : "AED";
  return {
    kind: inv.doc_type === "credit_note" ? "creditnote" : "invoice", number: inv.invoice_no ?? "", uuid: inv.einv_uuid, issueDate: inv.issue_date,
    dueDate: inv.doc_type === "credit_note" ? null : inv.due_date, currency: cur, fxRate: String(Number(inv.fx_rate)),
    transactionType: inv.transaction_type, paymentMeansCode: inv.doc_type === "credit_note" ? null : inv.payment_means_code,
    creditReasonCode: inv.credit_reason_code, preceding: original?.invoice_no ? { number: original.invoice_no, date: original.issue_date } : null,
    incoterms: inv.incoterms, buyerReference: inv.customer_reference,
    seller: {
      name: client.legal_name, tradeName: client.trade_name, trn: client.trn, countryCode: "AE", emirate: client.emirate_code,
      addressLine1: client.address_line1, addressLine2: client.address_line2, city: client.city,
      regType: client.reg_type, regId: client.licence_no, regAuthority: client.licence_authority, iban: client.iban, bankName: client.bank_name,
    },
    buyer: {
      name: customer.name, trn: customer.trn, countryCode: customer.country_code, emirate: customer.emirate_code, region: customer.region,
      addressLine1: customer.address_line1, city: customer.city, regType: customer.reg_type, regId: customer.reg_id, regAuthority: customer.reg_authority,
      passportCountry: customer.passport_country, peppolScheme: customer.peppol_scheme, peppolId: customer.peppol_id, notOnboarded: customer.einv_not_onboarded,
    },
    lines: inv.lines.map((l) => ({
      no: l.line_no, name: l.description, description: l.description, quantity: String(Number(l.quantity)), unitCode: l.unit_code ?? "C62",
      unitPrice: l.unit_price, netFcy: l.net_fcy, vatFcy: l.vat_fcy, netAed: l.net, vatAed: l.vat, taxCode: l.tax_code as PintTaxCode,
      rateBp: l.tax_code === "SR" ? rateBp : 0, itemType: (l.item_type ?? "S") as "G" | "S" | "B", hsCode: l.hs_code, sacCode: l.sac_code,
      exemptionReason: l.exemption_reason, pricesIncludeVat: inv.prices_include_vat,
    })),
  };
}

/** Downloads the PINT AE file of a document. */
export function downloadEinvoice(doc: PintDoc) {
  const url = URL.createObjectURL(new Blob([buildPint(doc)], { type: "application/xml" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${doc.number || "draft"}_PINT-AE.xml` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
