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

## Where the logic lives
`src/lib/` — `ledger.ts` (posting + TB/P&L/BS), `vat.ts` (VAT 201), `ct.ts` (CT bridge), `ai.ts`
(classifier, Art 59 checks, risk, Q&A), `einvoice.ts` (PINT AE), `config.ts` (versioned tax params).
Money is integer fils throughout. Items marked VERIFY need product-owner sign-off.
Accounts 6050/6060/6180 were added to the seed CoA for the POC.
