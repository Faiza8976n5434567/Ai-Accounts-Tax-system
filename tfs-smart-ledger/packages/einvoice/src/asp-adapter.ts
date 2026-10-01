/**
 * ASP-agnostic adapter layer for UAE e-invoicing (Peppol / PINT AE, DCTCE model).
 * One implementation per Accredited Service Provider. The organisation's chosen ASP is
 * stored on Organization.aspProvider and resolved through the registry below.
 */
export type EInvoiceStatus = "PENDING" | "VALIDATED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "FAILED";

export interface SendResult { aspMessageId: string; status: EInvoiceStatus; errors?: AspError[] }
export interface AspError { code: string; message: string; field?: string }

export interface InboundDocument {
  aspMessageId: string;
  receivedAt: string;
  senderPeppolId: string;
  ublXml: string;
}

export interface AspCredentials { clientId: string; secretRef: string; environment: "sandbox" | "production" }

export interface AspAdapter {
  readonly key: string;                 // e.g. "asp-alpha"
  readonly displayName: string;
  /** Register/confirm the organisation's participant (Peppol ID) with the ASP. */
  onboard(org: { trn: string; legalName: string; peppolId?: string }, creds: AspCredentials): Promise<{ peppolId: string }>;
  /** Transmit a PINT AE UBL document. Must be idempotent on idempotencyKey. */
  send(ublXml: string, idempotencyKey: string, creds: AspCredentials): Promise<SendResult>;
  /** Poll status when webhooks are unavailable. */
  status(aspMessageId: string, creds: AspCredentials): Promise<SendResult>;
  /** Fetch inbound invoices/credit notes addressed to the organisation. */
  fetchInbound(since: string, creds: AspCredentials): Promise<InboundDocument[]>;
  /** Verify and parse a webhook payload from the ASP. */
  parseWebhook(headers: Record<string, string>, body: string): { aspMessageId: string; status: EInvoiceStatus; errors?: AspError[] };
}

const registry = new Map<string, AspAdapter>();
export const registerAsp = (a: AspAdapter) => registry.set(a.key, a);
export function getAsp(key: string): AspAdapter {
  const a = registry.get(key);
  if (!a) throw new Error(`No ASP adapter registered for "${key}"`);
  return a;
}

/** In-memory adapter for tests and demos. Never enable in production. */
export class MockAsp implements AspAdapter {
  readonly key = "mock";
  readonly displayName = "Mock ASP (sandbox)";
  private sent = new Map<string, SendResult>();
  async onboard(org: { trn: string }) { return { peppolId: `0235:${org.trn}` }; } // scheme id: VERIFY
  async send(_xml: string, key: string) {
    const existing = this.sent.get(key);
    if (existing) return existing;
    const r: SendResult = { aspMessageId: `mock-${this.sent.size + 1}`, status: "SUBMITTED" };
    this.sent.set(key, r);
    return r;
  }
  async status(id: string) { return { aspMessageId: id, status: "ACCEPTED" as const }; }
  async fetchInbound() { return []; }
  parseWebhook(_h: Record<string, string>, body: string) { return JSON.parse(body); }
}
