# Choosing the e-invoicing ASP (Q-02) — comparison and shortlist

Prepared 9 Oct 2026 for Faizan. **Deadline for SME clients: appoint an ASP by 31 Mar 2027; go-live 1 Jul 2027.**
Facts marked *(to confirm)* come from vendor or third-party pages and must be checked with the provider in writing.

## 1. The official list
The Ministry of Finance page ([eInvoicing Accredited Service Providers](https://mof.gov.ae/en/about-us/initiatives/einvoicing/einvoicing-accredited-service-providers-asps/), read 9 Oct 2026)
lists **65 accredited ASPs** (with accreditation numbers) and **5 under final accreditation assessment**
(Avalara Gulf Technologies, Fyient Line Technology, Global Experts of IT Consultants, SNB Accounting Management & Tax Consultancy, UHY James Advisory).
Only accredited providers may run e-invoicing in the UAE, and accreditation lasts two years
(Ministerial Decision No. 64 of 2025, per [PwC](https://www.pwc.com/m1/en/services/tax/me-tax-legal-news/2025/ministerial-decision-no-64-of-2025.html)).
The same decision requires every accredited ASP to offer **100 free e-invoice exchange and reporting services per year** (per PwC's summary) — ask for it in the contract.

## 2. What TFS+ Smart Ledger needs from an ASP
| # | Requirement | Why |
|---|---|---|
| 1 | **MoF-accredited** (on the list above, not only "pre-approved") | Only accredited ASPs may transmit |
| 2 | **API we can call from our server** (REST, API keys / OAuth), documented | Sending happens from our Vercel function (P4-07) |
| 3 | **Accepts our PINT AE UBL file** as is — or a clear JSON mapping | Our app already builds and validates PINT AE 1.0.4 (P4-06) |
| 4 | **Sandbox / test environment** we can use before go-live | EINV tests (P4-09) |
| 5 | **Status + rejection reasons** (webhooks or status API) | Rejection queue and resend (P4-07) |
| 6 | **Inbound e-invoices** (purchases) via API or webhook | Supplier e-invoices → draft bills (P4-08) |
| 7 | **One firm account, many client companies** (each with its own TRN / Peppol ID) | TFS Plus runs many clients; other firms later (D-20) |
| 8 | Reports the **Tax Data Document** to the FTA for us | Part of the ASP's job in the 5-corner model |
| 9 | Peppol directory lookup (is the buyer on Peppol?) | Chooses the buyer address vs 9900000098 |
| 10 | Pricing per invoice / per client, setup fee, the **100 free** per year; UAE data location; ISO 27001 | Cost and data protection |

## 3. Shortlist (recommendation)
The 65 split into three kinds. For a **software product like ours**, the API-first platforms fit best; ASPs tied to
their own accounting software, and audit/consulting firms, suit businesses using those products or wanting a managed service.

| Provider (accreditation no.) | Kind | What is public | Fit for us |
|---|---|---|---|
| **Complyance** (112219) | API-first platform | Public developer docs ([docs.complyance.io](https://docs.complyance.io/), [API playground](https://apidocs.complyance.io/)); UAE in sandbox mode; SDKs incl. Node / TypeScript; purchases (inbound) API and webhooks; partner platform for many companies | ★ **Top pick to test first** — closest to our needs on paper. *(To confirm: whether it accepts our UBL file as is, pricing)* |
| **Flick Network** (138271) | API-first platform | Developer docs portal ([docs.flick.network](https://docs.flick.network/)); UAE guide; says it provides a sandbox and validates PINT AE | ★ Shortlist. *(To confirm: API details, sandbox access, inbound, multi-company)* |
| **ClearTax / Defmacro** (163162) | Large compliance platform | UAE sandbox/testing guidance; API docs via sales (their India API docs are public) | Shortlist as an established alternative. *(To confirm: UAE API docs, pricing)* |
| **Pagero — Thomson Reuters** (153759) | Global Peppol network | Among the first pre-approved; global Peppol provider | Strong but enterprise-oriented. *(To confirm: API access and price for SMEs)* |
| EDICOM (102434), Comarch (110668) | Global e-invoicing networks | Accreditation; product pages | Enterprise-oriented; ask only if the shortlist fails |
| Zoho (121988), Tally (162503), Wafeq (129932), Focus Softnet (134577) | ASP for their own accounting software | — | Not for us (built around their own software) |
| Deloitte, EY, BDO, KGRN, Moore JFC, Mac & Ross, SNB *(final assessment)* | Audit / consulting firms | — | Managed service; unlikely to suit an API integration |
| Avalara *(final assessment)* | Global tax platform | — | Not yet accredited — wait |

## 4. Questions to send each shortlisted ASP
1. Your MoF accreditation number and expiry date?
2. API documentation and **sandbox credentials** — how do we get them, and is there a cost?
3. Can we submit a **ready PINT AE 1.0.4 UBL invoice / credit note**, or must we send your JSON? Do you sign and report the TDD?
4. How do we receive **status, acknowledgements and rejection reasons** (webhook, polling)? Is submission idempotent (same UUID sent twice)?
5. **Inbound**: how do received supplier e-invoices reach us (webhook / API), in which format?
6. **Multi-client**: can one firm account onboard many client companies, each with its own TRN and Peppol ID? Bulk onboarding?
7. **Pricing** for a tax firm with *N* clients and about *X* invoices a month: setup, per invoice, per client, archiving; the **100 free e-invoices per year** (MD 64/2025) — per client?
8. Where is the data hosted? ISO 27001 / 22301 certificates? Archiving period?
9. Peppol directory lookup API (is a buyer registered)?
10. Support hours and SLA; notice period and data export if we leave.

## 5. Next steps
1. Faizan sends the questions to **Complyance, Flick and ClearTax** (optionally Pagero) and asks for sandbox access.
2. Claude reviews each API documentation against section 2 and recommends one (Q-02 decision).
3. Connect the chosen ASP's sandbox: sending, status, rejection queue, inbound → draft bills (P4-07 → P4-09).
