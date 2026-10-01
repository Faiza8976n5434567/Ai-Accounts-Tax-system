# TFS+ Smart Ledger — POC

Clickable proof-of-concept of the AI-native UAE accounting, VAT, CT and e-invoicing platform
(see `../tfs-smart-ledger/docs`). No backend or database: all data lives in the browser's
localStorage and is seeded with 3 demo clients (Jan–Sep 2026).

```
npm install
npm run dev      # http://localhost:5180
```

## Demo script (5 min)
1. **Firm overview** (Partner – Faizan): all clients, VAT due, risk flags, deadline heat-map, workload.
2. Click **Al Noor** → dashboard with an AI CFO insight explaining why profit fell (computed from the ledger).
3. **Capture invoices** → "Uber trip": extracted → Art 59 checks → low risk → auto-approved & posted.
   Then "Client dinner": VAT blocked + CT 50% → goes to approval → maker-checker blocks Faizan →
   switch role to **Client Owner** → approve. Try "Uber" again → duplicate detected.
   "Wrong VAT + no TRN" → high risk. "Google Ads (foreign)" → reverse charge.
4. **VAT 201** → boxes update; click any box to drill down to journals.
5. **Corporate tax** → bridge with legal references; switch regime to SBR.
6. **Sales & e-invoicing** → new tax invoice (export → zero-rating hint) → PINT AE XML → transmit (sandbox 5-corner).
7. **Bank reconciliation** → Auto-match, then post the AI-suggested lines.
8. **Ask your books**, **Arabic/RTL toggle**, **Audit trail**, **Settings** (auto-approve thresholds, backup/restore).

## What is simulated
- OCR / extraction: picked from sample invoices by file name (try `rent.pdf`, `laptop.jpg`).
- "AI" classification & Q&A: deterministic keyword rules — swap for Claude API calls in `src/lib/ai.ts`.
- ASP transmission: timed status updates; no network.

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
`src/lib/` — `ledger.ts` (posting + TB/P&L/BS), `vat.ts` (VAT 201), `ct.ts` (CT bridge), `ai.ts`
(classifier, Art 59 checks, risk, Q&A), `einvoice.ts` (PINT AE), `config.ts` (versioned tax params).
Money is integer fils throughout. Items marked VERIFY need product-owner sign-off.
Accounts 6050/6060/6180 were added to the seed CoA for the POC.
