import type { Fils } from "./money";

export type Role = "FIRM_PARTNER" | "FIRM_ACCOUNTANT" | "CLIENT_OWNER" | "CLIENT_FINANCE";
export type Emirate = "AUH" | "DXB" | "SHJ" | "AJM" | "UAQ" | "RAK" | "FUJ";
export type TaxCode = "SR" | "ZR" | "EX" | "OS" | "RCS" | "BLK";
export type CtRegime = "standard" | "sbr" | "qfzp";
export type AccType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface Account { code: string; nameEn: string; nameAr: string; type: AccType; ctTag?: string; group?: string }

export interface Org {
  id: string; name: string; nameAr: string; trn: string; emirate: Emirate; industry: string;
  regime: CtRegime; vatPeriod: "QUARTERLY" | "MONTHLY"; fyEnd: string; priorRevenue: Fils;
  licenceExpiry: string; color: string; assignedTo: string;
  autoApprove: { enabled: boolean; maxAmount: Fils; minConfidence: number };
}

export interface JLine {
  account: string; debit: Fils; credit: Fils; memo?: string;
  taxCode?: TaxCode; vat?: Fils; emirate?: Emirate; recoverable?: boolean;
}

export type JStatus = "DRAFT" | "PENDING" | "POSTED" | "REVERSED";
export interface Journal {
  id: string; orgId: string; date: string; ref: string; memo: string;
  source: "PURCHASE" | "SALE" | "MANUAL" | "BANK" | "OPENING" | "REVERSAL";
  status: JStatus; lines: JLine[]; preparedBy: string; approvedBy?: string; postedAt?: string;
  ai?: { confidence: number; reasoning: string }; docId?: string; reversalOf?: string;
  /** Customer (AR) or supplier (AP) — drives the sub-ledgers. */
  party?: string;
}

export interface Check { id: string; label: string; ok: boolean; severity: "error" | "warn" | "info"; detail?: string; dp?: Record<string, string> }

export interface PurchaseDoc {
  id: string; orgId: string; fileName?: string; supplier: string; supplierTrn: string; invNo: string;
  date: string; description: string; net: Fils; vat: Fils; total: Fils; currency: string;
  hasHeading: boolean; customerName: string; foreign?: boolean;
  account: string; taxCode: TaxCode; confidence: number; reasoning: string;
  checks: Check[]; risk: "Low" | "Medium" | "High"; riskScore: number;
  status: "REVIEW" | "PENDING" | "POSTED" | "REJECTED"; journalId?: string; createdAt: string; createdBy: string;
}

export interface SaleLine { desc: string; qty: number; price: Fils; taxCode: TaxCode; account: string }
export interface SalesInvoice {
  id: string; orgId: string; invNo: string; date: string; dueDate: string; customer: string; customerTrn: string;
  customerCountry: string; emirate: Emirate; lines: SaleLine[]; status: "DRAFT" | "POSTED" | "PAID";
  journalId?: string; einv: "NOT_SENT" | "VALIDATED" | "SENT" | "DELIVERED" | "REJECTED"; einvLog: string[];
}

export interface BankLine { id: string; orgId: string; date: string; desc: string; amount: Fils; journalId?: string; suggestion?: string }

export interface AuditEntry { id: string; ts: string; user: string; role: Role; orgId: string; action: string; detail: string; ai?: boolean }

export interface Session { role: Role; user: string; orgId: string | "FIRM"; lang: "en" | "ar" }

export interface AppState {
  orgs: Org[]; journals: Journal[]; purchases: PurchaseDoc[]; sales: SalesInvoice[];
  bank: BankLine[]; audit: AuditEntry[]; session: Session; seq: number;
}
