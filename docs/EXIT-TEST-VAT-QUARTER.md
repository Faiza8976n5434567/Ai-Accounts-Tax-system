# Exit test — VAT quarter Nov 2025 – Jan 2026 (D-55)

Anonymised (D-53): real amounts, dates and document numbers; names and TRNs replaced.
Source: the client's scanned sales invoices (19), supplier invoices (4) and VAT workings.

## 1. Set up the client
| Field | Enter |
|---|---|
| Name | **Pilot Retail LLC** |
| Emirate | Dubai |
| VAT registered | Yes — dummy TRN **100000000000003** |
| VAT period | Quarterly, **first period ends 31 Jan 2026** (quarters end Jan / Apr / Jul / Oct) |
| Books start | **1 Nov 2025** (no opening balances needed for a VAT-only test) |

Contacts: **Walk-in customer** (customer, no TRN) · **Supplier A** (supplier, Dubai, TRN 100000000000103) ·
**Supplier B** (supplier, Sharjah, TRN 100000000000203).

## 2. Sales invoices — tick **Prices include VAT**, one line "Sales", account 4000, Standard 5%, emirate Dubai
Customer = Walk-in customer. Unit price = **the total the customer paid**. Put the shop's number in *Customer reference*.

| # | Shop no. | Date | Paid (incl. VAT) | App will show VAT | Before VAT |
|---|---|---|---|---|---|
| 1 | 0976 | 02/11/2025 | 60.00 | 2.86 | 57.14 |
| 2 | 0977 | 05/11/2025 | 45.00 | 2.14 | 42.86 |
| 3 | 0978 | 09/11/2025 | 105.00 | 5.00 | 100.00 |
| 4 | 0979 | 15/11/2025 | 75.00 | 3.57 | 71.43 |
| 5 | 0980 | 15/11/2025 | 300.00 | 14.29 | 285.71 |
| 6 | 0981 | 24/11/2025 | 150.00 | 7.14 | 142.86 |
| 7 | 0982 | 30/11/2025 | 195.00 | 9.29 | 185.71 |
| 8 | 0983 | 01/12/2025 | 124.00 | 5.90 | 118.10 |
| 9 | 0984 | 09/12/2025 | 164.00 | 7.81 | 156.19 |
| 10 | 0985 | 09/12/2025 | 100.00 | 4.76 | 95.24 |
| 11 | 0986 | 16/12/2025 | 74.00 | 3.52 | 70.48 |
| 12 | 0987 | 25/12/2025 | 160.00 | 7.62 | 152.38 |
| 13 | 0988 | 30/12/2025 | 170.00 | 8.10 | 161.90 |
| 14 | 0989 | 04/01/2026 | 205.00 | 9.76 | 195.24 |
| 15 | 0990 | 13/01/2026 | 205.00 | 9.76 | 195.24 |
| 16 | 0991 | 23/01/2026 | 104.00 | 4.95 | 99.05 |
| 17 | 0992 | 27/01/2026 | 70.00 | 3.33 | 66.67 |
| 18 | 0993 | 28/01/2026 | 175.00 | 8.33 | 166.67 |
| 19 | 0994 | 31/01/2026 | 114.00 | 5.43 | 108.57 |
| | | **Total** | **2,595.00** | **123.56** | **2,471.44** |

Why one line per invoice: VAT is rounded per line (principle 5). Keying the shop's separate item lines can move the
total by a few fils (e.g. 60.00 as 15.00 + 45.00 gives 0.71 + 2.14 = 2.85 instead of 2.86).

## 3. Supplier bills — prices before VAT, account 5000 Cost of goods sold, Standard 5%
| # | Supplier | Bill no. | Date | Before VAT | VAT | Total |
|---|---|---|---|---|---|---|
| 1 | Supplier B (Sharjah) | SIV-157569 *(workings: SIV-157)* | 10/11/2025 | 138.00 | 6.90 | 144.90 |
| 2 | Supplier A (Dubai) | INV-000337 | 18/11/2025 | 330.00 | 16.50 | 346.50 |
| 3 | Supplier B (Sharjah) | SIV-158757 | 10/12/2025 | 70.00 | 3.50 | 73.50 |
| 4 | Supplier A (Dubai) | INV-000358 | 16/12/2025 | 300.00 | 15.00 | 315.00 |
| | | | **Total** | **838.00** | **41.90** | **879.90** |

## 4. Expected VAT return (1 Nov 2025 – 31 Jan 2026)
| Box | Expected (app) | Filed by the shop |
|---|---|---|
| 1b Standard rated supplies — Dubai | 2,471.44 / **123.56** | 2,465.25 / 123.26 |
| 9 Standard rated expenses | 838.00 / **41.90** | 838.00 / 41.90 |
| 14 Payable | **81.66** | 81.36 |

Pass = the app shows exactly the "Expected" column, every figure drills down to the right invoice, and Integrity shows
no problems. The 0.30 difference from the filed return is explained (VAT written as 5% of the total, D-54) — the
correction for the client is Faizan's call.
