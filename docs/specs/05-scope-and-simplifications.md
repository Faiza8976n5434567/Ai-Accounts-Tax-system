# Spec 05 — Scope review: what to simplify, defer or drop

| | |
|---|---|
| **Status** | ✅ Approved by Faizan, 2026-10-06 |
| **Source reviewed** | `tfs-smart-ledger/docs/PRD.md`, `ARCHITECTURE.md`, old `ROADMAP.md`, the POC |

## In plain words

The original requirements describe a product a team of 10 would build over two years. To go
live **fast and accurately**, we keep everything that protects correctness and compliance,
and swap expensive features for simpler ones that achieve the same goal. Nothing below is
lost — "Defer" items stay on the list for after the pilot.

**Verdicts:** ✅ Keep · 🔁 Simplify (alternative given) · ⏸ Defer (after pilot) · ❌ Drop

---

## 1. Architecture & technology

| Item (original plan) | Verdict | Why | Alternative |
|---|---|---|---|
| Monorepo (pnpm + Turborepo), NestJS API, Next.js rewrite | ❌ | Rebuilds what the POC already has; no business value | Keep React/Vite app + Supabase + small Vercel functions (D-02) |
| BullMQ + Redis job queues | ❌ | Extra servers to run and pay for | Vercel daily cron + Postgres functions; `pg_cron` for nightly checks |
| Keycloak / Auth.js | ❌ | Separate identity server | Supabase Auth (invites, MFA) |
| Prisma ORM | ❌ | Duplicates schema; weaker RLS story | SQL migrations + generated TypeScript types |
| pgvector / RAG knowledge base | ❌ | Only needed for AI (D-01) | — |
| Separate "master" backup database | ❌ | Reconciliation and privacy problems (the old docs say so too) | One database + nightly export + per-client export button |
| UAE hosting now (AWS/Azure containers, WAF, KMS) | ⏸ | Heavy ops before there's a product | Supabase Cloud now → self-hosted Supabase in UAE (D-04, Phase 6) |

## 2. Accounting features

| Item | Verdict | Why | Alternative |
|---|---|---|---|
| Multi-currency with CBUAE rates & FX revaluation (IAS 21) | 🔁 | FX revaluation is complex; AED is pegged to USD | **v1: AED + USD at the fixed 3.6725 peg (D-21)** — no revaluation needed. Other currencies & revaluation ⏸ after pilot |
| Recurring journals | 🔁 | | "Copy journal" button (one click, still needs approval) |
| Soft-close **and** hard-close | 🔁 | Two lock types confuse users | One lock per month; reopen by Firm Admin with reason |
| Quotes / proforma invoices | ⏸ | Not needed for compliance | Later |
| Customer statements | ✅ | Clients ask for them | Simple PDF statement from AR data |
| Migration importers for Zoho, QuickBooks, Xero, Tally | 🔁 | Five formats to maintain | **One Excel template** (CoA, opening balances, open invoices/bills, contacts) + guidance on exporting from each system |
| IFRS 16 leases, ECL matrix, deferred tax, IFRS 15 deferred revenue engines | ⏸ | Each is a mini-product; few SME pilots need them monthly | Year-end **manual journals with worksheet templates** (Excel) until demand is proven |
| Inventory (IAS 2) perpetual costing | ⏸ | Large feature | Purchases to COGS / stock adjustment journal at period end |
| Payroll & WPS SIF file | ⏸ | Separate regulated product | Import payroll totals as a journal; EOSB accrual as a monthly journal |
| Related-party register | ⏸ | | Tag contacts as related party (one checkbox) |
| Full IFRS **and** IFRS for SMEs statements with notes generator | 🔁 | Notes generator is very large | IFRS for SMEs primary statements (P&L, BS, cash flow, SOCE) + Excel export; notes drafted outside |

## 3. Tax features

| Item | Verdict | Why | Alternative |
|---|---|---|---|
| VAT 201 with drill-down, reconciliation, frozen snapshots | ✅ | Core | — |
| FTA Audit File (FAF) export | ✅ (Phase 3) | Requested by FTA in audits | CSV in FTA format |
| Voluntary disclosure worksheet | 🔁 | | Compare frozen return vs recalculated → difference report |
| Partial exemption apportionment, profit margin scheme, capital asset scheme, tax groups, designated zones | ⏸ | Edge cases for a few clients | Manual adjustment lines in the return with reason (audit-logged) |
| Filing directly to EmaraTax | ❌ | FTA has no public filing API for this | Export figures; filing done on EmaraTax by the tax agent |
| CT: standard + SBR + loss relief + add-backs | ✅ | Core | — |
| QFZP de-minimis tracker, interest limitation, transfer pricing forms | ⏸ | Specialist cases | Manual adjustment lines in the CT computation with reason |
| Two ASP adapters at once | 🔁 | Double the integration work | One ASP first (Q-02); keep the adapter interface so a second can be added |

## 4. Firm, AI & integrations

| Item | Verdict | Why | Alternative |
|---|---|---|---|
| All AI features (OCR, categorisation, ask-your-books, close agent, copilot, CFO insights) | ❌ | D-01 | Rule-based defaults ("last account used for this supplier"), compliance checks, fixed reports |
| Open-banking bank feeds (Lean, Tarabut) | ⏸ | Contracts, cost, bank coverage | CSV/Excel statement upload |
| WhatsApp alerts | ⏸ | Business API setup and cost | Email (Resend) + in-app notifications |
| Email-in / WhatsApp-in document capture | ⏸ | | Upload button + drag-and-drop |
| KYC/CDD module | 🔁 | Needed (AML) but not in the ledger | Document checklist per client (upload trade licence, MOA, IDs) with expiry dates |
| Time tracking, fee billing, SLA tracking | ⏸ | Practice-management product | Use existing tools |
| White-label, marketplace, KSA ZATCA | ⏸ | Growth stage | — |
| POS / e-commerce / payment gateway connectors | ⏸ | | Import sales summaries via CSV journal |
| FTA software register (TASR), ISO 27001, SOC 2 | ⏸ | Only after product is stable | Security review now (Q-03), pen-test Phase 6 |
| Real-time collaboration / live updates | ❌ | Not needed | Refresh on save |

## 5. Result

What remains for go-live (Phases 1–3) is a focused, testable core:
**logins & roles → clients & chart of accounts → journals → sales/purchases/payments/credits →
bank upload & matching → reports → VAT 201 → alerts.** E-invoicing (Phase 4) and CT &
year-end (Phase 5) follow, driven by the legal deadlines.
