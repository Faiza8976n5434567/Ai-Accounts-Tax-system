# Spec 03 — Configuration, formulas & Super Admin settings

| | |
|---|---|
| **Status** | ✅ Approved by Faizan, 2026-10-06 |
| **Implements** | PLAN.md Phase 1 (settings, invites, tax rules) and Phase 3 (email, reminders) |
| **Related** | [01 Data model](01-data-model.md) §4.11 · [02 Roles](02-roles-rbac.md) |

## In plain words

You asked to be able to change formulas later without a developer. The safe way to do this:

- **The numbers inside the formulas are editable by you** — VAT rate, CT rate, AED 375,000
  band, SBR limit, due-date days, add-back percentages, ageing buckets, which VAT box each
  tax code goes to, and so on. You change them on a **Tax Rules** screen.
- **The shape of the formula stays in tested code** — e.g. "CT = rate × (taxable income − band)".
  If the law changes the *shape* of a calculation, that is a small code change with tests.

Why not let anyone type formulas? A typo in a free-text formula silently produces wrong tax
for every client, with no test to catch it. Editable *parameters* give you 95% of the
flexibility with none of that risk. (See §4.)

Every change to a tax rule is **versioned with an effective date**: a 2025 return always
recalculates with 2025 rules, and an approved return never changes.

---

## 1. Formula catalogue

Every calculation the app performs. **Editable** = parameter on the Tax Rules / Settings screen.

| ID | Formula | Editable parameters (key) | Default | Legal ref | Tests |
|---|---|---|---|---|---|
| **F-01** | Line VAT = round-half-up( net × rate ÷ 10,000 ) | `vat.rate_bp` | 500 (5%) | FDL 8/2017 Art 3 | VAT-01, VAT-09 |
| **F-02** | VAT inside a gross amount = gross × rate ÷ (10,000 + rate) | `vat.rate_bp` | 500 | — | VAT-17 |
| **F-03** | Which VAT 201 box a line goes to (by tax code, sale/purchase, emirate) | `tax_codes.output_box / input_box`, `emirates.vat_box` | per FTA form | VAT 201 form | VAT-01…08 |
| **F-04** | Box 8 = Σ output boxes; 11 = Σ input boxes; 12 = VAT of 8 + adjustment of 8; 13 = VAT of 11 + adjustment of 11 (D-45); 14 = 12 − 13 | — (fixed) | — | VAT 201 form | VAT-11 |
| **F-05** | VAT return due date = period end + N days | `vat.return_due_days` | 28 | Exec. Reg. Art 69 — VERIFY | VAT-12 |
| **F-06** | VAT periods for a client = stagger from first period end, every 3 (or 1) months | per client: `vat_period`, `vat_first_period_end` | — | FTA registration certificate | CFG-06 |
| **F-07** | Input VAT recoverable only if valid tax invoice + supplier TRN + not blocked | `vat.full_invoice_threshold` | AED 10,000 | Exec. Reg. Art 59 — VERIFY | VAT-07, VAT-08 |
| **F-08** | Taxable income = accounting profit + Σ (expense on CT-tagged accounts × add-back %) | `ct.addback.<tag>` | ENTERTAINMENT 50%, FINES 100%, DONATION_NON_QPBE 100%, NON_DEDUCTIBLE 100% | FDL 47/2022 Art 32–33 | CT-03, CT-04 |
| **F-09** | CT payable = rate × max(0, taxable income − zero band) | `ct.rate_bp`, `ct.zero_band` | 900, AED 375,000 | Art 3; CD 116/2022 | CT-01, CT-02 |
| **F-10** | Loss relief used = min(losses brought forward, cap% × taxable income) | `ct.loss_cap_bp` | 7,500 (75%) | Art 37 | CT-06, CT-07 |
| **F-11** | SBR eligible = revenue ≤ limit (this and prior periods) **and** period end ≤ last SBR date **and** not QFZP | `ct.sbr_limit`, `ct.sbr_last_period_end` | AED 3,000,000; 2029-12-31 (VERIFY) | Art 21; MD 73/2023 | CT-08, CT-09 |
| **F-12** | CT return due = last day of the Nth month after year end | `ct.return_due_months` | 9 | Art 53 | CT-10 |
| **F-13** | Invoice due date = issue date + payment terms | firm default `default_payment_terms_days`; per contact override | 30 | — | ARAP-01 |
| **F-14** | Ageing bucket of an open item = days past due → bucket | `ageing_buckets` | Current, 1–30, 31–60, 61–90, 90+ | — | ARAP-01 |
| **F-15** | Customer credit = receipts − allocations; auto-apply oldest invoice first | `auto_apply_customer_credits` (on/off) | on | IAS 1 / IFRS 15 (D-11) | ARAP-05, 08–12 |
| **F-16** | Bank auto-match = same amount and date within ± N days, one-to-one | `bank_match_tolerance_days` | 5 | — | BANK-02 |
| **F-17** | Bill risk score = Σ weights of failed checks → Low / Medium / High | `risk_weights`, `risk_thresholds` | error 22, duplicate/unregistered 45, warning 10; Medium ≥ 15, High ≥ 45 | — | CFG-08 |
| **F-18** | TRN format = 15 digits starting with 1 | — (fixed, code) | — | FTA | ARAP-07 |
| **F-19** | Rounding = half-up to 2 dp at **line** level | — (fixed, code) | — | D-08 | VAT-09 |
| **F-20** | Compliance deadlines = rule offset from period/year end or licence expiry | `compliance_rules` | VAT +28 days; CT +9 months; licence −30 days reminder | various | CFG-07 |
| **F-21** | Depreciation (straight-line) = (cost − residual) ÷ useful life, monthly | per asset | — | IAS 16 | *Phase 5* |
| **F-22** | E-invoicing dates (ASP appointment, go-live) | `einvoicing.asp_by`, `einvoicing.go_live` | 2027-03-31, 2027-07-01 (VERIFY) | MD 244/2025 | *Phase 4* |
| **F-23** | Dashboard ratios (annualised revenue, DSO, collection %) | — (fixed, display only) | — | — | E2E |
| **F-24** | USD → AED: line AED amount = round-half-up(USD amount × rate); VAT then calculated on the AED line (F-01); a USD payment that exactly matches a USD invoice settles its full AED total | `fx.usd_aed` | 3.6725 | CBUAE peg; D-21 | FX-01 → 06 |
| **F-25** | Document number = `{PREFIX}-{YYYY}-{MM}-{SEQ:4}`; one running counter per client / type (never restarts monthly), year-month from document date, assigned at posting | `numbering_format`, prefixes | Jan `INV-2026-01-0100` → Feb `INV-2026-02-0101` | FTA sequential numbering; D-22 | NUM-01 → 08 |

---

## 2. How tax-rule changes work (versioning)

```
 Draft version ──► Impact preview ──► Approve ──► Effective from date X
 (copy of current)  (recalculates last         (second admin if     (old version kept
                     quarter for one client,     available; reason   for earlier periods)
                     shows before/after)         + legal ref required)
```

Rules:
1. Values live in `config_versions` / `config_values` with `effective_from` / `effective_to`.
2. Calculations pick the version whose dates cover the **tax period**, not today's date.
3. Every VAT/CT result stores the `config_version_id` it used.
4. **Approved returns never change**, even if a rule is edited later (they're frozen snapshots).
5. Each value carries its **legal reference**, **last verified date** and a **VERIFY** flag; the app shows a banner while any value used in a return is still VERIFY.
6. Validation stops nonsense: rates 0–100%, money ≥ 0, dates in order, every tax code mapped to a real box.
7. Changes are audit-logged with before/after.

---

## 3. Super Admin settings (the "Admin" area)

| Section | Settings | Stored in | Who |
|---|---|---|---|
| **Platform** (D-20) | App name (may change — used in titles, emails, exports), logo, email sender (`onboarding@resend.dev` in development, D-24), support email; list of firms using the platform; add a firm + its first Firm Admin | `platform_settings`, `firms` | Super Admin |
| **Tax rules** | Every editable parameter in §1 (versioned); tax code → box mapping; CT tags & add-back %; compliance rules | `config_*`, `tax_codes`, `ct_tags`, `compliance_rules` | Super Admin |
| **Users & invites** | Invite users (role, client, end date for read-only); resend/revoke invites; suspend/reactivate; invite expiry days; allowed email domains for firm staff (e.g. `@tfsplus.ae`) | `invitations`, `profiles`, `firm_settings` | Super Admin; Firm Admin (limited, see Spec 02) |
| **Email** | Sender name, from-address, reply-to, which alerts are on, reminder lead days (e.g. 14 / 7 / 1 days before deadlines), daily digest on/off, **templates** (invite, reminder, approval waiting, integrity alert) with preview + "send test email" | `firm_settings`, `email_templates` | Super Admin |
| **Client onboarding defaults** | Default chart-of-accounts template, default payment terms, default VAT period, invoice/journal number prefixes, fiscal year start | `firm_settings`, `coa_templates` | Super Admin, Firm Admin |
| **Operations** | Ageing buckets, bank match tolerance, auto-apply customer credits, risk weights, integrity-check alert recipients | `firm_settings` | Super Admin, Firm Admin |
| **Firm profile** | Legal name, TRN, tax agency number, logo, address (appears on exports) | `firms` | Super Admin |
| **Audit** | Search audit log; export | `audit_log` | Super Admin, Firm Admin |

**Secrets are never stored in these tables** (Resend API key, Supabase service key). They live in
Vercel environment variables / the Supabase dashboard — see [OWNER-ACTIONS.md](../OWNER-ACTIONS.md).

### 3.1 Client onboarding flow (Firm Admin)
1. *Add client* — legal name, TRN, CT TRN, licence, emirate, VAT stagger, regime, fiscal year.
2. System copies the default chart of accounts, creates monthly periods and VAT periods, generates compliance deadlines, sets number sequences.
3. Assign Firm Accountant(s).
4. Enter opening balances (opening journal, needs approval).
5. Optionally invite the Client Owner (Phase 3).

### 3.2 Invite flow
1. Admin enters email + role (+ client, + end date for read-only).
2. Server function (Vercel, secret key) checks the inviter's rights, creates the `invitations` row, asks Supabase Auth for a one-time invite link (`generateLink`), and sends it through **Resend using the editable `invite` template** — so invite wording is configurable in the app. (Password-reset emails use Supabase's own templates via Resend SMTP, OA-10.)
3. User clicks the link, sets a password, **firm users must set up MFA before seeing anything**.
4. On first sign-in the database turns the invitation into `firm_members` / `org_memberships` rows.
5. Expired / revoked invites can't be used; everything is audit-logged.
6. Because the development sender (`onboarding@resend.dev`) only reaches the Resend account owner, the invite screen also offers **"Copy invite link"** so you can send it yourself (D-24).

---

## 4. Over-engineering check on configuration

| Tempting idea | Why it's impractical | What we do instead |
|---|---|---|
| Formula editor (type your own formulas) | One typo = wrong tax for all clients; untestable | Editable **parameters** + versioning + impact preview (§2) |
| Editable permission matrix in the UI | Easy to lock yourself out or open data to the wrong role | Six fixed roles; permission table changed only by tested migration |
| Drag-and-drop workflow builder for approvals | Big build, rarely changed | Fixed draft → approve → post with maker-checker |
| Template designer for invoices/PDFs | Weeks of work | One clean branded layout; logo/address from firm profile |
| Per-client custom tax rules | Breaks consistency, audit nightmare | One rule set per period; client-level only where the law differs (stagger, regime) |

---

## 5. Test cases (CFG-*)

| ID | Scenario | Expected |
|---|---|---|
| CFG-01 | Change `ct.zero_band` effective 2027-01-01 | FY2026 CT unchanged; FY2027 uses new value |
| CFG-02 | Edit a rule used by an approved VAT return | Approved return figures unchanged (snapshot) |
| CFG-03 | Enter VAT rate 150% | Rejected by validation |
| CFG-04 | Map a tax code to a non-existent box | Rejected |
| CFG-05 | Firm Accountant opens Tax Rules | View only; save rejected by database |
| CFG-06 | Client with first VAT period ending 2026-02-28, quarterly | Periods Mar–May, Jun–Aug, Sep–Nov…; due dates +28 days |
| CFG-07 | Licence expiry 2026-11-30, reminder 30 days | Deadline item on 2026-10-31 |
| CFG-08 | Change risk weights | Next bill check uses new weights; old bills keep their stored result |
| CFG-09 | Impact preview for a rate change | Shows before/after per box for chosen client & quarter; nothing saved |
| CFG-10 | Invite expired (past `invite_expiry_days`) | Link rejected; status `expired` |
| CFG-11 | Firm-staff invite to a non-allowed email domain | Rejected |
| CFG-12 | "Send test email" from template screen | Email received; `email_log` row with provider id |
| CFG-13 | Every config change | Audit row with before/after, user, reason |
| CFG-14 | Change the app name | New name in page titles, emails and exports; no code change |
| CFG-15 | Change `numbering_format` | Next posted document uses the new format; existing numbers unchanged |
| CFG-16 | Tax-rule change with **one** Super Admin | Saved only with a written reason; audit-logged (D-23) |
| CFG-17 | Tax-rule change after a second Super Admin is added | Needs the other Super Admin's approval (D-23) |
| CFG-18 | "Copy invite link" | Link works once, expires per `invite_expiry_days`, copying is audit-logged (D-24) |
