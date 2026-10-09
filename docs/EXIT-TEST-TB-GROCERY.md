# Exit test — trial balance, Jan–Feb 2026 (D-56)

Fictitious data set supplied by Faizan (grocery shop, `docs/exit-test/`). Counts as the Phase 2 exit test (D-56).
Card (POS) settlements are treated as **sales including VAT** (D-56). Expected figures were worked out independently
of the app from the data set's sheets; they agree with its own control totals (bank book 21,790.00, AR/AP nil).

Files: `1-contacts.xlsx` · `2-opening-documents.xlsx` · `3-bank-statement-jan-feb-2026.csv`.

## A. Set up — Firm Admin
1. **Add client** "Pilot Grocery LLC": Dubai, VAT registered (TRN 100000000000003), quarterly, first VAT period ends
   **31 Mar 2026**, financial year Jan–Dec, **books start 1 Dec 2025**.
2. **Chart of accounts → add:** `3100 Owner's drawings` (equity) · `6210 Insurance` (expense) · `6220 Repairs and maintenance` (expense).
3. **Bank → add bank accounts:** "Current account" linked to **1010**; "Petty cash" (new — the app gives it code **1011**).
4. **Customers & suppliers → Import from Excel:** `1-contacts.xlsx` (8 customers, 11 suppliers).

## B. Opening balances at 31 Dec 2025
1. **Journals → Opening balances**, dated **31 Dec 2025** (a second Firm Admin approves):

| Account | Debit | Credit |
|---|---|---|
| 1011 Bank - Petty cash | 5,000.00 | |
| 1010 Bank - current account | 48,350.00 | |
| 3999 Opening balance clearing (receivables) | 23,047.50 | |
| 1200 Inventory | 62,000.00 | |
| 1150 Prepayments and deposits | 3,000.00 | |
| 1500 Property, plant and equipment | 50,000.00 | |
| 1510 PPE - accumulated depreciation | | 15,000.00 |
| 3999 Opening balance clearing (payables) | | 25,546.50 |
| 2120 VAT payable to FTA (Q4 2025) | | 2,950.00 |
| 2010 Accruals (Dec utilities) | | 1,250.00 |
| 3000 Share capital (owner's capital) | | 100,000.00 |
| 3200 Retained earnings | | 46,651.00 |
| **Total** | **191,397.50** | **191,397.50** |

2. **Opening balances → Import from Excel:** `2-opening-documents.xlsx` (5 customer invoices 23,047.50; 4 supplier bills 25,546.50).
3. Second Firm Admin: **Post 9 opening documents** dated **31 Dec 2025**. Check **3999 = 0.00 ✓**.

## C. January–February 2026 (every document approved by a second person)
**Sales invoices** (prices before VAT, 4000, SR): INV-26-0003 Al Reef 04/01 3,900 · INV-26-0006 Gulf Star 07/01 9,600 ·
INV-26-0009 Sunrise 11/01 7,250 · INV-26-0012 Madina 14/01 2,760 · INV-26-0015 Green Leaf 18/01 4,480 ·
INV-26-0018 Bin Hamad 22/01 5,950 · INV-26-0021 Noor Al Sham 25/01 1,840. Put the number in *Customer reference*.

**Card sales** — customer *Card customers*, **tick Prices include VAT**, one line, 4000; then a receipt into the current account the same day:

| Date | Paid in | App VAT | Before VAT |
|---|---|---|---|
| 08/01 | 6,840.00 | 325.71 | 6,514.29 |
| 22/01 | 7,215.00 | 343.57 | 6,871.43 |
| 05/02 | 6,930.00 | 330.00 | 6,600.00 |
| 19/02 | 7,480.00 | 356.19 | 7,123.81 |
| 26/02 | 6,125.00 | 291.67 | 5,833.33 |

**Supplier bills** (before VAT, SR, tick "full tax invoice"): EWF-88544 03/01 12,300 · ASB-4466 08/01 5,400 · PHC-1187 12/01 3,150 ·
GFP-3141 16/01 4,300 · DP-20794 20/01 2,260 · EWF-88790 24/01 9,800 (all 5000) · AMS-0562 27/01 1,150 (6180).

**Expense bills** (before VAT, SR) — then pay each in full on the same day:

| Date | Supplier | Account | Before VAT | VAT | Paid from |
|---|---|---|---|---|---|
| 02/01 | Shop Landlord — rent Jan | 6100 | 8,000.00 | 400.00 | Current a/c, chq 000205 |
| 10/01 | DEWA — Dec bill | 6110 | 1,250.00 | 62.50 | Current a/c |
| 12/01 | e& Telecom | 6110 | 300.00 | 15.00 | Current a/c |
| 22/01 | Shop Insurer | 6210 | 2,000.00 | 100.00 | Current a/c |
| 01/02 | Shop Landlord — rent Feb | 6100 | 8,000.00 | 400.00 | Current a/c, chq 000210 |
| 10/02 | DEWA — Jan bill | 6110 | 1,100.00 | 55.00 | Current a/c |
| 12/02 | e& Telecom | 6110 | 300.00 | 15.00 | Current a/c |
| 20/02 | Cool Fix Repairs — fridge | 6220 | 1,200.00 | 60.00 | **Petty cash** |

**Journal** 10/01: Dr 2010 Accruals 1,250.00 / Cr 6110 Utilities 1,250.00 — "Release Dec utilities accrual (DEWA Dec bill)".

**Receipts and payments** (one per document, in full) — dates and accounts from the data set's *Receipts and Payments* sheet.
Cash ones go to **Petty cash**: RCT-004 Noor Al Sham 2,604.00 (15/01) · RCT-009 Madina 2,898.00 (12/02) · PMT-007 Pure Home 3,307.50 (09/02).
Cheques: use the **book date** (RCT-012 26/02, PMT-010 23/02 — not yet on the statement).

## D. Bank (current account)
1. **Upload** `3-bank-statement-jan-feb-2026.csv` (map once: date = Transaction date, yyyy-mm-dd; Debit / Credit; Balance).
2. **Auto-match**, then match by hand what is left — e.g. cheque 000207 Delta Packaging (booked 14/01, cleared 20/01: 6 days > 5-day window).
3. **Post from the bank line** (account only, no VAT): DED licence 4,800 → 6120 · owner 5,000 and 4,000 → 3100 ·
   FTA VAT 2,950 → 2120 · WPS salaries 7,500 ×2 → 6000.
4. **Leave unposted** (answer key): cheque-book charge 35, maintenance fees 50 + 50, unidentified deposit 1,500.
5. **Reconcile to 28 Feb 2026**, statement balance **27,197.50** → difference **0.00**, then approve. Expected items:

| Side | Item | Amount |
|---|---|---|
| Book, not on statement | Cheque 000431 Bin Hamad (deposit in transit) | +6,247.50 |
| Book, not on statement | Cheque 000212 Emirates Wholesale (outstanding) | −10,290.00 |
| Statement, not in books | Bank charges 35 + 50 + 50 | −135.00 |
| Statement, not in books | Unidentified deposit ref 7712 | +1,500.00 |
| | Book balance 21,790.00 → statement 27,197.50 | ✓ |

## E. Expected trial balance at 28 Feb 2026 (Reports → Trial balance, 1 Jan – 28 Feb 2026)
| Account | Debit | Credit |
|---|---|---|
| 1010 Bank - current account | 21,790.00 | |
| 1011 Bank - Petty cash | 5,934.50 | |
| 1150 Prepayments and deposits | 3,000.00 | |
| 1200 Inventory | 62,000.00 | |
| 1300 VAT input (recoverable) | 3,025.50 | |
| 1500 Property, plant and equipment | 50,000.00 | |
| 1510 PPE - accumulated depreciation | | 15,000.00 |
| 2100 VAT output | | 3,436.14 |
| 3000 Share capital | | 100,000.00 |
| 3100 Owner's drawings | 9,000.00 | |
| 3200 Retained earnings | | 46,651.00 |
| 4000 Revenue - sale of goods | | 68,722.86 |
| 5000 Cost of goods sold | 37,210.00 | |
| 6000 Salaries and wages | 15,000.00 | |
| 6100 Rent | 16,000.00 | |
| 6110 Utilities and telecom | 1,700.00 | |
| 6120 Licences, visas and government fees | 4,800.00 | |
| 6180 Office supplies and IT | 1,150.00 | |
| 6210 Insurance | 2,000.00 | |
| 6220 Repairs and maintenance | 1,200.00 | |
| **Total** | **233,810.00** | **233,810.00** |

Zero: 1100 receivables, 2000 payables, 2010 accruals, 2120 VAT payable, 3999 clearing.
Also: ageing reports empty (everything settled) · bank reconciliation approved · **Integrity → Run now: no problems**.
