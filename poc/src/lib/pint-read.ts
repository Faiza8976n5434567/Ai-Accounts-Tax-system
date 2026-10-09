/** P4-08 · Reads a received PINT AE e-invoice or credit note (UBL 2.1) into the data a purchase bill needs, checks what
 *  matters to us (addressed to this client's TRN, totals add up, supplier TRN valid) and builds the draft bill. The
 *  sender's ASP has already validated the file against the official rules before delivery. Pure: works on any DOM
 *  Document (the browser's DOMParser in the app, @xmldom in tests). Amounts become integer minor units (half-up). */
export const NS = {
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
};
type El = Element;

export interface PintReadLine { no: string; name: string; description: string; quantity: string; unitCode: string; net: number; vat: number | null; category: string; ratePct: string | null; itemType: string | null; hsCode: string | null; sacCode: string | null }
export interface PintRead {
  kind: "invoice" | "creditnote"; number: string; uuid: string; issueDate: string; dueDate: string | null; currency: string; transactionType: string;
  supplier: { name: string; trn: string | null; countryCode: string | null; emirate: string | null; city: string | null; addressLine1: string | null; regId: string | null };
  buyer: { name: string; trn: string | null };
  lines: PintReadLine[]; totals: { net: number; vat: number; payable: number }; preceding: { number: string; date: string | null } | null; creditReason: string | null;
}

/** "532.1645" → 53216 (half-up to 2 decimals), without floating point. */
export function toMinor(text: string | null | undefined): number {
  const m = (text ?? "").trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return NaN;
  const frac = (m[3] ?? "").padEnd(3, "0");
  let v = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) v += 1n;
  return Number(m[1] ? -v : v);
}

const kids = (el: El | Document | null, ns: "cbc" | "cac", name: string): El[] =>
  el ? Array.from((el as El).childNodes ?? []).filter((n): n is El => n.nodeType === 1 && (n as El).localName === name && (n as El).namespaceURI === NS[ns]) : [];
const kid = (el: El | null, ns: "cbc" | "cac", name: string): El | null => kids(el, ns, name)[0] ?? null;
const text = (el: El | null) => (el?.textContent ?? "").trim() || null;
const path = (el: El | null, ...steps: string[]): El | null => steps.reduce<El | null>((e, s) => { const [ns, n] = s.split(":") as ["cbc" | "cac", string]; return kid(e, ns, n); }, el);

export function readPint(doc: Document): PintRead {
  const root = doc.documentElement;
  const kind = root.localName === "CreditNote" ? "creditnote" : root.localName === "Invoice" ? "invoice" : null;
  if (!kind) throw new Error("This is not a PINT AE invoice or credit note (UBL Invoice / CreditNote).");
  const sup = path(root, "cac:AccountingSupplierParty", "cac:Party"), buy = path(root, "cac:AccountingCustomerParty", "cac:Party");
  const vatId = (p: El | null) => text(kids(p, "cac", "PartyTaxScheme").map((t) => kid(t, "cbc", "CompanyID")).find(Boolean) ?? null);
  const lineTag = kind === "creditnote" ? "CreditNoteLine" : "InvoiceLine", qtyTag = kind === "creditnote" ? "CreditedQuantity" : "InvoicedQuantity";
  const lines = kids(root, "cac", lineTag).map((l) => {
    const item = kid(l, "cac", "Item"), cat = kid(item, "cac", "ClassifiedTaxCategory"), qty = kid(l, "cbc", qtyTag);
    const vatText = text(path(l, "cac:ItemPriceExtension", "cac:TaxTotal", "cbc:TaxAmount")) ?? text(path(l, "cac:TaxTotal", "cbc:TaxAmount"));
    return {
      no: text(kid(l, "cbc", "ID")) ?? "", name: text(kid(item, "cbc", "Name")) ?? "", description: text(kid(item, "cbc", "Description")) ?? text(kid(item, "cbc", "Name")) ?? "",
      quantity: text(qty) ?? "1", unitCode: qty?.getAttribute("unitCode") ?? "C62", net: toMinor(text(kid(l, "cbc", "LineExtensionAmount"))),
      vat: vatText === null ? null : toMinor(vatText), category: text(kid(cat, "cbc", "ID")) ?? "", ratePct: text(kid(cat, "cbc", "Percent")),
      itemType: text(path(item, "cac:CommodityClassification", "cbc:CommodityCode")), hsCode: text(path(item, "cac:CommodityClassification", "cbc:ItemClassificationCode")),
      sacCode: text(path(item, "cac:AdditionalItemIdentification", "cbc:ID")),
    };
  });
  const totals = kid(root, "cac", "LegalMonetaryTotal");
  const currency = text(kid(root, "cbc", "DocumentCurrencyCode")) ?? "";
  const taxTotal = kids(root, "cac", "TaxTotal").find((t) => kid(t, "cbc", "TaxAmount")?.getAttribute("currencyID") === currency) ?? kid(root, "cac", "TaxTotal");
  const addr = kid(sup, "cac", "PostalAddress"), ref = path(root, "cac:BillingReference", "cac:InvoiceDocumentReference");
  return {
    kind, number: text(kid(root, "cbc", "ID")) ?? "", uuid: text(kid(root, "cbc", "UUID")) ?? "", issueDate: text(kid(root, "cbc", "IssueDate")) ?? "",
    dueDate: text(kid(root, "cbc", "DueDate")) ?? text(path(root, "cac:PaymentMeans", "cbc:PaymentDueDate")), currency,
    transactionType: text(kid(root, "cbc", "ProfileExecutionID")) ?? "00000000",
    supplier: {
      name: text(path(sup, "cac:PartyLegalEntity", "cbc:RegistrationName")) ?? text(path(sup, "cac:PartyName", "cbc:Name")) ?? "", trn: vatId(sup),
      countryCode: text(path(addr, "cac:Country", "cbc:IdentificationCode")), emirate: text(kid(addr, "cbc", "CountrySubentity")), city: text(kid(addr, "cbc", "CityName")),
      addressLine1: text(kid(addr, "cbc", "StreetName")), regId: text(path(sup, "cac:PartyLegalEntity", "cbc:CompanyID")),
    },
    buyer: { name: text(path(buy, "cac:PartyLegalEntity", "cbc:RegistrationName")) ?? "", trn: vatId(buy) },
    lines, totals: { net: toMinor(text(kid(totals, "cbc", "TaxExclusiveAmount"))), vat: toMinor(text(kid(taxTotal, "cbc", "TaxAmount"))), payable: toMinor(text(kid(totals, "cbc", "PayableAmount"))) },
    preceding: ref ? { number: text(kid(ref, "cbc", "ID")) ?? "", date: text(kid(ref, "cbc", "IssueDate")) } : null,
    creditReason: text(path(root, "cac:DiscrepancyResponse", "cbc:ResponseCode")),
  };
}

/** Our purchase tax code for a PINT AE tax category (the preparer may change it before importing). */
export const PURCHASE_CODE: Record<string, string> = { S: "SR", Z: "ZR", E: "EX", O: "OS", AE: "RCS" };

/** Errors stop the import; warnings are shown for the preparer to review. */
export function inboundChecks(r: PintRead, clientTrn: string | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!r.uuid || !/^[0-9a-f-]{36}$/i.test(r.uuid)) errors.push("The file has no valid unique identifier (UUID).");
  if (!r.number) errors.push("The file has no document number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.issueDate)) errors.push("The file has no valid issue date.");
  if (r.buyer.trn !== clientTrn) errors.push(`This e-invoice is addressed to TRN ${r.buyer.trn ?? "(none)"} — not to this client (${clientTrn ?? "no TRN"}).`);
  if (!["AED", "USD"].includes(r.currency)) errors.push(`Currency ${r.currency} is not supported (AED and USD only).`);
  if (r.lines.length === 0) errors.push("The file has no lines.");
  if (r.lines.some((l) => Number.isNaN(l.net)) || [r.totals.net, r.totals.vat, r.totals.payable].some(Number.isNaN)) errors.push("Some amounts in the file could not be read.");
  if (r.kind === "creditnote" && !r.preceding) errors.push("This credit note does not name the original invoice — record it as a debit note by hand.");
  if (r.supplier.trn && !/^1\d{12}03$/.test(r.supplier.trn)) warnings.push(`The supplier's TRN ${r.supplier.trn} does not look valid (15 digits, starting 1, ending 03).`);
  if (!r.supplier.trn) warnings.push("The supplier has no TRN on the file — input VAT may not be recoverable.");
  const sumNet = r.lines.reduce((s, l) => s + l.net, 0);
  if (!Number.isNaN(sumNet) && sumNet !== r.totals.net) warnings.push("The lines do not add up to the total before VAT (document-level allowances or charges?) — check the bill.");
  if (r.totals.payable !== r.totals.net + r.totals.vat) warnings.push("Payable ≠ total before VAT + VAT on the file (prepaid or rounding amounts?) — check the bill.");
  if (r.lines.some((l) => !PURCHASE_CODE[l.category])) warnings.push("A line has a tax category we do not map — choose its tax code.");
  return { errors, warnings };
}

/** The save_purchase_bill document (one bill line per e-invoice line, quantity 1 at the line's net amount so the amounts match exactly). */
export function toPurchaseDoc(r: PintRead, supplierId: string, lines: { accountId: string; taxCode: string }[], originalBillId?: string | null) {
  return {
    ...(r.kind === "creditnote" ? { doc_type: "debit_note", original_bill_id: originalBillId ?? null } : {}),
    contact_id: supplierId, supplier_invoice_no: r.number, bill_date: r.issueDate, due_date: r.kind === "invoice" ? r.dueDate : null, currency: r.currency,
    supplier_trn_on_invoice: r.supplier.trn, notes: `Received e-invoice ${r.uuid}`,
    lines: r.lines.map((l, i) => ({
      description: [l.name, l.description !== l.name ? l.description : "", Number(l.quantity) !== 1 ? `(${l.quantity} ${l.unitCode})` : ""].filter(Boolean).join(" — "),
      quantity: "1", unit_price: l.net, account_id: lines[i].accountId, tax_code: lines[i].taxCode,
    })),
  };
}
