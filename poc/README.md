# TFS+ Smart Ledger — POC

Clickable proof-of-concept of the UAE accounting, VAT, CT and e-invoicing platform. **No AI in
the product (D-01)** — defaults come from deterministic rules and a person always approves.
No backend yet: data lives in the browser's localStorage, seeded with 3 demo clients
(Jan–Sep 2026). Phase 1 moves it to Supabase (see `../PLAN.md` and `../docs/specs`).

```
npm install
npm run dev      # http://localhost:5180
npm run check    # type check, lint, finance lint, unit tests, build, bundle scan
npm run e2e      # browser tests (Playwright)
```

> Windows: the project folder name contains `&`, which breaks `npm run` shims. Until the folder
> is renamed, run tools directly, e.g. `node node_modules/vite/bin/vite.js` (see `../.claude/launch.json`).

## Demo script (5 min)
1. **Firm overview** (Partner – Faizan): all clients, VAT due, risk flags, deadline heat-map, workload.
2. Click **Al Noor** → dashboard with the profit movement between the last two months (plain ledger arithmetic).
3. **Purchase bills** → *Enter a bill without a file* (or attach a PDF) → type supplier, TRN, amounts →
   Art 59 & duplicate checks run live → account/tax code pre-filled from the supplier's last bill or a
   keyword rule → *Submit for approval* → maker-checker blocks Faizan → switch role to **Client Owner** → approve.
4. **VAT 201** → every box shown (empty = 0.00); click any box to drill down to journals.
5. **Corporate tax** → bridge with legal references; switch regime to SBR.
6. **Sales & e-invoicing** → new tax invoice (place of supply defaults to head office) → PINT AE XML → transmit (sandbox).
7. **Bank reconciliation** → Auto-match, then post the suggested lines.
8. **Audit trail**, **Settings** (tax configuration, backup/restore).

## What is simulated
- ASP transmission: timed status updates; no network.
- Logins/roles: a role switcher in the sidebar (real logins arrive in Phase 1).

## Quality gates
`src/**/*.test.ts` (Vitest, ≥ 95% line coverage on tax & ledger code), `e2e/` (Playwright),
`scripts/check-finance.mjs` (no float money, hard-coded rates or dates), `scripts/check-bundle.mjs`
(no secrets in `dist/`), oxlint. CI: `../.github/workflows/ci.yml`.

## Accounts, AR and AP
- **Accounts** (formerly "General ledger") — journals and account ledgers.
- **Accounts Receivable / Payable** are sub-ledgers computed live from the GL control accounts
  1100 (Trade receivables) and 2000 (Trade payables) — `src/lib/subledger.ts`. Each journal carries a `party`
  (customer/supplier); receipts and payments are allocated oldest-first. A reconciliation card proves
  sub-ledger total = GL balance. Receiving/paying posts a normal journal, so the GL, AR/AP, dashboard and
  reports all move together. Storage key bumped to `v2` (old browser data is reseeded).

## UI system
- Shared components in `src/components/ui.tsx`: `DataTable` (search, filter chips, sortable headers, pagination),
  `Field`/`Input`/`Select`/`Toggle`, accessible `Modal` (portal, focus trap, Esc), `Stat`, `Gauge`, `Ring`, `Sparkline`.
- Every page follows the same pattern: `PageHeader` (eyebrow + title + actions) → `KpiGrid` → charts → `DataTable`.
- ⌘K / Ctrl+K opens quick navigation. Browser back/forward works (hash routing).
- Responsive: sidebar becomes a drawer below 1024px; tables scroll inside their card.

## Arabic / RTL
- Toggle in the top bar, or open `/?lang=ar`. All UI text goes through `t()` (`src/lib/i18n.ts`) with Arabic strings
  in `src/lib/ar.ts` (draft — have a native finance reviewer check them). Charts, sparklines and the flow diagram
  mirror so time runs right-to-left. In dev, untranslated keys are listed in `window.__i18nMissing`.

## SEO & icons
`index.html` has description, Open Graph/Twitter cards, JSON-LD; `public/` holds the favicon (SVG + PNG),
apple-touch icon, PWA manifest, `og-image.png` and `robots.txt`. Add a canonical URL + hreflang once the domain is known.

## Where the logic lives
`src/lib/` — `ledger.ts` (posting + TB/P&L/BS), `posting.ts` (document → journal rules), `vat.ts` (VAT 201,
VAT helpers), `ct.ts` (CT bridge), `rules.ts` (TRN, default accounts, Art 59 checks, risk), `dates.ts`,
`einvoice.ts` (PINT AE), `config.ts` (versioned tax params).
Money is integer fils throughout. Items marked VERIFY need product-owner sign-off.
Accounts 6050/6060/6180 were added to the seed CoA for the POC.
