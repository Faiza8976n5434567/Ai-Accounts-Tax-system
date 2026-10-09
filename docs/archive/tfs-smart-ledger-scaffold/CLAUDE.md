# CLAUDE.md — TFS+ Smart Ledger (working title)

You are the lead engineer on an AI-native accounting, tax and e-invoicing platform for UAE
companies, built by TFS Plus Tax & Accountancy LLC (FTA-registered tax agency, Abu Dhabi).
Product owner and domain authority: Faizan (Senior Manager, Tax & Financial Advisory).
When accounting or tax logic is ambiguous, STOP and ask the product owner — never guess a
tax rule. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/UAE_COMPLIANCE_RULES.md`
before starting any new module.

## 1. What we are building
- Multi-tenant SaaS. Two tenant levels:
  - **Firm** (TFS Plus): master dashboard over every client, practice management,
    review/approval workflows, cross-client reporting, backups/exports.
  - **Client organisation** (UAE SME, typically revenue < AED 20m): own login(s), own books.
- Scope: general ledger → sub-ledgers (AR, AP, bank, fixed assets, payroll/EOSB,
  inventory) → period close → Trial Balance, P&L, Balance Sheet, Cash Flow, SOCE and notes
  under full IFRS or IFRS for SMEs → UAE VAT (VAT 201, FAF) → UAE Corporate Tax
  (computation + return pack) → UAE e-invoicing (PINT AE via Accredited Service Providers)
  → dashboards, compliance calendar and alerts → AI assistants on top.

## 2. Non-negotiable principles
1. **The ledger is deterministic. AI proposes; rules validate; humans approve.**
   AI may draft journal entries, categorise transactions, extract documents, explain
   numbers and flag anomalies. AI may NEVER post to the ledger, file a return, or submit
   an e-invoice without passing deterministic validation AND an approval rule
   (auto-approve only below configurable confidence/amount thresholds, set per tenant).
2. **Double entry always balances.** Every journal: sum(debits) = sum(credits) in
   transaction currency AND in AED base currency. Enforce in the domain layer AND with a
   database constraint/trigger. No journal lines with both debit and credit.
3. **Immutability.** Posted journals are never edited or deleted — only reversed.
   Closed periods are locked; reopening requires a Firm-level role and is audit-logged.
4. **Audit trail on everything** (who, what, when, before/after, source, AI involvement,
   approver). Append-only table. This is required for FTA Audit File and statutory audit.
5. **Money is never a float.** Use integer minor units (fils, BigInt) or a decimal
   library. Rounding: half-up to 2 dp at line level for VAT; document any other rule.
6. **Tax rules are data, not code constants.** Rates, thresholds, deadlines, penalty
   amounts and box mappings live in versioned config with `effectiveFrom`/`effectiveTo`
   and a `legalReference` + `lastVerified` date (see `packages/tax-engine/src/config`).
   Every tax output records which config version produced it.
7. **Tenant isolation.** Every row carries `organizationId`. PostgreSQL Row-Level
   Security enforced; the API sets `app.current_org` per request. Firm users access
   client data only through an explicit `FirmClientAccess` grant (logged).
8. **UAE data residency.** All production data, backups and e-invoice XML stored in a
   UAE cloud region. No customer financial data sent to an AI provider without the
   tenant's consent setting enabled; strip/obfuscate personal data where possible.
9. **Bilingual.** English + Arabic (RTL) UI and tax invoices from day one. i18n keys only,
   no hard-coded strings.
10. **Explainability.** Every tax number drills down to source transactions; every AI
    suggestion shows its reasoning, sources and confidence.

## 3. Tech stack (do not change without an ADR in docs/adr/)
- Monorepo: pnpm workspaces + Turborepo. TypeScript strict everywhere.
- `apps/web`: Next.js (App Router), React, Tailwind, shadcn/ui, TanStack Query, next-intl
  (en/ar, RTL), Recharts for dashboards.
- `apps/api`: NestJS (REST + OpenAPI), Zod validation, BullMQ + Redis for jobs
  (bank sync, OCR, e-invoice transmission, alerts, report generation).
- `packages/db`: PostgreSQL 16 + Prisma; RLS policies in SQL migrations; pgvector for
  document/knowledge retrieval.
- `packages/ledger`: posting engine, period close, FX revaluation, report builders.
- `packages/tax-engine`: VAT, CT, deadlines — pure functions, 100% unit-tested.
- `packages/einvoice`: PINT AE UBL mapper, validator, ASP adapter interface + adapters.
- `packages/ai`: Claude API client, tool definitions, prompt templates, guardrails, evals.
- Auth: Auth.js / Keycloak with MFA mandatory for Firm users; roles below.
- Storage: S3-compatible bucket in UAE region; documents encrypted at rest.
- Observability: OpenTelemetry, structured logs (no PII / amounts in logs).

## 4. Roles (RBAC)
Firm: `FIRM_ADMIN`, `FIRM_PARTNER` (approve/close/file), `FIRM_MANAGER` (review),
`FIRM_ACCOUNTANT` (prepare). Client: `CLIENT_OWNER`, `CLIENT_FINANCE` (post within
limits), `CLIENT_VIEWER`, `EXTERNAL_AUDITOR` (read-only, time-boxed). Maker-checker:
the preparer of a journal/return can never be its approver.

## 5. Coding conventions
- Domain logic in packages, never in controllers or React components.
- Every accounting/tax function gets unit tests with worked examples in AED, including
  edge cases (zero-rated, exempt, reverse charge, credit notes, FX, partial payments).
- Use property-based tests (fast-check) for posting invariants.
- Migrations are forward-only; seed data in `packages/db/seed`.
- Commit style: Conventional Commits. Small PRs. Update docs when behaviour changes.
- Before finishing any task: run `pnpm lint && pnpm typecheck && pnpm test`.

## 6. Build order (see docs/ROADMAP.md for detail)
Phase 1 Foundation & ledger → Phase 2 VAT + dashboards + calendar → Phase 3 e-invoicing →
Phase 4 CT + IFRS close + audit pack → Phase 5 AI agents, payroll, integrations →
Phase 6 accreditation, scale. Do not start a phase until the previous phase's
"Definition of Done" in docs/ROADMAP.md is met.

## 7. Where the domain knowledge lives
- `docs/UAE_COMPLIANCE_RULES.md` — VAT, CT, e-invoicing, IFRS rules to implement.
- `packages/tax-engine/src/config/uae-tax-config.ts` — versioned thresholds/deadlines.
- `packages/db/seed/chart-of-accounts.uae-sme.json` — default IFRS-aligned CoA.
Anything marked `VERIFY` must be confirmed by the product owner against current FTA/MoF
publications before release.
