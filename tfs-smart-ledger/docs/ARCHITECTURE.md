# Architecture

## 1. High-level view
```
 Client users (EN/AR)      TFS+ firm users           External auditors
        │                        │                          │
        └──────────── Next.js web app (apps/web) ───────────┘
                               │ REST/OpenAPI (JWT, org context)
                        NestJS API (apps/api)
   ┌──────────┬──────────┬───────────┬───────────┬───────────┬──────────┐
   │ ledger   │ tax-     │ einvoice  │ ai        │ practice  │ reporting│
   │ package  │ engine   │ package   │ package   │ mgmt      │ (PDF/XLS)│
   └────┬─────┴────┬─────┴─────┬─────┴─────┬─────┴───────────┴────┬─────┘
        │          │           │           │                      │
   PostgreSQL 16 (RLS, pgvector)   Redis/BullMQ workers   S3 (UAE region)
                                          │
        External: ASPs (Peppol/PINT AE) · Bank aggregators · CBUAE FX rates ·
                  Claude API · Email/WhatsApp · (EmaraTax when APIs available)
```

## 2. Multi-tenancy model
- `Firm` 1—* `Organization` (client company). Users belong to a Firm or an Organization
  through `Membership` with a role.
- Firm users see a client only via `FirmClientAccess` (granted at onboarding, revocable).
- **Row-Level Security**: every tenant table has `organization_id`; policy
  `organization_id = current_setting('app.current_org')::uuid`. Firm master views run
  through a dedicated read role + materialised views that aggregate KPIs across
  permitted organisations.
- "Backup data in master" is implemented as: one database with tenant isolation +
  nightly encrypted snapshots (UAE region, 35-day retention) + on-demand per-client
  export bundle (GL, TB, FS, VAT/CT packs, documents) + monthly restore test.
  Do NOT maintain a second copy of client data in a separate "master" DB — it creates
  reconciliation and PDPL problems.

## 3. Ledger design
- `JournalEntry` (header) + `JournalLine` (account, debit, credit in txn currency and
  AED, tax code, dimensions: cost centre, project, branch, emirate).
- Sub-ledger documents (Invoice, Bill, Payment, BankTransaction, AssetDepreciation,
  PayrollRun...) generate journals through **posting rules**; documents keep a link to
  their journal. Reports read only from journal lines (single source of truth).
- Status flow: DRAFT → PENDING_APPROVAL → POSTED → (REVERSED). Only POSTED hits reports.
- Period locks enforced in the posting service and by DB trigger.
- Report builders: TB → mapped to FS lines via `FsMapping` (IFRS / IFRS for SMEs
  templates). Comparatives from prior-period locked snapshots.

## 4. Tax engine
Pure TypeScript functions taking data + config version, returning results + an
explanation trail. No DB access inside. Config is versioned by effective date so a 2025
return always recomputes with 2025 rules.

## 5. E-invoicing
- Canonical internal invoice → `PintAeMapper` → UBL 2.1 XML → local schematron/rule
  validation → `AspAdapter.send()` → status webhooks → store XML + ASP receipts in UAE
  storage → update invoice status.
- Inbound: ASP webhook/poll → parse UBL → match supplier (TRN) → draft Bill with AI
  account suggestion → approval.
- `AspAdapter` interface lets us plug in each ASP partner; adapter selected per
  organisation. Idempotency keys on every transmission; retries with backoff;
  dead-letter queue visible to firm users.

## 6. AI layer (packages/ai)
- Model access through Claude API with tool use. Tools are narrow, typed and
  tenant-scoped: `query_ledger(sql_template_id, params)`, `get_trial_balance`,
  `propose_journal`, `categorise_transactions`, `extract_document`,
  `search_tax_library`. The model never gets raw DB credentials or free-form SQL on
  production; use a read replica + whitelisted query templates or a sandboxed
  read-only role with RLS.
- Every AI action writes an `AiEvent` (prompt hash, tools called, output, confidence,
  accepted/rejected by whom). This feeds evals and the audit trail.
- Evals: golden datasets (bank lines → accounts, invoices → extraction, VAT scenarios)
  run in CI; block release if accuracy regresses.
- Tenant setting `aiDataSharing` (off/anonymised/full) respected on every call.

## 7. Hosting & security
- UAE region (e.g. AWS me-central-1, Azure UAE North, or a UAE sovereign cloud).
  Confirm your AI provider's data-processing terms and region options before enabling
  AI features on production client data.
- Containers (ECS/AKS), managed Postgres with PITR, WAF, secrets manager, KMS.
- MFA; session timeouts; IP allow-listing option for firm users.
- Environments: dev → staging (anonymised data) → production.

## 8. Key decisions to record as ADRs
ADR-001 monorepo & stack · ADR-002 RLS tenancy · ADR-003 money representation ·
ADR-004 posting-rule engine · ADR-005 ASP adapter strategy · ADR-006 AI guardrails.
