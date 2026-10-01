# Claude Code Prompt Playbook

Paste these into Claude Code one at a time, from the repo root. Wait for each to finish,
review the diff, run tests, commit, then move on. Start every session with:
> Read CLAUDE.md and the docs folder. Summarise the current phase and what is done.

Tip: ask Claude Code to "plan first, then implement" for anything larger than one file,
and to write tests before implementation for ledger and tax logic.

---
## Phase 0
**P0.1 — Monorepo scaffold**
> Set up the monorepo exactly as described in CLAUDE.md §3: pnpm workspaces, Turborepo,
> apps/web (Next.js App Router, Tailwind, shadcn/ui, next-intl with en and ar + RTL),
> apps/api (NestJS with OpenAPI and Zod), and the existing packages (db, ledger,
> tax-engine, einvoice) plus a new packages/ai. Keep the code already in packages/.
> Add ESLint, Prettier, Vitest, a docker-compose with Postgres 16 (pgvector) and Redis,
> and a GitHub Actions workflow running lint, typecheck and tests. Write ADR-001.

**P0.2 — Design system**
> Create a design-tokens file and Tailwind theme using the TFS+ palette: Carbon #1F1F1F,
> Graphite #3D3D3D, Stone #F5F5F5, Midnight Blue #2C2875, Cobalt Blue #072AC8, Crystal
> Blue #55C7E0 (max two accent blues per screen). Fonts: Neue Haas Grotesk (licensed)
> with Arial fallback for English, Almarai for Arabic. Build an app shell with sidebar,
> org switcher (for firm users), language toggle and RTL support.

## Phase 1
**P1.1 — Database & tenancy**
> Using packages/db/prisma/schema.prisma as the starting point, generate the initial
> migration. Add SQL migrations that enable Row-Level Security on every table with an
> organizationId, using current_setting('app.current_org'). Add a trigger that rejects
> unbalanced posted journals and any insert/update into a locked period. Write
> integration tests proving one org cannot read another org's rows.

**P1.2 — Auth & RBAC**
> Implement authentication with mandatory MFA for firm roles, the role model in
> CLAUDE.md §4, FirmClientAccess grants, and maker-checker enforcement. Every mutation
> writes to AuditLog with before/after JSON.

**P1.3 — Posting engine**
> Extend packages/ledger/src/posting.ts into a full posting service: create draft,
> submit, approve, post, reverse. Posting rules for Invoice, CreditNote, Bill,
> DebitNote, Payment, Receipt. Add fast-check property tests for the balance invariant
> and FX rounding. Expose via NestJS endpoints.

**P1.4 — Sales & purchases**
> Build customers, suppliers, invoices, credit notes, bills and payments end-to-end
> (API + UI). Tax invoices must be bilingual (EN/AR) PDFs with all FTA-mandatory fields
> and TRN, using tax codes from packages/tax-engine. Partial payments and allocation.

**P1.5 — Bank**
> Bank accounts, statement import (CSV, Excel, PDF via AI extraction stub), matching
> suggestions (amount/date/reference rules), reconciliation screen and report.

**P1.6 — Reports**
> Trial Balance, General Ledger, P&L, Balance Sheet (IAS 1 layout via FsMapping), AR/AP
> ageing — with comparatives, drill-down to journal, and export to PDF and Excel.

**P1.7 — Migration importer**
> Build an import wizard: Excel template + Zoho Books and QuickBooks CSV for CoA,
> contacts, opening balances and open invoices/bills. Validate that opening TB balances.

## Phase 2
**P2.1 — VAT engine integration**
> Wire packages/tax-engine/src/vat.ts into invoices and bills. Build the VAT return
> workflow: select period → build VAT 201 → drill-down per box → reconcile to VAT GL
> accounts → reviewer approval → lock → export (PDF/Excel) → mark filed with FTA
> reference. Add FAF export. Add a pre-filing checks list (see PRD B4.16).

**P2.2 — Compliance calendar**
> Use packages/tax-engine/src/deadlines.ts to generate calendar events per organisation
> from its VAT periods, CT period and e-invoicing cohort. BullMQ job sends alerts at
> T-30/14/7/1 days by email and in-app; escalation to firm manager when overdue.

**P2.3 — Dashboards**
> Client dashboard and Firm master dashboard as described in PRD A5/A6, using
> materialised views refreshed on posting. Firm view: table of all clients with
> next deadline, VAT status, CT status, e-invoicing status, open review items, risk
> score; filters by accountant and status.

**P2.4 — Document AI v1**
> packages/ai: extraction of supplier invoices/receipts (EN/AR) with Claude vision,
> returning typed JSON (supplier, TRN, number, date, lines, VAT, total, currency) plus
> confidence. Validate arithmetic and TRN format, detect duplicates, create a draft
> Bill for approval. Build an eval set of 50 anonymised invoices.

## Phase 3
**P3.1 — PINT AE**
> Complete packages/einvoice: map canonical invoices and credit notes to PINT AE UBL
> 2.1, validate against the official PINT AE rules (load the published specification
> into docs/specs/ first), store XML in UAE storage.

**P3.2 — ASP adapters**
> Implement AspAdapter for our first ASP using their sandbox API docs (in
> docs/specs/asp-<name>/). Idempotent send, status webhooks, retries, dead-letter
> queue, inbound invoice polling → draft Bill. Then the second ASP.

## Phase 4
**P4.1 — CT module**
> Integrate packages/tax-engine/src/ct.ts: transaction-level CT tags (entertainment,
> fines, donations, related party, exempt income), regime gates, bridge screen with
> drill-down, carry-forward register, CT provision journal, return-ready pack export.

**P4.2 — IFRS close**
> Fixed assets, IFRS 16 leases, ECL provision matrix, gratuity accrual, FX revaluation,
> deferred tax, and a month-end close checklist that runs these as jobs.

**P4.3 — Financial statements & audit pack**
> FS generator (IFRS for SMEs and full IFRS templates) with notes, cash flow (indirect),
> SOCE; lead schedules; PBC list; auditor portal with time-boxed read-only access.

## Phase 5
**P5.1 — Ask-your-books**
> Chat assistant (EN/AR) using Claude tool use over whitelisted, tenant-scoped query
> templates. Show the data used; log every call to AiEvent; respect aiDataSharing.

**P5.2 — Anomalies & close agent**
> Anomaly rules + AI review before VAT filing and month-end; close agent that executes
> the checklist and routes exceptions to the assigned accountant.

## Review prompts (use any time)
- `/accounting-review` — custom command in .claude/commands.
- "Act as a UAE statutory auditor. Review this module for IFRS and audit-trail gaps."
- "Act as an FTA auditor. What would you challenge in the VAT return produced by this code?"
- "Threat-model this feature for tenant data leakage."
