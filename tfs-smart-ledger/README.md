# TFS+ Smart Ledger — Claude Code Starter Kit

AI-native accounting, VAT, Corporate Tax and e-invoicing platform for UAE SMEs,
with a TFS Plus firm master console.

## What's in this kit
| Path | Purpose |
|---|---|
| `CLAUDE.md` | Master instructions Claude Code reads automatically every session |
| `docs/PRD.md` | Full requirements incl. recommended additional features (P0/P1/P2) |
| `docs/ARCHITECTURE.md` | Multi-tenant architecture, AI guardrails, hosting |
| `docs/UAE_COMPLIANCE_RULES.md` | VAT / CT / e-invoicing / IFRS rules (items tagged VERIFY) |
| `docs/ROADMAP.md` | Phase plan Oct 2026 → Q4 2027 with Definitions of Done |
| `docs/CLAUDE_CODE_PROMPTS.md` | Copy-paste prompts, phase by phase |
| `docs/COMPETITOR_REFERENCE.md` | Zoho, Wafeq, Digits, etc. — what to borrow, where to differ |
| `packages/db/prisma/schema.prisma` | Core data model (tenancy, GL, AR/AP, VAT, CT, e-invoice, audit, AI) |
| `packages/db/seed/chart-of-accounts.uae-sme.json` | 61-account IFRS-aligned CoA, EN/AR, CT tags |
| `packages/tax-engine` | VAT 201 builder, CT computation, deadline calendar — **19 passing tests** |
| `packages/ledger` | Posting engine with balance/FX property tests — **6 passing tests** |
| `packages/einvoice` | ASP adapter interface + PINT AE UBL mapper starter |
| `.claude/commands/` | `/accounting-review` and `/next-phase` slash commands |

## How to start (day 1)
1. Install Node.js 20+, pnpm, Docker Desktop, Git, and Claude Code (see Anthropic's
   Claude Code docs for installation and plan options).
2. Unzip this kit, `cd` into it, run `git init && git add . && git commit -m "kit"`.
3. Run `claude` in the folder. First message:
   `Read CLAUDE.md and every file in docs/. Then run prompt P0.1 from docs/CLAUDE_CODE_PROMPTS.md.`
4. After each prompt: review the diff, run `pnpm test`, commit. Use `/next-phase` when unsure.
5. Before Phase 2 and Phase 3, confirm every **VERIFY** item in
   `docs/UAE_COMPLIANCE_RULES.md` and `packages/tax-engine/src/config/uae-tax-config.ts`.
6. Put official specs you obtain (PINT AE, ASP API docs, FTA software requirements) in
   `docs/specs/` so Claude Code builds against the real documents.

## Important
Claude Code can write most of this system, but a production financial platform still
needs a professional engineer reviewing security, tenancy and deployments, plus an
accountant testing every report against manual workings.
