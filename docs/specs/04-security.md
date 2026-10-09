# Spec 04 — Security

| | |
|---|---|
| **Status** | ✅ Approved by Faizan, 2026-10-06 |
| **Implements** | Every phase (controls are added as each feature lands) |
| **Related** | [02 Roles](02-roles-rbac.md) · [OWNER-ACTIONS](../OWNER-ACTIONS.md) |

## In plain words

Security is built in **five layers**, so that if one fails the next one still protects the
data. The most important layer is the database itself: even with a bug in the app, a user
can only ever reach their own client's data, and nobody can change posted figures.

| Layer | Protects against |
|---|---|
| 1. Accounts & login | Stolen passwords, shared logins |
| 2. Application (browser) | Malicious input, data leaking into the page, clickjacking |
| 3. Code & build | Vulnerable libraries, leaked keys, untested changes |
| 4. Database (RLS, functions, triggers) | Seeing other clients' data, editing history, bypassing approvals |
| 5. Hosting & operations | Lost data, compromised admin accounts, unnoticed problems |

---

## 1. Accounts & login

| ID | Control | How |
|---|---|---|
| S-1.1 | **Invite-only** — public sign-up switched off | Supabase Auth setting (owner action) |
| S-1.2 | **Two-factor (MFA, authenticator app)** mandatory for firm users | Supabase MFA (TOTP) + database refuses non-MFA sessions (RBAC R6) |
| S-1.3 | Strong passwords (min. 12 chars, leaked-password check if plan allows) | Supabase Auth settings |
| S-1.4 | Idle sign-out after 30 minutes; session refresh limits | App idle timer + Supabase session settings |
| S-1.5 | Login, MFA and invite emails sent from your own domain | Resend SMTP with SPF/DKIM/DMARC |
| S-1.6 | Suspended users lose access immediately | `profiles.status` checked in RLS helpers |
| S-1.7 | Firm staff must use the firm email domain | Invite rule (Spec 03 CFG-11) |

## 2. Application (browser)

| ID | Control | How |
|---|---|---|
| S-2.1 | Only the **public** Supabase key is in the browser; it can do nothing without RLS permission | Build check: no `service_role`/secret key strings in `dist/` |
| S-2.2 | Security headers | `vercel.json`: Content-Security-Policy (self + Supabase URL only), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| S-2.3 | No raw HTML rendering | Lint bans `dangerouslySetInnerHTML` |
| S-2.4 | Input validation on every form | Zod schemas, shared with server functions |
| S-2.5 | Upload limits | PDF/JPG/PNG/CSV/XLSX only, ≤ 10 MB, checked in browser **and** storage policy |
| S-2.6 | Excel/CSV export can't run formulas (CSV injection) | Cells starting with `= + - @` are escaped |
| S-2.7 | Files opened via short-lived signed links (60 s), never public URLs | Private bucket |
| S-2.8 | Friendly errors; no stack traces or SQL shown to users | Central error handler |

## 3. Code & build

| ID | Control | How |
|---|---|---|
| S-3.1 | Secrets only in environment variables, never in git | `.env*` git-ignored; **gitleaks** scan in CI |
| S-3.2 | Dependency vulnerabilities | `npm audit --audit-level=high` in CI (fails the build) |
| S-3.3 | Strict TypeScript + ESLint (incl. no `eval`, no unsafe HTML) | Gates G-1, G-2 |
| S-3.4 | Finance lint (no floats, no hard-coded rates/dates) | Gate G-3 |
| S-3.5 | Every change via pull request on GitHub; `main` protected | Branch protection (owner action) |
| S-3.6 | Server functions (Vercel `/api`) check the caller's session and role before using the secret key | Shared `requireUser(role)` helper + tests |
| S-3.7 | Lockfile committed; versions reviewed when upgrading | `package-lock.json` |

## 4. Database (the strongest layer)

| ID | Control | How |
|---|---|---|
| S-4.1 | RLS on **every** table; `anon` has no access | Policies per Spec 02 §3.1; advisor check |
| S-4.2 | Restrictive MFA policy for firm users | `app.mfa_ok()` |
| S-4.3 | Posting, approving, locking, inviting only via functions that re-check permission | `post_journal`, `approve_vat_return`, `lock_period`, … |
| S-4.4 | Immutability of posted journals, approved returns and the audit log | Triggers block update/delete |
| S-4.5 | Every change audit-logged (who, when, before/after) | Generic audit trigger on all business tables |
| S-4.6 | Helper functions: `security definer` + `set search_path = ''`; private `app` schema **not exposed** to the API | Supabase "exposed schemas" = `public` only |
| S-4.7 | Data-integrity constraints (balance, FKs, uniques, checks) | Spec 01 |
| S-4.8 | Supabase security & performance advisors = 0 findings | Gate G-6 after every migration |
| S-4.9 | Migrations are files in git, proven on a temporary CI database, then applied; forward-only | `supabase/migrations/` |

## 5. Hosting & operations

| ID | Control | How |
|---|---|---|
| S-5.1 | One Supabase project (D-18): automated tests never touch it — they run on a temporary Supabase in GitHub Actions; demo data removed at production cut-over | CI + PLAN P3-12 |
| S-5.2 | Two-factor on every admin account: GitHub, Vercel, Supabase, Resend, domain registrar | Owner action |
| S-5.3 | Backups: Free plan has none you can restore from → nightly encrypted database export (GitHub Action) until moving to Pro/self-hosted; monthly restore test | PLAN Phase 3 / 6 |
| S-5.4 | Nightly integrity checks + email alert | Spec 03 |
| S-5.5 | Key rotation: if a key leaks, rotate in Supabase/Resend and update Vercel within 1 hour | Runbook in OWNER-ACTIONS |
| S-5.6 | Incident steps: suspend user → rotate keys → review audit log → inform affected clients | Runbook |
| S-5.7 | Data protection (UAE PDPL): collect only what's needed; no Emirates ID/passport storage in v1; engagement letters cover hosting outside the UAE until Phase 6 | Policy |
| S-5.8 | Independent security review before real client data; pen-test before scaling | PLAN Q-03, Phase 6 |

---

## 6. Security test cases (SEC-*)

Extends the SEC list in PLAN.md §6.2 (SEC-01…10 remain; RBAC-* in Spec 02).

| ID | Scenario | Expected | Type |
|---|---|---|---|
| SEC-11 | Built `dist/` scanned for secret keys | None found | Build |
| SEC-12 | Response headers on the live site | CSP, HSTS, X-Frame-Options, nosniff present | E2E |
| SEC-13 | Upload a `.exe` renamed to `.pdf` / an 11 MB file | Rejected | E2E |
| SEC-14 | Export a contact named `=HYPERLINK(...)` | Cell escaped in Excel | U |
| SEC-15 | Call a Vercel `/api` function without a session / with a Client Staff session | 401 / 403 | U |
| SEC-16 | Suspended user with a still-valid session token | 0 rows returned | D |
| SEC-17 | Update an `audit_log` row as Super Admin | Rejected | D |
| SEC-18 | `gitleaks` on the repository | 0 findings | CI |
| SEC-19 | `npm audit --audit-level=high` | 0 findings | CI |
| SEC-20 | Signed document link reused after 60 s | Expired | E2E |
| SEC-21 | Idle for 30 minutes | Signed out | E2E |
