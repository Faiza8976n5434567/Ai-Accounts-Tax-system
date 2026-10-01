# Product Requirements — TFS+ Smart Ledger

Target users: UAE mainland and free-zone SMEs with revenue below AED 20m (primary),
their owners/finance staff, TFS Plus accountants and tax managers, and external auditors.
Positioning: "Books, VAT, Corporate Tax and e-invoicing in one place — prepared by AI,
reviewed by FTA-registered tax professionals." The human-in-the-loop tax agency is the
moat: Zoho/Xero/Wafeq sell software; we sell compliance outcomes.

Priority key: **P0** = MVP (must ship before first paying client), **P1** = within 6
months of launch, **P2** = later.

---
## A. Requirements from the product owner (baseline)

### A1. Core accounting (P0)
- Chart of accounts (IFRS-aligned UAE SME default, customisable, Arabic names).
- General ledger, manual and recurring journals, reversals, attachments.
- Accounting periods, soft-close and hard-close, year-end close to retained earnings.
- Trial Balance (with comparatives, drill-down), P&L, Balance Sheet — IAS 1 presentation.
- AR: customers, quotes, tax invoices (bilingual), credit notes, receipts, statements, ageing.
- AP: suppliers, bills, debit notes, payments, ageing.
- Multi-currency with AED base, CBUAE rates, realised/unrealised FX (IAS 21).

### A2. VAT (P0)
- Tax codes (standard 5%, zero-rated, exempt, out-of-scope, reverse charge, imports).
- VAT 201 return generation with emirate split and drill-down; VAT control account
  reconciliation; FTA Audit File (FAF) export; voluntary disclosure worksheet.

### A3. Corporate Tax (P0 for computation, P1 for full return pack)
- CT registration data, tax period, regime (standard / SBR / QFZP), taxable-income bridge,
  loss and interest carry-forwards, CT provision posting, return-ready pack.

### A4. E-invoicing (P0 before 1 July 2027 for SME clients)
- PINT AE (UBL 2.1 / Peppol) invoice and credit-note generation, pre-validation,
  transmission through Accredited Service Providers (ASP), status tracking, inbound
  invoice reception into AP, UAE storage.

### A5. Dashboards & alerts (P0)
- Client dashboard: Revenue, Cost of sales, Gross margin, Opex, Net profit, Cash, AR, AP,
  ageing, bad debts / ECL provision, VAT payable/refundable, CT estimate, upcoming
  deadlines.
- Compliance calendar: VAT returns (monthly/quarterly), CT returns, e-invoicing ASP
  milestones, licence renewals — email + in-app + WhatsApp alerts at T-30/T-14/T-7/T-1.

### A6. Firm master (P0)
- Master dashboard across all clients: KPIs, deadline heat-map, filing status, overdue
  items, risk flags, workload per accountant.
- Full access to every client's data via explicit grants; nightly encrypted backups and
  per-client export (TB, GL, documents) — "backup copy" of all customers.

---
## B. Additional capabilities recommended (senior practitioner view)

These are the gaps that make or break an SME accounting/tax product in the UAE. They
come from what actually goes wrong in client files at year-end and in FTA audits.

### B1. Get the data in — without it nothing else matters (P0)
1. **Bank feeds & reconciliation.** UAE Open Finance aggregators (e.g. Lean, Tarabut)
   where available; PDF/CSV/MT940 statement import with AI parsing as fallback.
   Rule-based + AI matching; reconciliation report per account per month.
2. **Document AI (OCR) for purchase invoices and receipts** — Arabic and English;
   extract supplier, TRN, invoice no., date, net, VAT, total; auto-check TRN format,
   duplicate invoices, VAT arithmetic; create draft bill for approval. Email-in and
   WhatsApp-in capture.
3. **Migration importers** from Zoho Books, QuickBooks, Xero, Tally and Excel
   (CoA, opening balances, open AR/AP, contacts). Onboarding speed wins deals.

### B2. IFRS closing entries SMEs usually get wrong (P1)
4. **Fixed asset register (IAS 16 / IAS 38)** — capitalisation threshold, depreciation
   methods, disposals, revaluation flag; ties to VAT capital-asset records.
5. **Leases (IFRS 16 / IFRS for SMEs Section 20)** — office, warehouse and staff
   accommodation leases: ROU asset, lease liability, interest and depreciation
   schedules. Most SME books ignore this; auditors don't.
6. **Expected credit loss / bad debts (IFRS 9 simplified approach)** — provision
   matrix on AR ageing, write-off workflow, and link to **VAT bad-debt relief**
   eligibility tracking. This turns the "bad debts" dashboard tile into something real.
7. **Employee end-of-service benefits (IAS 19)** — UAE Labour Law gratuity accrual
   per employee, monthly provision entries; payroll & WPS SIF file (P1).
8. **Revenue recognition (IFRS 15)** — deferred revenue, milestone and retention
   billing for contracting/services clients; unbilled revenue.
9. **Inventory (IAS 2)** — perpetual stock, weighted average/FIFO, NRV write-down (P1/P2).
10. **Deferred tax (IAS 12)** — temporary differences at 9% post-CT; SMEs forget this,
    auditors raise it.
11. **Accruals & prepayments schedules**, with AI-detected recurring patterns.
12. **Related-party register** — feeds IAS 24 disclosure, CT connected-person tests and
    transfer pricing disclosure thresholds in one place.

### B3. Audit-ready pack (P1)
13. Lead schedules per FS line, notes to the financial statements generator (IFRS for
    SMEs and full IFRS templates), PBC (prepared-by-client) checklist, auditor portal
    (read-only, time-boxed), proposed audit adjustments workflow, sign-off trail.
14. Statement of cash flows (indirect), SOCE, comparative restatement support.

### B4. Deeper VAT (P0/P1)
15. Reverse charge on imported services and goods (customs import declarations),
    Designated Zone treatment, input-tax apportionment for partially exempt businesses,
    blocked input tax (entertainment, personal use of motor vehicles, etc.), profit
    margin scheme (used goods), capital asset scheme tracking, bad-debt relief,
    VAT on deemed supplies, tax-group support, VAT return vs GL reconciliation,
    voluntary disclosure computation.
16. **Pre-filing AI review**: anomalies before submission (supplier not VAT-registered
    but VAT claimed, VAT on exempt lines, round-sum entries, unusual refunds).

### B5. Deeper Corporate Tax (P1)
17. SBR eligibility monitor across all periods; QFZP qualifying/non-qualifying revenue
    tagging and de-minimis tracker; interest limitation calculator; entertainment and
    non-deductible expense tagging at transaction level (so the CT bridge builds itself);
    transfer pricing disclosure form data; CT registration and deregistration tracking.

### B6. E-invoicing done properly (P0)
18. **ASP-agnostic adapter layer** — TFS Plus already has relationships with multiple
    ASPs; supporting several is a commercial advantage (client keeps their chosen ASP).
19. Pre-validation against PINT AE rules before sending; rejection queue with
    AI-explained fixes; inbound e-invoices auto-matched to POs/GRNs and posted as draft
    bills; 14-day issuance timer alerts; credit-note enforcement for cancellations.
20. E-invoicing readiness assessment tool (gap analysis) — also a lead-generation
    product for the firm's consulting services.

### B7. AI layer (P0 basic, P1 advanced)
21. **Ask-your-books** (EN/AR natural language): "What was gross margin by month?",
    "Which customers are over 90 days?" — answered by SQL tools over the tenant's
    ledger only, with the query shown.
22. **Auto-categorisation** of bank lines and bills, learning per tenant.
23. **Anomaly detection**: duplicates, unusual amounts, weekend postings, TRN mismatch,
    VAT rate errors, related-party flags, sudden margin changes.
24. **Close agent**: monthly checklist executed by agents (bank recs, accruals,
    depreciation, FX reval, ECL, gratuity) with exceptions routed to the accountant.
25. **Tax copilot for the firm**: CT/VAT Q&A grounded in the firm's curated legislation
    library (RAG with citations), draft client memos — always reviewed by a human.
26. **CFO insights**: cash-flow forecast (13-week), DSO/DPO/DIO, runway, budget vs
    actual, scenario "what if revenue crosses AED 3m" (SBR loss) or "crosses AED 375k"
    (VAT registration).

### B8. Firm / practice management (P1)
27. Client onboarding & KYC/CDD (trade licence, MOA, Emirates IDs, UBO) — accountants
    are DNFBPs under UAE AML law; keep CDD records and risk rating.
28. Engagement & task management, preparer→reviewer→partner sign-off, time tracking,
    fee billing (the platform invoices its own clients), SLA tracking.
29. White-label / co-branding for partner firms (P2).

### B9. Security, trust & compliance (P0)
30. MFA, RBAC, maker-checker, full audit log, encryption, UAE-region hosting, backups
    with tested restore, UAE PDPL (Federal Decree-Law 45/2021) consent and data-subject
    handling, data processing terms for client data accessed by the firm.
31. Record retention by tax type (see compliance rules) with legal-hold.
32. Path to **FTA Tax Accounting Software Register (TASR)** listing and, later,
    ISO 27001 / SOC 2.

### B10. Integrations (P1/P2)
33. POS (restaurants/retail), e-commerce (Shopify, Amazon.ae, Noon), payment gateways,
    corporate cards, payroll providers, EmaraTax (as and when FTA opens filing APIs to
    integrators), Google/Microsoft for email capture, WhatsApp Business API.

---
## C. Out of scope for v1
Full ERP (manufacturing, MRP), consolidation of large groups, Pillar Two/DMTT
computations (monitor only), Excise tax (P2 add-on), KSA ZATCA (future expansion).

## D. Success metrics
- ≥ 80% of bank lines auto-categorised correctly by month 3 per client.
- Monthly close ≤ 5 working days; VAT return prepared ≤ 1 day after period end.
- Zero late filings for managed clients; audit adjustments < 3 per client per year.
- Client onboarding (migration + opening balances) ≤ 3 days.
