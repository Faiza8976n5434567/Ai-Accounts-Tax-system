# Roadmap (starting October 2026)

The anchor date is **1 July 2027**: SMEs below AED 50m must be live on e-invoicing, and
must appoint an ASP by **31 March 2027**. Every UAE SME will be forced to revisit its
accounting system in the next nine months — that is the sales window. The plan below
gets a pilot live with friendly clients by February 2027 and e-invoicing live before
the ASP-appointment deadline.

## Team (lean, AI-assisted)
- Product owner / domain lead: Faizan (requirements, tax rules, acceptance testing).
- 1 senior full-stack engineer (TypeScript, Postgres) driving Claude Code daily; a
  second engineer from Phase 3.
- 1 accountant-tester (part-time) building test scenarios and golden datasets.
- Part-time UI/UX designer (Phase 0–2), DevOps/security contractor (Phase 0, Phase 5).
- Claude Code writes most code; humans own architecture, review, security, testing.

## Phase 0 — Foundations (Oct 2026, 3–4 weeks)
- Decide name, legal entity owning the IP, pricing hypothesis, 5 pilot clients.
- UAE cloud account, domains, repo, CI/CD, environments; ADR-001..006.
- Shortlist 2 ASP partners for sandbox access; request technical specs/APIs.
- Download FTA Tax Accounting Software requirements & certification guidelines; map
  them to the backlog.
- Design system (TFS+ brand), EN/AR layouts, dashboard wireframes.
**DoD:** repo boots locally; CI green; ADRs merged; pilot clients signed LOIs.

## Phase 1 — Core ledger & multi-tenancy (Nov–Dec 2026, 8 weeks)
- Auth, MFA, RBAC, Firm/Organization tenancy with RLS, audit log.
- CoA (seeded), journals, periods & locks, contacts, invoices, bills, payments,
  credit/debit notes, bank statement import + manual reconciliation, multi-currency.
- Reports: TB, GL, P&L, BS, AR/AP ageing (PDF + Excel).
- Migration importer v1 (Excel template + Zoho/QuickBooks CSV).
**DoD:** property tests prove ledger always balances; a real pilot client's last year
re-keyed and TB matches their existing books to the fils.

## Phase 2 — VAT, dashboards, calendar & firm master (Jan–Feb 2027, 8 weeks)
- Tax codes, VAT 201 with drill-down, VAT reconciliation, FAF export.
- Compliance calendar + alert engine (email, in-app; WhatsApp in Phase 5).
- Client dashboard (Revenue, Cost, AR, AP, VAT, CT estimate, bad debts, deadlines).
- Firm master dashboard (all clients, status board, risk flags, workload).
- Document AI v1: bill/receipt extraction → draft bill.
- **Pilot go-live with 3–5 clients (Feb 2027).**
**DoD:** one full VAT quarter prepared in-system for each pilot client and reviewed by
the firm; figures agree to manual workings.

## Phase 3 — E-invoicing (Feb–Apr 2027, 8–10 weeks)
- Canonical invoice → PINT AE UBL mapper, validation, ASP adapter #1 then #2.
- Outbound status tracking, rejection queue, inbound invoices → draft bills.
- 14-day issuance monitor; UAE storage of XML; e-invoicing readiness assessment tool.
- Commercial: sign ASP partnership terms (referral/reseller), onboard pilot clients
  before 31 Mar 2027.
**DoD:** end-to-end send/receive in ASP sandbox for invoice + credit note scenarios
(standard, zero-rated, exempt, reverse charge, foreign currency); pilot clients live.

## Phase 4 — Corporate Tax, IFRS close & audit pack (Apr–Jun 2027, 10 weeks)
- CT module: regime gates, transaction-level tax tagging, bridge, carry-forwards,
  CT provision journal, return-ready pack (Excel/PDF).
- Fixed assets, IFRS 16 leases, ECL provision matrix, gratuity accrual, FX reval,
  deferred tax, accruals/prepayments schedules.
- FS generator (IFRS for SMEs + full IFRS) with notes, cash flow, SOCE; auditor portal.
**DoD:** FY2026 CT computations for pilot clients reproduced in-system and agreeing to
the firm's manual computation; one client's FS accepted by its auditor from the pack.

## Phase 5 — AI agents, payroll & integrations (Jul–Sep 2027)
- Ask-your-books (EN/AR), anomaly detection, close agent, CFO insights, tax copilot
  with legislation library (RAG, citations).
- Bank feeds via open-finance aggregator; payroll + WPS SIF; POS/e-commerce connectors.
- Security hardening, pen-test, DR drill.
**DoD:** ≥ 80% auto-categorisation accuracy on golden set; pen-test high findings closed.

## Phase 6 — Accreditation & scale (Q4 2027 →)
- Apply for FTA Tax Accounting Software Register listing (AED 10,000, annual renewal).
- ISO 27001 roadmap; public launch; partner/white-label programme; marketplace.
- Evaluate expansion (KSA ZATCA) and whether to pursue ASP accreditation directly.

## Commercial track (runs in parallel)
- Pricing: bundle software + managed service (e.g. "Books + VAT", "Books + VAT + CT",
  "Full outsourced finance") — software-only tier to compete with Zoho/Wafeq on price is
  not the play; the managed compliance outcome is.
- Use e-invoicing readiness assessments as the lead magnet (Q4 2026 – Q2 2027).
- Programmes worth approaching for support: Hub71, Khalifa Fund, Abu Dhabi Chamber.

## Top risks
1. Regulatory change (deadlines, PINT AE versions) → config-driven rules, quarterly review.
2. ASP API variability → adapter layer + sandbox tests per ASP.
3. AI errors in books → approval thresholds, evals, human review, audit trail.
4. Security/data breach → UAE hosting, MFA, pen-tests, least privilege, PDPL process.
5. Scope creep → phase gates; P2 items stay parked until revenue.
