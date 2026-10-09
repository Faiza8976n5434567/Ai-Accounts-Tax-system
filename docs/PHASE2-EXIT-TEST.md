# Phase 2 exit test — re-key one real quarter (PLAN.md Phase 2 exit)

**Goal:** one pilot client's real past quarter is re-keyed and the trial balance agrees with the old system **to the fils**.
Names are anonymised (D-53); every amount and date is real. Opening balances follow D-52.

## A. Prepare (from the old system) — before we start
| # | What | Notes |
|---|---|---|
| 1 | Choose the client and **one past quarter** (e.g. Jul–Sep 2026) | Simple books, mostly AED, ideally < 100 documents |
| 2 | **Trial balance at the cut-off** = the last day *before* the quarter (e.g. 30 Jun 2026) | Every account with its debit/credit balance |
| 3 | **Unpaid sales invoices** at the cut-off | Customer, invoice number, date, due date, **amount still open** (incl. VAT) |
| 4 | **Unpaid supplier bills** at the cut-off | Supplier, bill number, date, due date, amount still open |
| 5 | **Customers & suppliers** list | Name (anonymise: Customer A, B…), TRN (dummy 100000000000003 style), country |
| 6 | All **documents of the quarter** | Sales invoices, credit notes, supplier bills, debit notes |
| 7 | **Receipts and payments** of the quarter, and the **bank statement(s)** | CSV/Excel from the bank if possible |
| 8 | **Trial balance at the end of the quarter** (e.g. 30 Sep 2026) | The figure we must match |
| 9 | (Bonus) The **VAT return** filed for that quarter | Boxes to compare with ours |

## B. Set up the client in the app
1. **Add client** "Pilot Co LLC" (anonymised): VAT details as on its certificate, financial year start, and
   **Books start = the first day of the month of the cut-off** (e.g. 1 Jun 2026 for a 30 Jun cut-off).
2. **Customers & suppliers → Import from Excel** (the anonymised list).
3. **Chart of accounts:** add any account the old trial balance has that ours doesn't (Firm Admin).

## C. Opening balances (cut-off date, e.g. 30 Jun 2026)
1. **Journals → Opening balances**, dated the cut-off: every trial-balance line on its account, **except**
   receivables and payables, which go on **3999 Opening balance clearing**. A second Firm Admin approves it.
2. **Opening balances → Import from Excel** (template provided) or **Add one**: each unpaid invoice and bill.
3. A second Firm Admin clicks **Post … opening document(s)** with the cut-off date.
4. Check: **3999 shows 0.00 ✓** and **Reports → Trial balance at the cut-off = the old trial balance**.

## D. Re-key the quarter
Sales invoices and credit notes → purchase bills and debit notes → receipts and payments (settling the old and new
documents) → bank statement upload, matching and reconciliation → any manual journals (accruals, depreciation…).
Every document is approved by a second person.

## E. Compare
| Check | Pass when |
|---|---|
| **Trial balance at the quarter end** | Every account equals the old system's, to the fils |
| Receivables / payables ageing | Totals equal 1100 / 2000 |
| Bank reconciliation | Difference 0.00, approved |
| Integrity → Run now | No problems |
| (Bonus) VAT return of the quarter | Boxes equal the filed return (differences explained) |

Differences are investigated together: each one is either a keying slip (fix and re-check) or a real
difference in the app (Claude fixes it and adds a test). When everything agrees, Faizan approves Phase 2.
