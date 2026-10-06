# TFS+ Smart Ledger — Delivery Plan & Tracker

> **This is the single source of truth for what we are building, in what order, and how we
> prove it is correct.** Claude Code updates it as work progresses. Faizan signs off phases.
> Supersedes `ROADMAP.md` and `tfs-smart-ledger/docs/ROADMAP.md` (kept for reference only).

| | |
|---|---|
| **Current phase** | Phase 0 — Setup & clean-up |
| **Overall status** | 🟡 In progress |
| **Last updated** | 2026-10-06 |
| **Next milestone** | Phase 0 sign-off |

**Status legend:** ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked · 🔍 Needs Faizan's check

---

## 1. Decisions (agreed)

| # | Decision | Date |
|---|---|---|
| D-01 | Stack is **Vercel + Supabase** only. **Claude is the development tool, not a feature** — the app has no AI. | 2026-10-06 |
| D-02 | Keep the existing POC screens (React + Vite in `poc/`) and make them dynamic — no rewrite. | 2026-10-06 |
| D-03 | Free tiers during development (Vercel Hobby, Supabase Free). | 2026-10-06 |
| D-04 | Development/pilot on Supabase Cloud (Singapore). Move to **self-hosted Supabase in the UAE** once the app is mature, before taking on clients at scale. | 2026-10-06 |
| D-05 | **English only** initially. Arabic later. | 2026-10-06 |
| D-06 | **Resend** for emails (alerts, deadline reminders, invitations). | 2026-10-06 |
| D-07 | Launch **firm-only** (TFS staff); client logins added at pilot (Phase 3). | 2026-10-06 |
| D-08 | Correctness gates in section 3 are mandatory — no release skips them. | 2026-10-06 |
| D-09 | Database is the referee: balancing, immutability, period locks and access rules are enforced **inside Supabase**, not only on screen. | 2026-10-06 |
| D-10 | **VAT 201 emirate boxes (1a–1g):** the user **selects the emirate manually on each sales invoice**. The field is pre-filled with the client's head-office emirate and can be changed; there is no automatic allocation by establishment. Changes are audit-logged. *(Answers Q-04; revised 2026-10-06.)* | 2026-10-06 |
| D-11 | **Customer overpayments** are held as a **Customer Credit** — a liability (IAS 1 / IFRS 15: payable to the customer or contract liability) — until applied to a future invoice or refunded. Details in §2.1. *(Answers Q-05.)* | 2026-10-06 |
| D-12 | **FTA display format:** every VAT 201 box (amount, VAT and adjustment columns) and every figure in tax return packs shows **0.00** when there is no value — never blank, a dash or hidden. Applies on screen, in Excel/PDF exports and in frozen snapshots. | 2026-10-06 |

## 2. Open questions (for Faizan)

| # | Question | Needed by | Status |
|---|---|---|---|
| Q-01 | Which 3–5 pilot clients? (simple books, friendly) | Phase 2 | ⬜ |
| Q-02 | Which ASP partner for e-invoicing? | Phase 4 (shortlist by Dec 2026) | ⬜ |
| Q-03 | OK to pay for a short independent security review before real client data? (recommended) | Phase 3 | ⬜ |
| Q-04 | VAT 201 emirate boxes (1a–1g): allocate by **our client's establishment** or by **customer location**? → **Decided: emirate selected manually per invoice, pre-filled with head office (D-10).** | Phase 3 | ✅ |
| Q-05 | Customer overpayments: hold as "customer credit" on account, or refund only? → **Decided: Customer Credit by default + refund option (D-11, §2.1).** | Phase 2 | ✅ |
| Q-06 | Provide 3–5 real, anonymised worked examples (one VAT quarter, one CT computation) to become the golden test set. | Phase 1 | ⬜ |
| Q-07 | Confirm every tax setting marked **VERIFY** in `poc/src/lib/config.ts` (VAT return due days, Art 59 threshold, SBR end date, e-invoicing dates). | Phase 3 | 🔍 |
| Q-08 | Confirm the legal reference for the VAT treatment of advances in §2.1 (date-of-supply rules — Decree-Law Art 25–26 or the Executive Regulation?). The rule itself is agreed; only the citation shown in the app needs confirming. | Phase 2 | 🔍 |

### 2.1 Customer overpayments & credits — agreed rule (D-11)

**Accounting entries**
- **Overpayment received:** Dr Bank / Cr **Customer Credits** (a separate liability account, shown under liabilities — not netted against receivables).
- **Applied to a future invoice:** the invoice posts as normal (Dr Receivables / Cr Revenue / Cr Output VAT), then the credit is applied: Dr Customer Credits / Cr Receivables. Net effect equals Dr Customer Credits / Cr Revenue / Cr Output VAT, while keeping the invoice and AR ageing traceable.
- **Refund:** Dr Customer Credits / Cr Bank (one-click refund from the customer's credit balance).

**VAT**
- A plain overpayment on account is **outside VAT** until it is applied to an invoice.
- If the payment is an **advance against a specific taxable supply**, or an advance tax invoice is issued, output VAT is due on receipt (VAT = receipt × 5/105). Citation to confirm under Q-08.

**Automation (rule-based — no AI, per D-01)**
- **Auto-apply:** unapplied credits are automatically matched to the same customer's open invoices, oldest first. Every application is audit-logged and can be reversed.
- **Refund workflow:** one-click refund posting against the credit balance, subject to maker-checker approval.

---

## 3. Quality gates — "Definition of Done" for every change

Nothing reaches the live site unless **all** of these pass. Claude runs 1–6 automatically; Faizan does 7.

| # | Gate | Tool | Pass rule |
|---|---|---|---|
| G-1 | Type check | `tsc --noEmit` (strict) | 0 errors |
| G-2 | Lint | ESLint (typescript-eslint + react-hooks) | 0 errors, 0 warnings |
| G-3 | Finance lint | `npm run check:finance` (custom script, see 3.1) | 0 findings |
| G-4 | Unit tests | Vitest | 100% pass; tax & ledger logic ≥ 95% line coverage |
| G-5 | Database tests | Vitest against the **Test** Supabase project (RLS, triggers, posting functions) | 100% pass |
| G-6 | Supabase advisors | Security + performance advisors | 0 errors, 0 warnings |
| G-7 | End-to-end smoke | Playwright: log in → invoice → post → TB → VAT box | 100% pass |
| G-8 | Human check | Faizan reviews the Vercel **preview link** and ticks 🔍 items | Signed off |

### 3.1 Finance lint rules (`check:finance`)
- No floating-point money: no `parseFloat`, `toFixed`, `* 1.05`, `/ 1.05` in calculation code; amounts are whole fils (integers).
- No hard-coded tax rates or thresholds outside `config` (e.g. `500` bp, `0.05`, `375000`).
- No hard-coded business dates (e.g. `"2026-09-30"`) outside seed/test files.
- Every table has `organization_id` + RLS enabled (checked via Supabase advisors).
- No `delete`/`update` on posted journals or audit rows anywhere in app code.

### 3.2 How a change flows
1. Claude makes the change on a branch and runs G-1 → G-7.
2. Push to GitHub → **GitHub Actions** re-runs the checks → **Vercel** builds a private preview link.
3. Faizan opens the preview and checks the numbers (G-8).
4. Merge → Vercel deploys to the live URL. Database changes are applied as numbered migration files in `supabase/migrations/`, Test project first, then Live.

---

## 4. Roles

| Role | Who | Can | Cannot | From |
|---|---|---|---|---|
| **Firm Admin** | Faizan / partners | Everything: clients, users, approve, lock/reopen periods, finalise returns | Approve own entries | Phase 1 |
| **Firm Accountant** | TFS staff | Prepare entries & documents, draft VAT/CT | Approve, lock, finalise | Phase 1 |
| **Client Owner** | Client director | View own company, approve own bills | See other clients, touch locked periods | Phase 3 |
| **Client Staff** | Client finance person | Upload bills, raise sales invoices | Approve | Phase 3 |
| **Read-only** | Auditor / viewer | View reports within an access window | Change anything | Phase 3 |

**Maker-checker:** the preparer of an entry or return can never approve it — enforced by the database.

---

## 5. Phases, to-dos and exit criteria

Target dates assume Claude builds and Faizan reviews within 2–3 working days per preview.

### Phase 0 — Setup & clean-up · 🟡 In progress · target 16 Oct 2026
- [x] Connect local folder to GitHub repo
- [x] Run POC locally (`http://localhost:5180`)
- [x] Supabase MCP (`supabase-tax`) configured and authenticated
- [x] Project skills installed (Supabase, Postgres, Vercel/React, design, web testing)
- [x] Plan agreed and written (this file)
- [x] Update `CLAUDE.md` to the new stack and decisions
- [ ] Drop the 7 leftover tables + 2 functions created on 2026-10-06 in Supabase
- [ ] Rename local folder to remove `&` (breaks Windows tooling) — e.g. `Ai Accounting and Tax system`
- [ ] Move useful docs (`PRD.md`, `UAE_COMPLIANCE_RULES.md`) to `/docs`; archive the unused `tfs-smart-ledger/` scaffold
- [ ] Add tooling: ESLint, Vitest, Playwright, `check:finance`, GitHub Actions workflow
- [ ] Write unit tests for the **existing** POC logic (VAT, CT, ledger) — fixes found become Phase 1 items
- [ ] Remove AI features from the UI: "Ask your books", simulated OCR, "AI" badges/insights (keep rule-based checks, relabelled)
- [ ] Fix known POC defects: fixed date `2026-09-30` on receipts/payments/reversals; hard-coded 5% in reverse charge and bank split; VAT emirate box taken silently from the customer — replace with an editable emirate field on the invoice (D-10)
- [ ] Create Resend account (Faizan) and verify sending domain

**Exit:** all tooling runs green on the current code; Faizan has supplied Q-06 examples.

### Phase 1 — Foundation: logins, clients, ledger core · ⬜ · target 6 Nov 2026
- [ ] Database schema v1 (migrations): firms, organizations (with head-office emirate), memberships/roles, chart of accounts, periods, journals, journal lines, tax settings table, audit log
- [ ] Database guards: balance check, no debit+credit on one line, whole fils, no edit/delete of posted journals (reverse only), period lock, maker-checker
- [ ] Row-Level Security on every table; firm users see clients via explicit access grant
- [ ] Supabase Auth: invite-only, email + password, **MFA required** for firm users
- [ ] Posting through database functions only (one transaction, all-or-nothing)
- [ ] App reads/writes Supabase instead of browser storage; remove demo role-switcher; remove Basic Auth middleware once logins exist
- [ ] Seed: TFS Plus firm, UAE SME chart of accounts, 1 demo client (Test project only)
- [ ] Audit log: append-only, every post/approve/reverse/lock recorded
- [ ] Manual journals screen + approval queue
- [ ] Test cases **LED-*** and **SEC-*** passing (section 6)

**Exit:** all LED/SEC tests green; Faizan can log in, create a client, post and approve journals, and cannot break the rules on purpose.

### Phase 2 — Daily bookkeeping · ⬜ · target 11 Dec 2026
- [ ] Customers & suppliers (with TRN validation)
- [ ] Sales invoices + credit notes → auto-posting
- [ ] Purchase bills (manual entry + attach PDF/photo to Supabase Storage) + debit notes
- [ ] Receipts & payments, allocation to invoices/bills; AR/AP ageing
- [ ] Customer Credits (D-11, §2.1): overpayments to a liability account; auto-apply to the customer's open invoices (oldest first); one-click refund with approval; advance against a specific supply triggers output VAT on receipt
- [ ] Bank statement upload (CSV/Excel), duplicate detection, rule-based matching, reconciliation
- [ ] Reports: Trial Balance, General Ledger, P&L, Balance Sheet, AR/AP ageing — screen + Excel/PDF export
- [ ] Nightly integrity checks (Supabase cron): TB balances; AR/AP = control accounts; bank reconciled; results to an "Integrity" page
- [ ] Test cases **ARAP-***, **BANK-***, **RPT-*** passing

**Exit:** one pilot client's real past quarter re-keyed; Trial Balance agrees with their existing books **to the fils**.

### Phase 3 — VAT, alerts & pilot launch · ⬜ · target 15 Jan 2027
- [ ] Tax codes on every line; VAT 201 with drill-down to transactions
- [ ] Emirate field on each sales invoice, chosen by the user, pre-filled with head-office emirate (D-10); boxes 1a–1g follow the chosen emirate
- [ ] VAT return workflow: draft → review → approve (maker-checker) → **frozen snapshot** → period locked
- [ ] VAT reconciliation: return = movement on VAT accounts
- [ ] All VAT 201 boxes always listed; empty values shown as **0.00** (D-12) on screen, exports and snapshots
- [ ] Add boxes missing from the POC: **2** (tax refunds to tourists), **6** (goods imported into the UAE), **7** (adjustments to goods imported)
- [ ] Compliance calendar (VAT, CT, licence expiry)
- [ ] Email alerts via Resend (deadlines, integrity failures, approvals waiting) — daily Vercel cron
- [ ] Client logins: Client Owner, Client Staff, Read-only
- [ ] Firm overview dashboard on live data
- [ ] Independent security review (Q-03) and fixes
- [ ] Test cases **VAT-*** passing
- [ ] Go-live checklist (section 7) complete for pilot

**Exit:** one full VAT quarter per pilot client agrees to Faizan's manual workings. **Pilot live with 3–5 clients.**

### Phase 4 — E-invoicing · ⬜ · target 30 Apr 2027 (SME deadline 1 Jul 2027 — VERIFY)
- [ ] ASP partner chosen (Q-02); sandbox credentials
- [ ] PINT AE invoice & credit note generation + validation
- [ ] Send via ASP (Vercel function), status tracking, rejection queue, retry
- [ ] Store XML + ASP receipts; inbound e-invoices → draft bills
- [ ] Test cases **EINV-*** passing in ASP sandbox

**Exit:** all invoice scenarios pass in the ASP sandbox; pilot clients transmitting live before the deadline.

### Phase 5 — Corporate Tax & year-end · ⬜ · target 31 Jul 2027 (FY2026 returns due 30 Sep 2027)
- [ ] Fixed asset register + depreciation
- [ ] Year-end close: accruals/prepayments, closing entries, retained earnings roll-forward
- [ ] CT computation: add-backs, SBR / standard regime gates, loss carry-forward (75% cap), CT payable, due dates
- [ ] CT return pack (Excel/PDF) with drill-down and legal references
- [ ] Financial statements pack (IFRS for SMEs)
- [ ] Test cases **CT-*** passing

**Exit:** FY2026 CT for pilot clients matches Faizan's manual computation.

### Phase 6 — Production hardening & UAE hosting · ⬜ · before scaling beyond pilot
- [ ] Self-hosted Supabase in a UAE data centre; migrate data; verify row counts and TB per client match before/after
- [ ] Automated encrypted backups + **monthly restore test**
- [ ] Upgrade Vercel to Pro (Hobby is for non-commercial use)
- [ ] Penetration test; fix high/critical findings
- [ ] Arabic UI & bilingual tax invoices
- [ ] FTA Tax Accounting Software registration (later)

---

## 6. Test case catalogue

Expected values are in AED. Rounding rule: **half-up to 2 dp at line level** for VAT.
Type: **U** = unit (Vitest), **D** = database (Test project), **E** = end-to-end (Playwright).
Cases marked 🔍 need Faizan to confirm the expected answer.

### 6.1 Ledger (LED)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| LED-01 | Dr Rent 1,000 / Cr Bank 1,000 | Posts | D | ⬜ |
| LED-02 | Dr 1,000.00 / Cr 999.99 | Rejected by database (also via direct SQL) | D | ⬜ |
| LED-03 | One line with both debit and credit | Rejected | D | ⬜ |
| LED-04 | Negative amount | Rejected | D | ⬜ |
| LED-05 | Single-line journal | Rejected | D | ⬜ |
| LED-06 | Amount 10.005 (fraction of a fils) | Rejected | U+D | ⬜ |
| LED-07 | Edit a posted journal | Rejected | D | ⬜ |
| LED-08 | Delete a posted journal | Rejected | D | ⬜ |
| LED-09 | Reverse a posted journal | Mirror entry created with today's date; net effect 0; original marked reversed | D | ⬜ |
| LED-10 | Post into a locked period | Rejected | D | ⬜ |
| LED-11 | Firm Admin reopens a period | Allowed; audit entry with reason | D | ⬜ |
| LED-12 | Unknown or inactive account | Rejected | D | ⬜ |
| LED-13 | 1,000 random valid journals | TB total debits = total credits (property test) | U | ⬜ |
| LED-14 | Every post/approve/reverse/lock | Audit row written; audit rows cannot be edited or deleted | D | ⬜ |

### 6.2 Security & access (SEC)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| SEC-01 | Not logged in, call any table | 0 rows / denied | D | ⬜ |
| SEC-02 | User of Client A reads Client B | 0 rows | D | ⬜ |
| SEC-03 | Firm user without access grant to a client | 0 rows | D | ⬜ |
| SEC-04 | Firm Accountant approves an entry | Rejected | D | ⬜ |
| SEC-05 | Firm Admin approves **own** entry | Rejected (maker-checker) | D | ⬜ |
| SEC-06 | Read-only user inserts a journal | Rejected | D | ⬜ |
| SEC-07 | Read-only access past its end date | Denied | D | ⬜ |
| SEC-08 | Public sign-up attempt | Not possible (invite only) | E | ⬜ |
| SEC-09 | Firm user logs in without MFA | Blocked until MFA set up | E | ⬜ |
| SEC-10 | Supabase secret key appears in browser bundle | Never (build check) | U | ⬜ |

### 6.3 Receivables & payables (ARAP)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| ARAP-01 | Invoice 10,000 + VAT 500, receipt 4,000 | Open balance 6,500; ageing by due date | D | ⬜ |
| ARAP-02 | AR sub-ledger total vs GL 1100 | Always equal | D | ⬜ |
| ARAP-03 | AP sub-ledger total vs GL 2000 | Always equal | D | ⬜ |
| ARAP-04 | Credit note 2,000 + VAT 100 against ARAP-01 invoice | Open balance 4,400; VAT reduced by 100 | D | ⬜ |
| ARAP-05 | Invoice 10,500 (incl. VAT 500); customer pays 11,000 | Invoice settled; Dr Bank 11,000 / Cr Receivables 10,500 / Cr Customer Credits 500; no VAT on the 500 | D | ⬜ |
| ARAP-06 | Duplicate supplier bill (same supplier + bill no.) | Blocked | D | ⬜ |
| ARAP-07 | Invalid TRN format (not 15 digits starting 1) | Warning; input VAT not recoverable | U | ⬜ |
| ARAP-08 | Customer Credit 500, then new invoice 2,100 (incl. VAT 100) for the same customer | Auto-applied: Dr Customer Credits 500 / Cr Receivables 500; invoice open 1,600; audit entry written | D | ⬜ |
| ARAP-09 | Credits auto-apply across two open invoices | Oldest invoice settled first; never applied to another customer | D | ⬜ |
| ARAP-10 | Refund a credit of 500 | Dr Customer Credits 500 / Cr Bank 500; needs approval by someone other than the preparer | D | ⬜ |
| ARAP-11 | Refund more than the credit balance | Rejected | D | ⬜ |
| ARAP-12 | Balance sheet presentation | Customer Credits shown under liabilities, not netted against receivables | D | ⬜ |

### 6.4 Bank (BANK)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| BANK-01 | Same statement uploaded twice | Duplicates detected, not imported twice | D | ⬜ |
| BANK-02 | Auto-match: equal amount within ±5 days | Matched one-to-one; never one journal to two lines | U | ⬜ |
| BANK-03 | Reconciliation at month-end | Book balance + reconciling items = statement balance | D | ⬜ |

### 6.5 VAT (VAT) — 5% standard rate
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| VAT-01 | Standard-rated sale, net 10,000 | Box 1(emirate) 10,000 / VAT 500 | U+D | ⬜ |
| VAT-02 | Abu Dhabi client; user selects **Dubai** on a net 10,000 invoice | Box 1b (Dubai): 10,000 / 500; change recorded in audit log | U | ⬜ |
| VAT-02b | Emirate field left as pre-filled | Allocated to head-office emirate box | U | ⬜ |
| VAT-03 | Zero-rated export of goods 20,000 | Box 4: 20,000 / VAT 0 | U | ⬜ |
| VAT-04 | Exempt supply 8,000 | Box 5: 8,000 | U | ⬜ |
| VAT-05 | Imported service (reverse charge) 6,000 | Box 3: 6,000 / 300 **and** Box 10: 6,000 / 300; net effect 0 | U | ⬜ |
| VAT-06 | Standard-rated expense 25,000 + 1,250 with valid tax invoice | Box 9: 25,000 / 1,250 | U | ⬜ |
| VAT-07 | Client entertainment 3,800 + 190 | Not in Box 9; expense 3,990; VAT blocked | U | ⬜ |
| VAT-08 | Bill with VAT but supplier has no TRN | VAT not recoverable; full amount expensed | U | ⬜ |
| VAT-09 | Rounding: 3 lines × 33.33 | Line VAT 1.67 each; total VAT 5.01 | U | 🔍 |
| VAT-10 | Credit note 2,000 against VAT-01 | Box 1: 8,000 / 400 | U+D | ⬜ |
| VAT-11 | Box 14 | = Box 12 − Box 13 (positive = payable, negative = refundable) | U | ⬜ |
| VAT-12 | Quarter Oct–Dec 2026 | Due 28 Jan 2027 | U | ⬜ |
| VAT-13 | Return approved | Snapshot frozen; period locked; later posting rejected | D | ⬜ |
| VAT-14 | Reconciliation | Output VAT on return = movement on VAT output account | D | ⬜ |
| VAT-15 | Golden set from Faizan (Q-06) | Every box matches manual working to the fils | U | ⬜ |
| VAT-16 | Plain overpayment of 500 on account | Not in any VAT box until applied to an invoice | U | ⬜ |
| VAT-18 | Quarter with no zero-rated, exempt or reverse-charge activity | Boxes 2, 3, 4, 5, 6, 7, 10 and every unused emirate box shown as 0.00 / 0.00 — none blank or hidden | U+E | ⬜ |
| VAT-17 | Advance of 10,500 received against a specific taxable supply | Output VAT 500 (10,500 × 5/105) in the period of receipt | U | 🔍 |

### 6.6 Corporate Tax (CT) — 9% above AED 375,000
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| CT-01 | Taxable income 375,000 | CT 0 | U | ⬜ |
| CT-02 | Taxable income 1,000,000 | CT 56,250 | U | ⬜ |
| CT-03 | Entertainment expense 10,000 | Add-back 5,000 | U | ⬜ |
| CT-04 | Fines 1,500; donation to non-qualifying body 5,000 | Add-backs 1,500 and 5,000 | U | ⬜ |
| CT-05 | Accounting loss 200,000 | CT 0; loss 200,000 carried forward | U | ⬜ |
| CT-06 | Loss b/f 500,000, taxable income 2,000,000 | Offset 500,000 (cap 1,500,000) → 1,500,000 → CT 101,250 | U | ⬜ |
| CT-07 | Loss b/f 1,000,000, taxable income 800,000 | Offset capped at 600,000 → 200,000 → CT 0; 400,000 c/f | U | ⬜ |
| CT-08 | SBR: revenue 3,000,000 this and prior periods, period within SBR window | Eligible; taxable income nil | U | 🔍 |
| CT-09 | SBR: revenue 3,000,001 | Not eligible → standard computation | U | ⬜ |
| CT-10 | FY ending 31 Dec 2026 | Return & payment due 30 Sep 2027 | U | ⬜ |
| CT-11 | Golden set from Faizan (Q-06) | Matches manual computation to the fils | U | ⬜ |

### 6.7 Reports (RPT)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| RPT-01 | Balance sheet | Assets = Liabilities + Equity (+ current-year profit) | D | ⬜ |
| RPT-02 | Year-end close | P&L net profit moves to retained earnings; P&L accounts zero | D | ⬜ |
| RPT-03 | Excel/PDF export | Totals equal on-screen totals | E | ⬜ |
| RPT-04 | Drill-down from any report figure | Lists exactly the journals that make it up | E | ⬜ |

### 6.8 E-invoicing (EINV) — detailed once ASP is chosen
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| EINV-01 | Standard tax invoice | Passes PINT AE validation; accepted in sandbox | E | ⬜ |
| EINV-02 | Credit note | Accepted; references original invoice | E | ⬜ |
| EINV-03 | Zero-rated export, exempt, reverse charge, foreign currency | Each accepted | E | ⬜ |
| EINV-04 | Rejected by ASP | Appears in rejection queue with reason; can correct & resend | E | ⬜ |
| EINV-05 | Same invoice sent twice | Sent once (no duplicate transmission) | D | ⬜ |

---

## 7. Go-live checklist (pilot)

- [ ] All quality gates G-1 → G-8 green on the release
- [ ] All LED, SEC, ARAP, BANK, VAT, RPT tests green; all 🔍 cases confirmed by Faizan
- [ ] Parallel-run results signed off for each pilot client
- [ ] Separate **Live** Supabase project (never used for testing); Test project holds dummy data only
- [ ] Backups confirmed (Supabase Free has no automatic backups → upgrade or scheduled export before real data)
- [ ] Supabase Free projects pause after inactivity → confirm plan for pilot uptime
- [ ] MFA on for all firm users; public sign-up off
- [ ] Security review done, high/critical findings fixed
- [ ] Pilot clients' engagement letters cover data hosting outside the UAE until Phase 6
- [ ] Resend domain verified; test alert received

---

## 8. Change log

| Date | Change |
|---|---|
| 2026-10-06 | Plan created. Decisions D-01 → D-09 agreed. Phase 0 started. |
| 2026-10-06 | Faizan's amendments: Q-04 → D-10 (emirate by supplying branch); Q-05 → D-11 (Customer Credits + refund, §2.1). Added Q-08, to-dos in Phases 0–3, tests ARAP-05/08–12, VAT-02/02b/16/17. |
| 2026-10-06 | POC demo data: each client now has a zero-rated export, an exempt residential sublease and a reverse-charge imported service every quarter, so VAT boxes 3, 4, 5 and 10 show figures. |
| 2026-10-06 | D-12 added: empty VAT/tax figures shown as 0.00 (FTA format). POC VAT page fixed (dash → 0.00); test VAT-18 added. |
| 2026-10-06 | D-10 revised: emirate chosen manually on each invoice (pre-filled with head office); no automatic allocation by establishment; branches table dropped from Phase 1. |
