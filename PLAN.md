# TFS+ Smart Ledger — Delivery Plan & Tracker

> **This is the single source of truth for what we are building, in what order, and how we
> prove it is correct.** Claude Code updates it as work progresses. Faizan signs off phases.
> Supersedes the old roadmaps (kept in `docs/archive/` for reference only).
> **Specs:** [docs/specs](docs/specs/README.md) · **Your to-dos:** [docs/OWNER-ACTIONS.md](docs/OWNER-ACTIONS.md) · **Branch:** `faizan`

| | |
|---|---|
| **Current phase** | Phase 2 — Daily bookkeeping (Phase 1 ✅ approved 2026-10-07) |
| **Overall status** | 🟡 In progress |
| **Last updated** | 2026-10-07 |
| **Next milestone** | P2-01 customers & suppliers → P2-02 sales invoices |

**Status legend:** ⏸ Deferred · ⬜ Not started · 🟡 In progress (for tests: written and passing locally, awaiting CI) · ✅ Done · ⛔ Blocked · 🔍 Needs Faizan's check

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
| D-13 | **Spec-first delivery:** every feature is specified in `docs/specs/` and approved before it is coded; tests come from the spec. *(Approved 2026-10-06.)* | 2026-10-06 |
| D-14 | **Six roles**; Super Admin is a flag on top of Firm Admin; permission matrix fixed in code, not editable in the UI ([Spec 02](docs/specs/02-roles-rbac.md)). *(Approved 2026-10-06.)* | 2026-10-06 |
| D-15 | **Formulas:** the numbers in formulas (rates, thresholds, days, %, box mapping) are editable by Super Admin, versioned with effective dates; formula logic stays in tested code ([Spec 03](docs/specs/03-configuration-and-formulas.md)). *(Approved 2026-10-06.)* | 2026-10-06 |
| D-16 | **Scope simplifications** per [Spec 05](docs/specs/05-scope-and-simplifications.md) (e.g. one Excel import template, AED books in v1, one ASP first, no direct EmaraTax filing). *(Approved 2026-10-06.)* | 2026-10-06 |
| D-17 | **Invites and alert emails** are sent by the app through Resend using templates editable in the Admin area; password-reset emails go through Supabase via Resend SMTP. *(Approved 2026-10-06.)* | 2026-10-06 |
| D-18 | **One Supabase project** (`mmsdgyvaxxsyzsowongx`) — used for development now and **becomes production** once mature; no separate Live project. To keep testing safe, automated database tests run on a **temporary Supabase started inside GitHub Actions** (deleted after each run). Before go-live the project is cleaned of demo/test data (P3-12). | 2026-10-06 |
| D-19 | Current web address: **https://ai-accounts-tax-system.vercel.app** (Vercel). Own domain later (Q-13). | 2026-10-06 |
| D-20 | **Platform owner = TFS Plus.** TFS Plus founds and runs the platform (Super Admins are TFS Plus staff only). **Other tax firms can become customers** of the platform, each with its own Firm Admins, staff and clients, fully separated from each other. Super Admins manage the platform but **cannot see another firm's client data** unless that firm grants time-limited, logged support access. The app name may change, so it is a setting, never hard-coded. *(Answers Q-09.)* | 2026-10-06 |
| D-21 | **Currencies: AED and USD.** Books, reports and returns are in AED. USD documents convert at the fixed rate **1 USD = 3.6725 AED** (editable, versioned parameter `fx.usd_aed`). Each line is converted to AED first, then VAT is calculated on the AED amount. *(Answers Q-11.)* | 2026-10-06 |
| D-22 | **Document numbers show year and month, with one running counter that never restarts**, e.g. if January ends at `INV-2026-01-0100`, February starts at `INV-2026-02-0101`. Counter per client and document type, gap-free, assigned when a document is posted; year-month comes from the document date. Same pattern for credit notes (`CN-`), receipts (`RCPT-`), payments (`PAY-`) and journals (`JV-`). Format is a setting. *(Answers Q-14 and Q-17; revised 2026-10-06.)* | 2026-10-06 |
| D-23 | **Tax-rule changes:** no backup Super Admin for now, so Faizan approves alone with a written reason (audit-logged). The two-person rule switches on automatically when a second Super Admin is added. *(Answers Q-10, Q-16.)* | 2026-10-06 |
| D-24 | Email sender: **`onboarding@resend.dev`** (Resend's default address) for now. It delivers only to the Resend account owner's email, so staff invites also get a **"Copy invite link"** button that you can send yourself (WhatsApp/Outlook). Own domain later (OA-09). *(Answers Q-13, Q-19.)* | 2026-10-06 |
| D-26 | **Reversing a posted journal needs a second person:** a Firm Admin *requests* the reversal (reason required); it waits as a pending mirror journal that nobody can edit; a **different** Firm Admin approves it, which posts it and marks the original reversed. The request can be cancelled. *(Answers Q-21.)* | 2026-10-07 |
| D-27 | **Bank account (1010) is a control account:** manual journals cannot post to it; bank entries come from the bank module, opening balances from the opening journal. *(Answers Q-22, confirms Spec 01.)* | 2026-10-07 |
| D-28 | **Reports before year-end closing:** until a year-end closing journal exists (Phase 5), reports roll earlier financial years' income and expense balances into **Retained earnings** automatically (Xero/QuickBooks style); P&L accounts show only the current year. The ledger itself is never changed. Built with the Phase 2 reports (P2-06). *(Answers Q-24.)* | 2026-10-07 |
| D-29 | **Tax date of a sales invoice = the invoice date**: the books and the VAT 201 period both use the invoice (issue) date. The supply date is printed on the invoice; the app warns when the supply date falls in an earlier VAT period or the invoice is issued more than `vat.invoice_issue_days` (14) after supply (Art 67). | 2026-10-07 |
| D-30 | **Credit notes can never exceed what is left on the original invoice** (net and VAT, counting earlier credit notes). Enforced by the database. | 2026-10-07 |
| D-31 | **Tax date of a purchase bill = the supplier's invoice date** (books and VAT 201 period), like D-29 for sales. | 2026-10-07 |
| D-32 | **Input VAT recoverability follows the checks:** VAT is automatically *not* recovered (added to the expense) when the supplier has no valid TRN, an unregistered supplier charges VAT, or the 'Tax Invoice' heading is missing. The **approver may override** with a written reason (audit-logged). Lines with the Blocked code (e.g. entertainment, Art 53) are never recoverable. | 2026-10-07 |
| D-33 | **VAT on bills is always recalculated** at the rate in force (half-up per line), like sales; the supplier's printed VAT is not used. Small differences to the supplier's total are settled at payment (P2-04). | 2026-10-07 |
| D-34 | **Small differences and bank charges on receipts/payments:** differences up to **AED 1.00** (firm setting `small_difference_limit`) post automatically to **6190 Rounding & small differences** so the invoice/bill closes; a **bank charges** box on receipts and payments posts to **6400 Bank charges**. Bigger differences stay open (or become a customer credit / supplier advance when overpaid). | 2026-10-07 |
| D-35 | **Advances with VAT deferred:** until the VAT 201 work, every unallocated receipt is a plain Customer Credit, outside VAT. The advance-for-a-specific-supply treatment (5/105, §2.1) is built with the VAT return, together with Q-08. | 2026-10-07 |
| D-36 | **Supplier overpayments and prepayments** are held as **Supplier advances** (new asset account 1160), shown separately, automatically applied to the same supplier's next bills (oldest first) or refunded by the supplier — the mirror of D-11. | 2026-10-07 |
| D-37 | **Realised exchange differences** (if the USD rate changed between a document and its payment) post to new accounts **4310 Exchange gains / 6410 Exchange losses** (IAS 21). A USD payment that exactly matches the USD total still clears the AED total in full (FX-03). Receipts and payments settle documents in their own currency only. | 2026-10-07 |
| D-38 | **Bank statement upload:** the bank's own CSV/Excel file; the first time, the user maps the columns (date, description, money in/out or signed amount, balance); the mapping is remembered per bank account. | 2026-10-08 |
| D-39 | **Bank lines that are not receipts/payments** (bank charges, salaries, transfers, drawings) are posted from the bank line to a chosen account as a journal approved by a second person — **no VAT is claimed from a bank line**; anything with recoverable VAT is entered as a bill so the D-32 checks apply. | 2026-10-08 |
| D-40 | **Undo a posted receipt/payment** = reversal with approval (as D-26): one person requests with a reason, a second approves; the settled invoices/bills reopen. Refused while its credit/advance has been used or refunded, or while it is matched to a bank line. | 2026-10-08 |
| D-41 | **Month-end bank reconciliation** is saved by the preparer when book balance + reconciling items = statement balance, approved by a second person, then frozen (snapshot of the items); matches dated on or before an approved reconciliation can no longer change. | 2026-10-08 |
| D-42 | **Import of goods:** new bill tax code **IMG** (import of goods, reverse charge 5%) → VAT 201 **Box 6** and **Box 10**, self-assessed like RCS; RCS stays for imported services (Box 3 + 10). Box 7 is a manual entry. | 2026-10-08 |
| D-43 | **Manual VAT entries** only on the adjustment column of Boxes 1a–1g and 9 and on Boxes 2 and 7, each with a mandatory reason (optional legal reference); the approver sees them; they are part of the frozen snapshot. Nothing else is calculated automatically. | 2026-10-08 |
| D-44 | **After VAT approval** the quarter's accounting periods are locked. A Firm Admin may reopen one with a reason; VAT documents posted into it afterwards appear in the **next** return as prior-period items for the preparer to review (the approved return stays frozen). Correction in the next return vs voluntary disclosure stays Faizan's call. | 2026-10-08 |
| D-45 | **VAT Boxes 12/13 include adjustments:** Box 12 = Box 8 VAT + Box 8 adjustment; Box 13 = Box 11 VAT + Box 11 adjustment (Spec 03 F-04 updated). | 2026-10-08 |
| D-46 | **Full tax invoice check on bills:** above `vat.full_invoice_threshold` (AED 10,000, VERIFY) the preparer ticks "shows our name, address and TRN"; if not ticked → **warning** (risk +10), input VAT is not stopped automatically — the approver decides. Compared amount: supplier's total (net + VAT charged). The FTA Audit File (FAF) export waits (Faizan: later). | 2026-10-08 |
| D-47 | **VAT clearing on approval:** approving a return posts one journal (source `vat`, dated the quarter end, preparer → approver) that empties 2100, 2110, 1300 and 1310 into new account **2120 VAT payable to / refundable by FTA** (not a control account, so the FTA payment/refund is posted from the bank line). It clears the whole balance at the quarter end (sweeping up late D-44 items and opening VAT balances). Manual return adjustments (D-43) are listed in the reconciliation for the accountant to book against 2120. | 2026-10-08 |
| D-48 | **Two-factor sign-in for every user**, client users included (R6 widened); the database refuses any request without it. | 2026-10-08 |
| D-49 | **Read-only access** (e.g. auditors): end date pre-filled 90 days ahead, at most 1 year ahead (firm settings `read_only_default_days`, `read_only_max_days`); access stops automatically after it (R5). | 2026-10-08 |
| D-50 | **Deadline reminders** (14 / 7 / 1 days before, firm setting) go to the client's firm staff (assigned Firm Accountants + Manager, or the Firm Admins if none) **and** its Client Owners and Client Staff; never Read-only users. | 2026-10-08 |
| D-51 | The **e-invoicing ASP deadline** (config `einvoicing.asp_by`, VERIFY) is shown on every client's calendar. | 2026-10-08 |
| D-52 | **Data migration (answers Q-25):** the opening journal (old trial balance at the cut-off) posts receivables/payables to **3999 Opening balance clearing**; each unpaid invoice/bill of the old system is entered as an **opening document** (old number, real dates, open amount, no VAT) — it ages, appears in statements and is settled by receipts/payments. Posting (Firm Admin, maker-checker) moves it from 3999 to 1100/2000 at the conversion date; 3999 must end at zero (integrity warning until it does). AED only for now. | 2026-10-08 |
| D-53 | **Phase 2 exit test** uses anonymised names (company, customers, suppliers, dummy TRNs) with real amounts and dates — no identifiable client data in the development system before OA-13/14/15. | 2026-10-08 |
| D-25 | **Break-glass recovery** (because there is only one Super Admin): if Faizan is locked out (lost phone/MFA), access is restored from the Supabase dashboard by the account owner following a written runbook (OWNER-ACTIONS). | 2026-10-06 |

## 2. Open questions (for Faizan)

| # | Question | Needed by | Status |
|---|---|---|---|
| Q-01 | Which 3–5 pilot clients? (simple books, friendly) | Phase 2 | ⬜ |
| Q-02 | Which ASP partner for e-invoicing? | Phase 4 (shortlist by Dec 2026) | ⬜ |
| Q-03 | OK to pay for a short independent security review before real client data? (recommended) | Phase 3 | ⬜ |
| Q-04 | VAT 201 emirate boxes (1a–1g): allocate by **our client's establishment** or by **customer location**? → **Decided: emirate selected manually per invoice, pre-filled with head office (D-10).** | Phase 3 | ✅ |
| Q-05 | Customer overpayments: hold as "customer credit" on account, or refund only? → **Decided: Customer Credit by default + refund option (D-11, §2.1).** | Phase 2 | ✅ |
| Q-06 | Provide 3–5 real, anonymised worked examples (one VAT quarter, one CT computation) to become the golden test set. | Phase 1 | ⬜ |
| Q-07 | Confirm every tax setting marked **VERIFY** (VAT return due days, Art 59 threshold, SBR end date, e-invoicing dates). → **Faizan confirmed all values on 2026-10-07 (unchanged).** Remaining step: approve a new tax-rule version in Admin → Tax rules with VERIFY unticked, so the flags clear in the database. | Phase 3 | 🟡 |
| Q-08 | Confirm the legal reference for the VAT treatment of advances in §2.1 (date-of-supply rules — Decree-Law Art 25–26 or the Executive Regulation?). The rule itself is agreed; only the citation shown in the app needs confirming. | Phase 2 | 🔍 |
| Q-09 | Will other tax firms ever use this system? → **Decided: yes, as customers; TFS Plus is the platform owner (D-20).** | Phase 1 | ✅ |
| Q-10 | Two-person rule for tax-rule changes? → **Decided: yes once a backup Super Admin exists (D-23).** | Phase 1 | ✅ |
| Q-11 | Currencies in v1? → **Decided: AED + USD at 3.6725 (D-21).** | Phase 2 | ✅ |
| Q-12 | Backup Super Admin → **Agreed in principle**; name still needed (Q-16). | Phase 1 | ✅ |
| Q-13 | Email sender → **`onboarding@resend.dev` (D-24)**; invites also shareable by link. | Phase 1 | ✅ |
| Q-14 | Invoice numbering → **Decided: `INV-2026-10-0001` style, monthly counter (D-22).** | Phase 2 | ✅ |
| Q-15 | Approve specs 01–05 → **Approved 2026-10-06.** | Phase 1 start | ✅ |
| Q-16 | Backup Super Admin → **none for now** (D-23, D-25). Revisit before the pilot. | Phase 3 | ✅ |
| Q-17 | Monthly restart? → **No: one running counter, month shown in the number (D-22).** | Phase 2 | ✅ |
| Q-18 | USD rounding: line → AED first, then VAT → **Agreed (D-21).** | Phase 2 | ✅ |
| Q-19 | Email domain → **use Resend default for now (D-24).** | Phase 1 | ✅ |
| Q-20 | Yearly reset of the counter? → **No: continues across years** (`INV-2027-01-1245`, D-22). | Phase 2 | ✅ |
| Q-21 | Reversing a posted journal: one step or second approval? → **Decided: second person approves (D-26).** | Phase 1 | ✅ |
| Q-22 | Bank account (1010) as a control account? → **Decided: yes (D-27).** | Phase 1 | ✅ |
| Q-24 | Reports before year-end closing: roll earlier years' P&L into Retained earnings automatically? → **Decided: yes (D-28)**, built in P2-06. | Phase 2 | ✅ |
| Q-25 | **Data-migration rules** → **Decided: D-52** (opening journal via 3999 + each open invoice/bill as an opening document). | Phase 2 | ✅ |
| Q-23 | Firm-staff email domain for invites; invite expiry (7 days for now). → **Deferred: nothing is deployed yet; decide before inviting staff.** | Before first staff invite | ⏸ |

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

Nothing reaches the live site unless **all** of these pass. Claude runs G-1 → G-9 (locally and
in GitHub Actions); Faizan does G-10.

| # | Gate | Tool | Pass rule |
|---|---|---|---|
| G-1 | Type check | `tsc --noEmit` (strict) | 0 errors |
| G-2 | Lint | **oxlint** (correctness + suspicious + react-hooks + no-eval/no-danger) — ESLint doesn't support TypeScript 7 | 0 errors, 0 warnings |
| G-3 | Finance lint | `npm run check:finance` (see 3.1) | 0 findings |
| G-4 | **Build** | `vite build` + scan of `dist/` for secret keys | Build succeeds; no secrets in the bundle |
| G-5 | Unit tests | Vitest | 100% pass; tax & ledger code ≥ 95% line coverage |
| G-6 | Database tests | **pgTAP** (`supabase test db`) on a **temporary Supabase** in GitHub Actions, signed in as test users per role — never against real client data (D-18). Quick local check without Docker: `npm run test:db:local` (PGlite) | 100% pass |
| G-7 | Supabase advisors | Security + performance advisors | 0 errors, 0 warnings |
| G-8 | Security scans | `gitleaks` (secrets in git) + `npm audit --audit-level=high` | 0 findings |
| G-9 | End-to-end | Playwright: log in (with MFA) → create invoice → approve → TB → VAT box | 100% pass |
| G-10 | Human check | Faizan reviews the Vercel **preview link** and ticks 🔍 items | Signed off |

One command runs the fast gates locally: `npm run check` (G-1, G-2, G-3, G-4, G-5, G-8).

### 3.1 Finance & safety lint rules (`check:finance`)
- No floating-point money: no `parseFloat`, `toFixed`, `* 1.05`, `/ 1.05` in calculation code; amounts are whole fils (integers).
- No hard-coded tax rates or thresholds outside config (e.g. `500` bp, `0.05`, `375000`).
- No hard-coded business dates (e.g. `"2026-09-30"`) outside seed/test files.
- No secret/service keys or `service_role` strings in `src/`; no `dangerouslySetInnerHTML`.
- No direct `update`/`delete` on posted journals, approved returns or audit rows in app code (posting goes through database functions).

### 3.2 How a change flows (spec-first)
1. **Spec** — the feature's spec in `docs/specs/` is approved (or updated and re-approved).
2. **Database** — migration file in `supabase/migrations/`, proven on the temporary CI database, then applied to the Supabase project; advisors run (G-7).
3. **Database tests** — written from the spec's test IDs (G-6).
4. **Screens & logic** — built against the tests (G-1 → G-5).
5. **End-to-end** — Playwright journey (G-9); security scans (G-8).
6. **Commit** on branch `faizan` → push → GitHub Actions re-runs everything → Vercel builds a **preview link**.
7. **Faizan checks** the work (G-10). `main` is **not touched** — no pull request or merge — until Faizan explicitly asks (2026-10-07); all work stays on `faizan`.

---

## 4. Roles (full detail: [Spec 02](docs/specs/02-roles-rbac.md))

| Role | Who | In short | From |
|---|---|---|---|
| **Super Admin** | Faizan (+ one backup) | Firm Admin **plus** tax rules, email, invites, user suspension | Phase 1 |
| **Firm Admin** | Partners / managers | Clients, staff, approvals, period locks, VAT approval | Phase 1 |
| **Firm Accountant** | TFS staff | Prepares on assigned clients only | Phase 1 |
| **Client Owner** | Client director | Own company; approves own bills/invoices; invites own staff | Phase 3 |
| **Client Staff** | Client finance person | Uploads bills, drafts invoices | Phase 3 |
| **Read-only** | Auditor / viewer | Views, until an end date | Phase 3 |

**Always-on rules (everyone, including Super Admin):** maker-checker; posted records never
edited (reverse only); locked periods; nobody changes their own role; MFA for firm users;
the last Super Admin can't be removed. Enforced in the database.

---

## 5. Phases, steps and exit criteria

Every phase follows the flow in §3.2. Target dates assume Faizan reviews each preview within
2–3 working days. Owner actions (OA-xx) are in [docs/OWNER-ACTIONS.md](docs/OWNER-ACTIONS.md).

### Phase 0 — Setup, specs & clean-up · 🟡 In progress · target 16 Oct 2026
- [x] Connect local folder to GitHub repo; work on branch **`faizan`**
- [x] Run POC locally (`http://localhost:5180`)
- [x] Supabase MCP (`supabase-tax`) configured and authenticated
- [x] Project skills installed (Supabase, Postgres, Vercel/React, design, web testing, supergoal)
- [x] Plan agreed and written (this file); `CLAUDE.md` updated
- [x] Specs written: [01 Data model](docs/specs/01-data-model.md), [02 Roles](docs/specs/02-roles-rbac.md), [03 Configuration & formulas](docs/specs/03-configuration-and-formulas.md), [04 Security](docs/specs/04-security.md), [05 Scope review](docs/specs/05-scope-and-simplifications.md)
- [x] Owner-actions guide written ([docs/OWNER-ACTIONS.md](docs/OWNER-ACTIONS.md))
- [x] Faizan approved specs 01–05 and answered Q-09 → Q-19 (OA-01)
- [x] Drop the 7 leftover tables + 2 functions created on 2026-10-06 in Supabase — done by `20261007100000_foundation.sql` (applied 2026-10-07)
- [ ] Rename local folder to remove `&` (OA-03)
- [x] Moved `PRD.md`, `UAE_COMPLIANCE_RULES.md` to `/docs`; old scaffold and roadmaps archived in `docs/archive/`
- [x] Tooling: oxlint, Vitest (+ 95% coverage gate), Playwright, `check:finance`, `check:bundle`, `npm run check`, gitleaks, npm audit, GitHub Actions CI (`.github/workflows/ci.yml`) running G-1 → G-5, G-8, G-9 (G-6/G-7 need the database — Phase 1)
- [x] Unit tests for the existing POC logic — **63 tests**, 98.8% line coverage of tax & ledger code; 4 browser (E2E) tests. All calculations matched the expected answers
- [x] AI removed: "Ask your books" page, simulated OCR, auto-approve thresholds, AI badges/labels. Capture → **Purchase bills** (manual entry + attachment); defaults from the supplier's last bill or a keyword rule; profit insight relabelled "Profit movement"
- [x] Fixed POC defects: all fixed dates now from today's date or config (receipts, payments, reversals, deadlines, quarters, financial year); every hard-coded 5% / 1.05 / AED 375,000 now from `TAX_CONFIG`; emirate already an editable "Place of supply" field defaulting to head office (D-10). Finance lint: 0 findings
- [x] Local `.env.local` created with Supabase & Resend keys; keys verified working (OA-05)
- [ ] 🔍 Rotate the secret key and Resend key that were shared in chat (OA-16)
- [ ] Owner actions started: OA-02 (2FA everywhere), OA-04 (Supabase auth settings — public sign-up is still **on**)

**Exit:** specs approved; CI runs green on the current code; Faizan has supplied Q-06 examples (OA-08).

### Phase 1 — Foundation: database, logins, roles, admin · ✅ Approved by Faizan 2026-10-07 (target was 13 Nov 2026)

**1A · Database foundation** (Spec 01 §4.1–4.5, 4.11–4.12 · Spec 02 §3)
| ID | Step | Tests | Status |
|---|---|---|---|
| P1-01 | Migration: reference data — emirates, VAT boxes (incl. 2, 6, 7), tax codes + box mapping, CT tags, CoA template (adds 2150 Customer Credits) | DM-11 | ✅ applied 2026-10-07 — `20261007100100_reference_data.sql` |
| P1-02 | Migration: platform settings (app name, sender), firms (TFS Plus = platform owner), profiles, firm_members, org_memberships, invitations | DM-12, RBAC-23, RBAC-24 | ✅ applied 2026-10-07 — `20261007100200_platform_firms_people.sql` (also creates `organizations`) |
| P1-03 | Migration: currencies (AED, USD), organizations (VAT stagger, CT TRN), accounts, accounting & tax periods, monthly number sequences (D-22) | DM-01, DM-03, NUM-05 | ✅ applied 2026-10-07 — accounts/periods/numbering in `20261007100300_ledger.sql`; currencies & organizations in earlier files |
| P1-04 | Migration: journals + lines with guards; `post_journal`, `reverse_journal`, `lock_period`, `reopen_period` | LED-01 → LED-14 | ✅ applied 2026-10-07 — `20261007100300_ledger.sql` |
| P1-05 | Migration: config versions/values (seeded from current `TAX_CONFIG`), firm settings, email templates, compliance rules | CFG-01 → CFG-05 | ✅ applied 2026-10-07 — `20261007100400_configuration.sql` |
| P1-06 | Migration: audit log + generic audit trigger (append-only) | LED-14, SEC-17 | ✅ applied 2026-10-07 — in `20261007100000_foundation.sql` |
| P1-07 | RLS on every table, `app.*` helpers, MFA restrictive policy, private storage bucket | RBAC-01 → RBAC-14, RBAC-17 → 19 | ✅ applied 2026-10-07 — `20261007100500_access_control.sql` |
| P1-08 | Generated TypeScript types; advisors = 0 | DM-09, DM-10 | ✅ `poc/src/lib/database.types.ts`; advisors 0 errors / 0 warnings (INFO only: unused indexes on empty tables, private permissions table) |

**1B · Logins & administration** (Spec 02 · Spec 03 §3)
| ID | Step | Tests | Status |
|---|---|---|---|
| P1-09 | Login, MFA enrolment, password reset, 30-min idle sign-out | SEC-08, SEC-09, SEC-21 | ✅ `components/AuthGate.tsx` + `lib/auth.ts` (22 unit tests); Faizan signed in with password + two-factor on 2026-10-07 |
| P1-10 | Invite flow (Vercel function + one-time link; sent via Resend **and** a "Copy invite link" button, D-24) | CFG-10, CFG-11, SEC-15, CFG-18 | ✅ Faizan's real invite accepted 2026-10-07 (second Firm Admin joined); 23 pgTAP + 12 unit tests |
| P1-11 | Admin area: Users & invites, Firm profile, Settings, **Tax rules** (versioned, with VERIFY flags) | CFG-01 → CFG-05, CFG-13 | 🟡 built — **Admin** page: My profile (own name), Tax rules (versions, in-force version, VERIFY banner, Super Admin drafts → edit → approve with reason), Firm profile + settings (restricted keys Super Admin only), Platform settings and Email templates (Super Admin); rules already enforced and tested in the database (CFG-01/03/04/05/13/16/17); value parsing in `lib/admin.ts` (13 unit tests); waiting for Faizan's first use (VERIFY sign-off, Q-07) |
| P1-12 | Client onboarding (CoA copy, periods, VAT periods, number sequences, staff assignment, opening balances) | CFG-06 | ✅ 3 real clients added by Faizan 2026-10-07; 21 pgTAP tests (CFG-06, CT-10) |

**1C · The app on live data**
| ID | Step | Tests | Status |
|---|---|---|---|
| P1-13 | Replace browser storage with Supabase data access; remove demo role switcher | — | ✅ live app (`src/live/`) on Supabase for everything Phase 1 covers (clients, chart of accounts, journals, approvals, periods, trial balance & ledger, users, admin); no demo data or role switcher in normal builds. Old POC screens stay in the demo build until rebuilt on real data in Phases 2–3 |
| P1-14 | Chart of accounts, manual journals, approval queue, reversal, period lock screens | LED-*, RBAC-04 → 09 | ✅ Faizan posted an opening and a manual journal approved by the second Firm Admin (JV-2026-01-0001, JV-2026-10-0002), no self-approval; 18 pgTAP + 20 unit tests |
| P1-15 | Trial balance & general ledger from database functions | LED-13 | ✅ `…101100_reports.sql` (`trial_balance`, `general_ledger`; 14 pgTAP tests incl. LED-13 with 1,000 random journals) + **Trial balance & ledger** screen with drill-down TB → ledger → journal; checked on Faizan's real client (balanced) |
| P1-16 | Security headers (CSP, HSTS) in `vercel.json`; Basic Auth removed once logins work | SEC-12 | ✅ CSP (own scripts only; Supabase + Google Fonts), HSTS 2 years, X-Frame-Options DENY, nosniff, Referrer/Permissions/COOP, `no-store` on `/api`; proven in a real browser with the production build (no violations); SEC-12 unit test on `vercel.json`; site password middleware removed |
| P1-17 | End-to-end: log in → create client → journal → approve → trial balance | G-9 | ✅ `poc/e2e-live/journey.spec.ts` on a temporary Supabase in CI: two test Firm Admins, TOTP two-factor (RFC 6238 helper), add client, submit journal, maker cannot approve, checker approves, trial balance balanced, drill-down; plus SEC-08 (no sign-up path) |
| P1-18 | Re-enable the React style/performance lint rules switched off in Phase 0 (`poc/.oxlintrc.json`) as screens are rebuilt | G-2 | ✅ all nine strict React rules on (as errors) for every rebuilt file — `src/live/**`, `AuthGate`, `Team`, `src/lib/**`, `api/**`; shared `useLoad` / `useToday` hooks; 0 findings. Old demo screens (demo build only) keep the exemption until they are rebuilt in Phases 2–3 |

**Exit:** all LED, RBAC-01→14, DM, CFG-01→05 tests green; Faizan can log in with MFA, create a client, post and approve journals, and cannot break the rules on purpose.

### Phase 2 — Daily bookkeeping · 🟡 In progress · target 18 Dec 2026 (Spec 01 §4.4–4.9)
| ID | Step | Tests | Status |
|---|---|---|---|
| P2-01 | Customers & suppliers (TRN validation, payment terms, default account) | ARAP-07 | 🟡 built — `…101200_contacts.sql` (14 pgTAP tests, applied) + **Customers & suppliers** screen (search, filters, add/edit, TRN check, default account/tax code, related-party tag); rules in `lib/contacts.ts` (7 unit tests) |
| P2-02 | Sales invoices + credit notes with `INV-YYYY-MM-0001` numbering (D-22), supply emirate (D-10), AED or USD (D-21) | ARAP-04, DM-02, VAT-02, NUM-01 → 07, FX-01 | 🟡 built — `…101300_sales_invoices.sql` (31 pgTAP tests: VAT-01/02/09/10, FX-01, NUM-01/02/06/07, DM-15, D-30; applied by Faizan) + `…101400_client_address.sql`; **Sales invoices** screen (editor with live totals matching the database, D-29 warnings, approve/send back, credit notes), **Print / PDF** tax invoice (Art 59 fields), client **Edit details** with address; 13 calculation unit tests; covered by the live journey (invoice → approval → INV number → trial balance → print) |
| P2-03 | Purchase bills + debit notes, attachments (private storage), compliance checks & risk | ARAP-06, DM-08, SEC-13, SEC-20 | 🟡 built — live in Supabase (Faizan applied `…101500`), screen + live journey green; awaiting Faizan's check |
| P2-04 | Receipts & payments (AED/USD), allocations, **Customer Credits** (auto-apply, refunds) (D-11) | ARAP-01 → 05, ARAP-08 → 12, DM-05, DM-06, FX-02, FX-03 | 🟡 built — `…101600_receipts_payments.sql` (37 pgTAP tests, applied by Faizan): receipts, supplier payments, refunds, oldest-first and chosen allocations, Customer Credits / Supplier advances auto-applied on the next invoice/bill, bank charges and small write-offs (D-34), exchange differences (D-37), open items with ageing; **Receipts & payments** screen; 12 unit tests; receipt step in the live journey. Follow-up: undo a posted receipt (with P2-05) |
| P2-05 | Bank accounts, statement upload, duplicate detection, matching, reconciliation | BANK-01 → 03, DM-07 | 🟡 built — `…20261008100000_bank.sql` (31 pgTAP tests, applied by Faizan): bank accounts, CSV/Excel upload with remembered column mapping, duplicate protection, auto/manual matching, bank-line journals (no VAT), receipts/payments from bank lines, **reverse receipt/payment with approval (D-40)**, approved & frozen month-end reconciliation; **Bank** screen; 13 unit tests; bank step in the live journey |
| P2-06 | Reports: TB, GL, P&L, Balance Sheet, AR/AP ageing, customer statement; Excel/PDF export | RPT-01 → 04, SEC-14, D-28 roll-forward | 🟡 built — `…20261008100100_reports.sql` (17 pgTAP tests, applied): P&L, balance sheet with the D-28 roll-forward, AR/AP ageing at any date (= control accounts), customer/supplier statements; **Reports** screen with tabs, drill-down to ledger/journal, Excel export (formula-safe, SEC-14) and Print/PDF; 7 unit tests; live journey checks the balance sheet balances and P&L drill-down |
| P2-07 | Opening-balance & contacts import from one Excel template (Spec 05) | — | 🟡 **contacts import built** — `…20261008100200_contacts_import.sql` (9 pgTAP tests, applied): downloadable template, all-or-nothing checks with row numbers, existing contacts skipped & listed (never changed); 3 unit tests; in the live journey. **Opening balances & open items: D-52 built** (`…101000_opening_documents.sql`, 12 pgTAP tests, applied by Faizan; client tab "Opening balances" with Excel template, 3 unit tests) |
| P2-08 | Nightly integrity checks (pg_cron) + Integrity page | — | 🟡 built — `…20261008100300_integrity.sql` (14 pgTAP tests incl. deliberate damage caught; applied by Faizan, pg_cron job `nightly-integrity-checks` 22:00 UTC = 02:00 UAE confirmed active): 12 checks (TB, journals, AR/AP/credits/advances = control, documents = journals, numbering gaps, bank warnings), permanent results; **Integrity** page with Run now; in the live journey. E-mail alert switched on with the deployment (Resend, OA-16) |

**Exit:** one pilot client's real past quarter re-keyed; Trial Balance agrees with their existing books **to the fils**.

### Phase 3 — VAT, alerts, client logins & pilot · ⬜ · target 22 Jan 2027
| ID | Step | Tests | Status |
|---|---|---|---|
| P3-01 | VAT 201: every box incl. 2, 6, 7; 0.00 for empty (D-12); drill-down | VAT-01 → 11, VAT-16 → 18 | ✅ tested by Faizan 2026-10-08 — built — `…20261008100400_vat_return.sql` (27 pgTAP tests, applied by Faizan): all 20 boxes from posted documents by tax code, D-12 zeros, drill-down per box, IMG code (D-42), manual entries with reason (D-43); **VAT return** screen with Excel/Print; 4 unit tests; in the live journey |
| P3-02 | VAT return workflow: draft → review → approve → **frozen snapshot** → period locked | VAT-13, CFG-02 | ✅ tested by Faizan 2026-10-08 — built — review → maker-checker approval → frozen snapshot (SHA-256 + tax-rule version) → quarter locked → FTA filing reference; prior-period items after reopening (D-44) |
| P3-03 | VAT reconciliation (return = VAT accounts); FTA Audit File (FAF) export | VAT-14 | ✅ tested by Faizan 2026-10-08 — reconciliation + clearing journal (D-47) built and applied (10 pgTAP tests): **Reconciliation** section on the VAT return (each box group vs its VAT account, every difference explained), 2120 cleared on approval, FTA payment from the bank line; full-tax-invoice warning (D-46) on bills; in the live journey. **FAF export later** (Faizan) |
| P3-04 | Golden VAT set from Faizan | VAT-15 | ⬜ |
| P3-05 | Compliance calendar from rules; email alerts & templates via Resend; daily Vercel cron | CFG-07, CFG-12 | ✅ tested by Faizan 2026-10-08 — built — `…100900_compliance_calendar.sql` (11 pgTAP tests, applied by Faizan): calendar from `compliance_rules` (VAT, CT, licence −30 days, e-invoicing), reminder recipients (D-50), permanent email log; **Deadlines** page; `/api/reminders` daily job (Vercel cron 08:00 UAE, CRON_SECRET — OA-18) and `/api/test-email` (CFG-12) with 8 server tests; live sending at deployment (domain OA-09/10) |
| P3-06 | Client logins: Client Owner, Client Staff, Read-only (time-boxed) | RBAC-15, RBAC-16, RBAC-20, SEC-16 | ✅ tested by Faizan 2026-10-08 — database built (`…100700_client_logins.sql`, 26 pgTAP tests): client invitations (RBAC-15/16), acceptance, removal with reason, D-48/D-49; **matrix gaps fixed** — receipts/payments need `record_payment` (Client Staff no), bank matching/reconciliation need `bank_match` (client users no), statement upload `upload`; full role sweep (RBAC-20); **Client users** page (invite, revoke, remove with reason, read-only end date), firm menus hidden for client users; invite server handles client invitations (4 new tests); applied by Faizan; in the live journey |
| P3-07 | Firm overview dashboard on live data | — | ✅ tested by Faizan 2026-10-08 — built — `…100800_firm_dashboard.sql` (8 pgTAP tests, applied): per client VAT due/overdue, approvals waiting, receivable/overdue, payable, revenue YTD, DSO (F-23), bank lines & last reconciliation, integrity; **Dashboard** page sorted by urgency with links into each client; 6 unit tests; in the live journey |
| P3-08 | Nightly encrypted database export (until Pro / self-hosted) + restore test | — | ⬜ |
| P3-09 | Resend domain & SMTP (OA-09/10), custom domain if wanted (OA-11) | — | ⬜ |
| P3-12 | **Production cut-over** (D-18): remove demo/test data, confirm schema & advisors, rotate keys, enable backups (OA-13), set Vercel production variables | DM-10, SEC-18 | ⬜ |
| P3-10 | Independent security review (OA-15) and fixes | SEC-11 → 21 | ⬜ |
| P3-11 | Go-live checklist (§7) | — | ⬜ |

**Exit:** one full VAT quarter per pilot client agrees to Faizan's manual workings. **Pilot live with 3–5 clients.**

### Phase 4 — E-invoicing · ⬜ · target 30 Apr 2027 (SME deadline 1 Jul 2027 — VERIFY)
- [ ] ASP partner chosen (Q-02); sandbox credentials
- [ ] PINT AE invoice & credit note generation + validation
- [ ] Send via ASP (Vercel function), status tracking, rejection queue, retry, idempotency
- [ ] Store XML + ASP receipts; inbound e-invoices → draft bills
- [ ] Test cases **EINV-*** passing in ASP sandbox

**Exit:** all invoice scenarios pass in the ASP sandbox; pilot clients transmitting live before the deadline.

### Phase 5 — Corporate Tax & year-end · ⬜ · target 31 Jul 2027 (FY2026 returns due 30 Sep 2027)
- [ ] Fixed asset register + depreciation (F-21)
- [ ] Year-end close: accruals/prepayments, closing entries, retained earnings roll-forward
- [ ] CT computation with config F-08 → F-12: add-backs, SBR / standard gates, loss carry-forward (75% cap), CT payable, due dates; manual adjustment lines with reason
- [ ] CT return pack (Excel/PDF) with drill-down and legal references
- [ ] IFRS for SMEs primary statements (P&L, Balance Sheet, cash flow, SOCE)
- [ ] Test cases **CT-*** passing

**Exit:** FY2026 CT for pilot clients matches Faizan's manual computation.

### Phase 6 — Production hardening & UAE hosting · ⬜ · before scaling beyond pilot
- [ ] Self-hosted Supabase in a UAE data centre; migrate data; verify row counts and TB per client match before/after
- [ ] Automated encrypted backups + **monthly restore test**
- [ ] Upgrade Vercel to Pro (Hobby is for non-commercial use)
- [ ] Penetration test; fix high/critical findings
- [ ] Arabic UI & bilingual tax invoices
- [ ] **Other tax firms as customers (D-20):** firm onboarding screen for Super Admin, per-firm branding, support-access grants — built when the first outside firm signs up
- [ ] Deferred items from Spec 05 as demand proves (more currencies & FX revaluation, leases, payroll import, bank feeds…)
- [ ] FTA Tax Accounting Software registration (later)

---

## 6. Test case catalogue

Expected values are in AED. Rounding rule: **half-up to 2 dp at line level** for VAT.
Type: **U** = unit (Vitest), **D** = database (temporary CI Supabase), **E** = end-to-end (Playwright).
Cases marked 🔍 need Faizan to confirm the expected answer.

### 6.1 Ledger (LED)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| LED-01 | Dr Rent 1,000 / Cr Bank 1,000 | Posts | D | ✅ |
| LED-02 | Dr 1,000.00 / Cr 999.99 | Rejected by database (also via direct SQL) | D | ✅ |
| LED-03 | One line with both debit and credit | Rejected | D | ✅ |
| LED-04 | Negative amount | Rejected | D | ✅ |
| LED-05 | Single-line journal | Rejected | D | ✅ |
| LED-06 | Amount 10.005 (fraction of a fils) | Rejected | U+D | ✅ |
| LED-07 | Edit a posted journal | Rejected | D | ✅ |
| LED-08 | Delete a posted journal | Rejected | D | ✅ |
| LED-09 | Reverse a posted journal | Requested by one Firm Admin, approved by another (D-26); mirror entry on the chosen date; net effect 0; original marked reversed on approval | D | ✅ |
| LED-10 | Post into a locked period | Rejected | D | ✅ |
| LED-11 | Firm Admin reopens a period | Allowed; audit entry with reason | D | ✅ |
| LED-12 | Unknown or inactive account | Rejected | D | ✅ |
| LED-13 | 1,000 random valid journals | TB total debits = total credits (property test) | U | ✅ |
| LED-14 | Every post/approve/reverse/lock | Audit row written; audit rows cannot be edited or deleted | D | ✅ |

### 6.2 Security & access (SEC)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| SEC-01 | Not logged in, call any table | 0 rows / denied | D | ✅ |
| SEC-02 | User of Client A reads Client B | 0 rows | D | ✅ |
| SEC-03 | Firm user without access grant to a client | 0 rows | D | ✅ |
| SEC-04 | Firm Accountant approves an entry | Rejected | D | ✅ |
| SEC-05 | Firm Admin approves **own** entry | Rejected (maker-checker) | D | ✅ |
| SEC-06 | Read-only user inserts a journal | Rejected | D | ✅ |
| SEC-07 | Read-only access past its end date | Denied | D | ✅ |
| SEC-08 | Public sign-up attempt | Not possible (invite only) | E | ✅ |
| SEC-09 | Firm user logs in without MFA | Blocked until MFA set up | E | ✅ |
| SEC-10 | Supabase secret key appears in browser bundle | Never (build check) | U | ✅ |

### 6.3 Receivables & payables (ARAP)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| ARAP-01 | Invoice 10,000 + VAT 500, receipt 4,000 | Open balance 6,500; ageing by due date | D | ✅ |
| ARAP-02 | AR sub-ledger total vs GL 1100 | Always equal | D | ✅ |
| ARAP-03 | AP sub-ledger total vs GL 2000 | Always equal | D | ✅ |
| ARAP-04 | Credit note 2,000 + VAT 100 against ARAP-01 invoice | Open balance 4,400; VAT reduced by 100 | D | ✅ |
| ARAP-05 | Invoice 10,500 (incl. VAT 500); customer pays 11,000 | Invoice settled; Dr Bank 11,000 / Cr Receivables 10,500 / Cr Customer Credits 500; no VAT on the 500 | D | ✅ |
| ARAP-06 | Duplicate supplier bill (same supplier + bill no.) | Blocked | D | ✅ |
| ARAP-07 | Invalid TRN format (not 15 digits starting 1) | Warning; input VAT not recoverable | U | ✅ stricter: an invalid TRN cannot be saved; a bill without a valid TRN does not recover VAT (D-32) |
| ARAP-08 | Customer Credit 500, then new invoice 2,100 (incl. VAT 100) for the same customer | Auto-applied: Dr Customer Credits 500 / Cr Receivables 500; invoice open 1,600; audit entry written | D | ✅ |
| ARAP-09 | Credits auto-apply across two open invoices | Oldest invoice settled first; never applied to another customer | D | ✅ |
| ARAP-10 | Refund a credit of 500 | Dr Customer Credits 500 / Cr Bank 500; needs approval by someone other than the preparer | D | ✅ |
| ARAP-11 | Refund more than the credit balance | Rejected | D | ✅ |
| ARAP-12 | Balance sheet presentation | Customer Credits shown under liabilities, not netted against receivables | D | ✅ |

### 6.4 Bank (BANK)
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| BANK-01 | Same statement uploaded twice | Duplicates detected, not imported twice | D | ✅ |
| BANK-02 | Auto-match: equal amount within ±5 days | Matched one-to-one; never one journal to two lines | U | ✅ |
| BANK-03 | Reconciliation at month-end | Book balance + reconciling items = statement balance | D | ✅ |

### 6.5 VAT (VAT) — 5% standard rate
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| VAT-01 | Standard-rated sale, net 10,000 | Box 1(emirate) 10,000 / VAT 500 | U+D | ✅ |
| VAT-02 | Abu Dhabi client; user selects **Dubai** on a net 10,000 invoice | Box 1b (Dubai): 10,000 / 500; change recorded in audit log | U | ✅ |
| VAT-02b | Emirate field left as pre-filled | Allocated to head-office emirate box | U | ✅ |
| VAT-03 | Zero-rated export of goods 20,000 | Box 4: 20,000 / VAT 0 | U | ✅ |
| VAT-04 | Exempt supply 8,000 | Box 5: 8,000 | U | ✅ |
| VAT-05 | Imported service (reverse charge) 6,000 | Box 3: 6,000 / 300 **and** Box 10: 6,000 / 300; net effect 0 | U | ✅ |
| VAT-06 | Standard-rated expense 25,000 + 1,250 with valid tax invoice | Box 9: 25,000 / 1,250 | U | ✅ |
| VAT-07 | Client entertainment 3,800 + 190 | Not in Box 9; expense 3,990; VAT blocked | U | ✅ |
| VAT-08 | Bill with VAT but supplier has no TRN | VAT not recoverable; full amount expensed | U | ✅ |
| VAT-09 | Rounding: 3 lines × 33.33 | Line VAT 1.67 each; total VAT 5.01 | U | ✅ |
| VAT-10 | Credit note 2,000 against VAT-01 | Box 1: 8,000 / 400 | U+D | ✅ |
| VAT-11 | Box 14 | = Box 12 − Box 13 (positive = payable, negative = refundable) | U | ✅ |
| VAT-12 | Quarter Oct–Dec 2026 | Due 28 Jan 2027 | U | ✅ |
| VAT-13 | Return approved | Snapshot frozen; period locked; later posting rejected | D | ✅ |
| VAT-14 | Reconciliation | Output VAT on return = movement on VAT output account | D | ⬜ |
| VAT-15 | Golden set from Faizan (Q-06) | Every box matches manual working to the fils | U | ⬜ |
| VAT-16 | Plain overpayment of 500 on account | Not in any VAT box until applied to an invoice | U | ✅ |
| VAT-18 | Quarter with no zero-rated, exempt or reverse-charge activity | Boxes 2, 3, 4, 5, 6, 7, 10 and every unused emirate box shown as 0.00 / 0.00 — none blank or hidden | U+E | ✅ |
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
| RPT-01 | Balance sheet | Assets = Liabilities + Equity (+ current-year profit) | D | ✅ |
| RPT-02 | Year-end close | P&L net profit moves to retained earnings; P&L accounts zero | D | 🟡 reports roll it forward (D-28, proven); the closing journal itself is Phase 5 |
| RPT-03 | Excel/PDF export | Totals equal on-screen totals | E | ✅ |
| RPT-04 | Drill-down from any report figure | Lists exactly the journals that make it up | E | ✅ |

### 6.8 E-invoicing (EINV) — detailed once ASP is chosen
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| EINV-01 | Standard tax invoice | Passes PINT AE validation; accepted in sandbox | E | ⬜ |
| EINV-02 | Credit note | Accepted; references original invoice | E | ⬜ |
| EINV-03 | Zero-rated export, exempt, reverse charge, foreign currency | Each accepted | E | ⬜ |
| EINV-04 | Rejected by ASP | Appears in rejection queue with reason; can correct & resend | E | ⬜ |
| EINV-05 | Same invoice sent twice | Sent once (no duplicate transmission) | D | ⬜ |

---

### 6.9 Currency (FX) — 1 USD = 3.6725 AED
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| FX-01 | USD invoice, net USD 1,000.00, standard-rated | AED net 3,672.50; VAT 183.63 (5% of 3,672.50 = 183.625, half-up); gross AED 3,856.13; VAT 201 Box 1 shows AED | U | ✅ |
| FX-02 | Customer pays USD 1,050.00 for FX-01 | AED 3,856.13 received; invoice fully settled | D | ✅ |
| FX-03 | USD payment exactly equal to a USD invoice's USD total | AED settled = invoice AED total — no 0.01 rounding residue left open | D | ✅ |
| FX-04 | Trial balance, P&L, VAT 201 with mixed AED/USD documents | All in AED; USD amounts shown only as document detail | D | ✅ |
| FX-05 | Change `fx.usd_aed` effective a future date | Existing documents unchanged; new documents use the new rate | U | ✅ |
| FX-06 | Document in any currency other than AED/USD | Rejected | D | ✅ |

### 6.10 Document numbering (NUM) — D-22
| ID | Scenario | Expected | Type | Status |
|---|---|---|---|---|
| NUM-01 | First invoice dated October 2026 | `INV-2026-10-0001` | D | ✅ |
| NUM-02 | Second October invoice | `INV-2026-10-0002` | D | ✅ |
| NUM-03 | October ends at `INV-2026-10-0100`; first November invoice | `INV-2026-11-0101` (counter continues) | D | ✅ |
| NUM-04 | October invoice back-dated and posted after `INV-2026-11-0101` | `INV-2026-10-0102` (next counter, its own month) | D | ✅ |
| NUM-05 | Two users post invoices at the same moment | Different numbers, no gaps, no duplicates | D | ✅ |
| NUM-06 | Draft invoice deleted before posting | No number used (numbers assigned at posting) | D | ✅ |
| NUM-07 | Two different clients | Each has its own counter starting at 0001 | D | ✅ |
| NUM-08 | First invoice of a new year | Counter continues (e.g. `INV-2027-01-1245`) | D | ✅ |

### 6.11 Suites defined in the specs

| Suite | Where | Count |
|---|---|---|
| DM-* (data model) | [Spec 01 §6](docs/specs/01-data-model.md) | 12 |
| RBAC-* (roles & access) | [Spec 02 §4](docs/specs/02-roles-rbac.md) | 20 |
| CFG-* (configuration) | [Spec 03 §5](docs/specs/03-configuration-and-formulas.md) | 13 |
| SEC-11 → SEC-21 (security) | [Spec 04 §6](docs/specs/04-security.md) | 11 |
| RBAC-21 → RBAC-24 (platform & firms) | [Spec 02 §4](docs/specs/02-roles-rbac.md) | 4 |

---

## 7. Go-live checklist (pilot)

- [ ] All quality gates G-1 → G-10 green on the release
- [ ] All LED, SEC, RBAC, DM, CFG, ARAP, BANK, VAT, RPT tests green; all 🔍 cases confirmed by Faizan
- [ ] Parallel-run results signed off for each pilot client
- [ ] Production cut-over P3-12 done: demo/test data removed; automated tests only ever run on the temporary CI database
- [ ] Backups confirmed (Supabase Free has no automatic backups → upgrade or scheduled export before real data)
- [ ] Supabase Free projects pause after inactivity → confirm plan for pilot uptime
- [ ] MFA on for all firm users; public sign-up off
- [ ] Security review done, high/critical findings fixed
- [ ] Pilot clients' engagement letters cover data hosting outside the UAE until Phase 6
- [ ] Resend domain verified; test alert received
- [ ] Owner actions OA-01 → OA-15 done (or consciously deferred)

---

## 8. Change log

| Date | Change |
|---|---|
| 2026-10-06 | Plan created. Decisions D-01 → D-09 agreed. Phase 0 started. |
| 2026-10-06 | Faizan's amendments: Q-04 → D-10 (emirate by supplying branch); Q-05 → D-11 (Customer Credits + refund, §2.1). Added Q-08, to-dos in Phases 0–3, tests ARAP-05/08–12, VAT-02/02b/16/17. |
| 2026-10-06 | POC demo data: each client now has a zero-rated export, an exempt residential sublease and a reverse-charge imported service every quarter, so VAT boxes 3, 4, 5 and 10 show figures. |
| 2026-10-06 | D-12 added: empty VAT/tax figures shown as 0.00 (FTA format). POC VAT page fixed (dash → 0.00); test VAT-18 added. |
| 2026-10-06 | D-10 revised: emirate chosen manually on each invoice (pre-filled with head office); no automatic allocation by establishment; branches table dropped from Phase 1. |
| 2026-10-06 | Specs 01–05 and OWNER-ACTIONS added; gates expanded to G-1 → G-10 (build, security scans); phases rewritten as spec-linked steps; Super Admin role; D-13 → D-17 proposed; Q-09 → Q-15 added. Work moved to branch `faizan`. |
| 2026-10-06 | D-18 single Supabase project (becomes production; CI tests on a temporary Supabase); D-19 Vercel address; OA-05 done; OA-12 removed; OA-16 key rotation added; P3-12 production cut-over added. |
| 2026-10-06 | Faizan's answers: D-20 TFS Plus platform owner / other firms as customers / app name configurable; D-21 AED + USD at 3.6725; D-22 `INV-YYYY-MM-0001` numbering; D-23 two-person rule; D-24 dev sender `onboarding@resend.dev`. Added Q-16 → Q-19, FX-* and NUM-* tests, RBAC-21 → 24. |
| 2026-10-06 | **Specs 01–05 approved.** D-13 → D-17 approved; D-22 revised (running counter, no monthly reset); D-23 single admin for now; D-24 invite link sharing; D-25 break-glass recovery. Q-20 (yearly reset?) added. |
| 2026-10-06 | Q-20 → counter continues across years. **Phase 0 build work:** AI features removed; hard-coded dates/rates fixed; new `rules.ts`, `posting.ts`, `dates.ts`, `insights.ts`; 63 unit tests + 4 E2E tests; oxlint, finance lint, bundle secret scan, coverage gate, GitHub Actions CI; docs reorganised. Remaining Phase 0: drop leftover Supabase tables (needs `supabase-tax` MCP in a new session), owner actions. |
| 2026-10-07 | **Phase 1 started — database foundation (P1-01 → P1-07).** Six migrations in `supabase/migrations/`: clean-up of the POC leftovers, locked-down default privileges, private `app` schema, append-only audit log; reference data (VAT boxes incl. 2/6/7, emirates, tax codes → boxes, CT tags, UAE SME chart with 2150 Customer Credits); platform settings, firms (TFS Plus = owner), profiles, memberships, invitations, clients; chart of accounts, periods, running document numbers, journals with `post_journal` / `reverse_journal` / `lock_period` / `reopen_period`; versioned tax rules seeded from the POC (`uae-2026.09`) with `approve_config_version` (D-23), firm settings, email templates, compliance rules; role permissions, RLS + MFA policy on every table, private `documents` bucket. **118 pgTAP database tests** (LED-01→14 except LED-13 (unit, later), NUM-01→04/06→08, DM-01/03/12/13/14, RBAC-01→14/17→19/21/23/24, SEC-01/16/17, CFG-01/03→05/13/16/17). CI job G-6 added. Local PGlite harness found and fixed 4 defects before CI. Not yet applied to Supabase. New questions Q-21 → Q-23; owner action OA-17. |
| 2026-10-07 | **Phase 1A live.** CI (G-6) ran the real pgTAP suite on a temporary Supabase: 3 files, 119 tests, PASS. Faizan ran migrations `…100000` → `…100500` in the Supabase SQL Editor (so they are not in Supabase's migration-history table — the files in `supabase/migrations/` are the record); verified tables, functions, 104 policies, triggers and storage bucket. Security advisor flagged the 7 API functions (lint 0029) → `…100600_private_definer_functions.sql` moves them to the private `app` schema behind invoker wrappers (+ regression test), CI-proven and applied. **G-7: 0 errors / 0 warnings.** P1-08 types generated. Next: OA-17 (first Super Admin), P1-09. |
| 2026-10-07 | Faizan's login created (OA-17 ✅) and made first Super Admin + Firm Admin of TFS Plus (`app.bootstrap_super_admin`, audit-logged). Answers: **D-26** reversal needs a second person (Q-21); **D-27** bank stays a control account (Q-22); Q-23 deferred (no deployment yet). Migration `…100700_reversal_needs_approval.sql` + 5 new LED-09/D-26 tests (124 database tests). |
| 2026-10-07 | **P1-09 sign-in built.** Sign-in gate in front of the app: email + password (no sign-up screen), "forgot / never set your password" email link, set-password page for invite and reset links, two-factor set-up (QR code) and code check, plain-language errors, 30-minute idle sign-out shared across tabs, Sign out button, app name read from `platform_settings`. Two-factor is required for every signed-in user for now (all users are firm users until Phase 3). Automated browser tests (G-9) now run against a separate demo build (`vite build --mode demo`, sample data, no sign-in); normal builds always require sign-in. `@supabase/supabase-js` 2.117.2 added. |
| 2026-10-07 | P1-09 ✅ — Faizan set his password via the reset link and enrolled two-factor (TOTP factor verified in Supabase). |
| 2026-10-07 | **P1-10 invites built.** Database decides who may invite whom (Firm Admin → Firm Accountants; Super Admin → Firm Admins; client roles wait for Phase 3), checks email format and allowed domains (CFG-11, list empty for now — Q-23), expiry from `invite_expiry_days` (7); invitation becomes a membership on first sign-in, expired ones refused (CFG-10); copying the link is audit-logged (CFG-18). Server function `/api/invite` (secret key server-side only; 401 without session, 403 when refused — SEC-15) creates the one-time link and emails it via Resend using the editable template; the link is also shown once for "Copy invite link" (D-24). Local dev server now runs `api/` functions and reads `.env.local` from `poc/`. 147 database + 106 unit tests. |
| 2026-10-07 | OA-04 done by Faizan (public sign-up off; leaked-password protection needs the Pro plan — advisor still warns, tracked under OA-13). OA-16 deferred until deployment (local testing only). **P1-12/P1-13:** `create_client()` creates a client in one call (chart of accounts, monthly periods to end of next FY, VAT periods from the stagger with due dates from config, CT periods, number counters, accountant assignment). New live app frame (`src/live/`) — normal start shows only real-database screens; the demo build keeps the old POC screens. Exact AED→fils parser (`parseAedToFils`, refuses fractions of a fils). 168 database + 118 unit tests. |
| 2026-10-07 | **P1-14 built.** Journals (new, opening balances, drafts, submit, withdraw, delete), approval queue (approve & post / send back with a reason — the preparer never sees Approve), reversal requests approved by a second Firm Admin (D-26), chart of accounts (add, rename, CT treatment, deactivate), period lock/reopen with reason. Faizan applied `…101000` in the SQL Editor (the app's safety check blocks database changes containing deletes). 186 database + 138 unit tests. |
| 2026-10-07 | Faizan's tests (invite, clients, journals with maker-checker) recorded → P1-10, P1-12, P1-14 ✅. **P1-15 ✅:** `trial_balance()` / `general_ledger()` (calculated from posted journals each time, RLS applies, reversals net out, drafts never count) + Trial balance & ledger screen with drill-down to the journal; LED-13 proven with 1,000 random journals. Q-24 added (year-end presentation). 200 database + 145 unit tests. |
| 2026-10-07 | **P1-11 built:** Admin page (profile, tax rules with versioning and VERIFY sign-off flow, firm profile/settings, platform settings, email templates); layout fix so wide tables scroll inside their card. 159 unit tests. |
| 2026-10-07 | Q-07: Faizan confirmed all VERIFY values (unchanged); the in-app approval of a new version still has to be done to clear the flags. **P1-16 ✅** security headers + site password removed. |
| 2026-10-07 | **P1-17 ✅** live end-to-end journey in CI (G-9 on a temporary Supabase). Local Supabase config fix: in the CLI, `[auth.email] enable_signup=false` also disables email sign-in — sign-ups stay off via `[auth] enable_signup=false`. |
| 2026-10-07 | **P1-18 ✅** strict React rules on for all rebuilt code (shared `useLoad`/`useToday` hooks; lint 0 findings). P1-13 ✅. **Phase 1: every step built and tested — waiting for Faizan's sign-off.** |
| 2026-10-07 | Faizan: **work only on branch `faizan`; never touch `main`** unless he asks (CLAUDE.md and §3.2 updated). Q-24 → **D-28** (automatic roll-forward of prior-year P&L into Retained earnings in reports, P2-06). Admin → Tax rules: "Mark all VERIFY as checked today" button for draft versions. |
| 2026-10-07 | **Phase 1 approved by Faizan (G-10).** Phase 2 started. Still open from Phase 1: approve the VERIFY sign-off tax-rule version (Q-07, a few clicks in Admin → Tax rules). |
| 2026-10-07 | **P2-01 built:** customers & suppliers (database + screen). 214 database + 172 unit tests. |
| 2026-10-07 | Decisions D-29 (invoice date is the tax date) and D-30 (credit notes capped at the original invoice). P2-02 started. |
| 2026-10-07 | **P2-02 built:** sales invoices & credit notes (database calculation, numbering, posting, D-29/D-30), printable tax invoice, client address & details editing. Faizan applied `…101300` in the SQL Editor. Live journey extended to sales invoices. 247 database + 185 unit tests. |
| 2026-10-07 | Decisions D-31 (bill date is the tax date), D-32 (automatic non-recovery on failed checks, approver override with reason), D-33 (VAT on bills recalculated). P2-03 started. |
| 2026-10-07 | **P2-03 built:** purchase bills & debit notes, Art 59 checks + risk score, automatic VAT non-recovery with approver override, attachments (private storage, SHA-256 once per client), Purchase bills screen. 282 database + 194 unit tests; live journey now includes a bill approved by a second admin (VAT input 1,250 on the trial balance). Fixed the live-journey test ("Customer" also matched "Customer reference"). |
| 2026-10-07 | Decisions D-34 (AED 1.00 write-off limit + bank charges box), D-35 (advances with VAT deferred to the VAT return work), D-36 (Supplier advances), D-37 (exchange differences to 4310/6410). |
| 2026-10-08 | **P2-04 built:** receipts, supplier payments and refunds; allocations (automatic oldest-first or chosen); Customer Credits and Supplier advances applied automatically to the next invoice/bill; open items with ageing; new accounts 1160, 4310, 6190, 6410 added to every client. Faizan applied `…101600`. 319 database + 206 unit tests. |
| 2026-10-08 | Decisions D-38 (statement column mapping), D-39 (no VAT from bank lines), D-40 (reverse receipts/payments with approval), D-41 (approved, frozen reconciliations). **P2-05 built** and applied (`…20261008100000_bank.sql`); SheetJS added for Excel statements (loaded only on upload). 350 database + 218 unit tests. |
| 2026-10-08 | **P2-06 built:** P&L, balance sheet (D-28 roll-forward: earlier years' results shown in equity, ledger unchanged), ageing at any date, customer/supplier statements, Excel/PDF export; applied by Claude (additive SQL only). 367 database + 225 unit tests. |
| 2026-10-08 | **P2-07 (part):** contacts import from the Excel template (skip & list existing — Faizan). Opening balances / open items deferred: Faizan will set the data-migration rules later (Q-25). 376 database + 228 unit tests. |
| 2026-10-08 | **P2-08 built** — nightly integrity checks (pg_cron, applied by Faizan; job confirmed) and Integrity page. **All Phase 2 items built** (P2-07 opening balances/open items wait for Q-25). 390 database + 230 unit tests. |
| 2026-10-08 | Decisions D-42 (import-of-goods code IMG → Box 6), D-43 (manual VAT entries with reason), D-44 (lock on approval; prior-period items). **P3-01/P3-02 built:** VAT 201 return with drill-down and approval workflow; applied by Faizan. 417 database + 234 unit tests. Phase 2 awaiting Faizan's sign-off. |
| 2026-10-08 | Phase 2 gaps closed: SEC-13 (uploads checked by content — a renamed .exe is refused), SEC-20 (document links 60 s), FX-05, DM-02, VAT-12 tests, NUM-05 (20 parallel connections in CI); already-covered tests ticked; ARAP-07 noted as stricter than written. Remaining for Phase 2: Faizan's test & sign-off, and the exit test (one pilot client's quarter re-keyed, Q-01; opening balances by journal or Q-25). |
| 2026-10-08 | **Formula audit** (Faizan): all formulas F-01→F-25 reviewed against the code; new test `18_formula_audit.sql` posts a full quarter (AED/USD, credit/debit notes, blocked & overridden VAT, RCS, IMG, overpayment, refund, bank charges, reversed journal) and proves 20 identities — TB balances, BS balances, P&L = BS result = TB, VAT boxes = VAT accounts (2100/1300/2110/1310), sales boxes = income accounts, ageing = control accounts, credits/advances = 2150/1160, statement = open items − credits, integrity ok. Faizan's P&L query (JV-2026-10-0001) explained: correct arithmetic, mis-posted entry. Faizan asked to proceed with Phase 3 after the audit; Phase 2 exit test still to do. |
| 2026-10-08 | D-45 (boxes 12/13 include adjustments), D-46 (full-tax-invoice warning), D-47 (VAT clearing into 2120). **P3-03 reconciliation built**; Faizan applied `…100500` and `…100600`. 433 database + 242 unit tests. |
| 2026-10-08 | D-48 (2FA for every user), D-49 (read-only 90 days, max 1 year). **P3-06 built**: client logins with RBAC-15/16/20; permission gaps closed (receipts → record_payment, bank matching → bank_match, uploads → upload). Applied by Faizan. 459 database + 248 unit tests. |
| 2026-10-08 | **P3-07 built:** firm dashboard (applied by Claude — additive). 467 database + 253 unit tests. |
| 2026-10-08 | D-50, D-51. **P3-05 built:** compliance calendar, reminders job, test email, email log. 478 database + 264 unit tests. |
| 2026-10-08 | Faizan tested Deadlines, the VAT return (boxes, drill-down, reconciliation, adjustments, approval/freeze/lock, filing, exports) and client logins (invite, roles, 2FA, removal) — all fine. P3-01/02/03/05/06 ✅. Still open in Phase 3: P3-04 golden set, P3-08 → 3-12 (deployment), FAF (later). Phase 2: sign-off + exit test (Q-01). |
| 2026-10-08 | **D-52 built** (opening documents via 3999, applied by Faizan) + "Opening balances" client tab; `…101100_bank_fk_indexes.sql` closes 4 performance-advisor notices on the bank tables. Exit-test procedure in `docs/PHASE2-EXIT-TEST.md` (D-53 anonymised data). 512 database + 267 unit tests. |
