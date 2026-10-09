/**
 * Posting engine core: journal validation, AED conversion, reversal, and a sample
 * posting rule (sales invoice). Pure domain logic — persistence lives in apps/api.
 * Amounts are integer fils. FX rates are decimals with up to 6 dp.
 */
export type Fils = number;
export type JournalStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED" | "REVERSED";

export interface JournalLineInput {
  accountCode: string;
  debit: Fils;   // transaction currency
  credit: Fils;
  taxCode?: string;
  emirate?: string;
  ctTag?: string;
  memo?: string;
}

export interface JournalInput {
  date: string;              // yyyy-mm-dd
  description: string;
  currency: string;          // ISO 4217
  fxRate: number;            // AED per 1 unit of currency (1 for AED)
  lines: JournalLineInput[];
  preparedBy: string;
}

export interface PostedLine extends JournalLineInput { debitAed: Fils; creditAed: Fils }

export class LedgerError extends Error {}

export interface PeriodGuard { isLocked(date: string): boolean }

/** Validate a journal and compute AED amounts. Throws LedgerError on any breach. */
export function prepareJournal(j: JournalInput, periods: PeriodGuard): PostedLine[] {
  if (j.lines.length < 2) throw new LedgerError("A journal needs at least two lines.");
  if (periods.isLocked(j.date)) throw new LedgerError(`Period for ${j.date} is locked.`);
  if (!(j.fxRate > 0)) throw new LedgerError("FX rate must be positive.");
  if (j.currency === "AED" && j.fxRate !== 1) throw new LedgerError("AED journals must use fxRate 1.");

  let dr = 0, cr = 0;
  for (const [i, l] of j.lines.entries()) {
    for (const v of [l.debit, l.credit]) {
      if (!Number.isInteger(v) || v < 0) throw new LedgerError(`Line ${i + 1}: amounts must be non-negative integer fils.`);
    }
    if (l.debit > 0 && l.credit > 0) throw new LedgerError(`Line ${i + 1}: a line cannot carry both debit and credit.`);
    if (l.debit === 0 && l.credit === 0) throw new LedgerError(`Line ${i + 1}: zero line.`);
    dr += l.debit; cr += l.credit;
  }
  if (dr !== cr) throw new LedgerError(`Journal does not balance: debits ${dr} ≠ credits ${cr} (fils).`);

  // AED conversion with largest-remainder correction so AED also balances exactly.
  const out: PostedLine[] = j.lines.map((l) => ({
    ...l,
    debitAed: Math.round(l.debit * j.fxRate),
    creditAed: Math.round(l.credit * j.fxRate),
  }));
  const diff = out.reduce((a, l) => a + l.debitAed - l.creditAed, 0);
  if (diff !== 0) {
    // put the rounding difference on the largest line of the heavier side
    const side: "debitAed" | "creditAed" = diff > 0 ? "debitAed" : "creditAed";
    const target = out.reduce((best, l) => (l[side] > best[side] ? l : best));
    target[side] -= Math.abs(diff);
  }
  return out;
}

/** Build the reversing journal for a posted journal (posted journals are never edited). */
export function reverse(j: JournalInput, reversalDate: string, preparedBy: string): JournalInput {
  return {
    ...j,
    date: reversalDate,
    description: `Reversal: ${j.description}`,
    preparedBy,
    lines: j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

/** Maker-checker rule. */
export function assertCanApprove(preparedBy: string, approver: string): void {
  if (preparedBy === approver) throw new LedgerError("Preparer cannot approve their own entry.");
}

// ── Sample posting rule: sales invoice ─────────────────────────────────────
export interface InvoiceLine { revenueAccount: string; net: Fils; vat: Fils; taxCode: string; emirate?: string }

export function postSalesInvoice(inv: {
  date: string; number: string; currency: string; fxRate: number; lines: InvoiceLine[]; preparedBy: string;
}): JournalInput {
  const gross = inv.lines.reduce((a, l) => a + l.net + l.vat, 0);
  const vat = inv.lines.reduce((a, l) => a + l.vat, 0);
  const lines: JournalLineInput[] = [{ accountCode: "1100", debit: gross, credit: 0, memo: `Invoice ${inv.number}` }];
  for (const l of inv.lines) lines.push({ accountCode: l.revenueAccount, debit: 0, credit: l.net, taxCode: l.taxCode, emirate: l.emirate });
  if (vat) lines.push({ accountCode: "2100", debit: 0, credit: vat, taxCode: "SR" });
  return { date: inv.date, description: `Sales invoice ${inv.number}`, currency: inv.currency, fxRate: inv.fxRate, lines, preparedBy: inv.preparedBy };
}
