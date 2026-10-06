# Owner actions — things only Faizan can do

These need your accounts, passwords, money or legal judgement, so Claude can't do them.
Each one says **why**, gives **steps**, and says how to know it's **done**. Tick them off in
PLAN.md as you go. Screen names in Supabase/Vercel/GitHub may differ slightly over time.

> **Golden rule for secrets:** never paste a secret key, password or API key into the chat.
> Put it straight into Vercel / Supabase / your local `.env.local` file as described below.

| # | Action | Needed by | Time |
|---|---|---|---|
| OA-01 | Answer open questions & approve specs | Phase 1 start | 30 min |
| OA-02 | Turn on two-factor login on all admin accounts | Phase 1 start | 20 min |
| OA-03 | Rename the project folder | Phase 1 start | 5 min |
| OA-04 | Supabase: authentication settings | Phase 1 | 15 min |
| OA-05 | Local `.env.local` file for development | Phase 1 | 10 min |
| OA-06 | Vercel environment variables | Phase 1 | 15 min |
| OA-07 | GitHub: protect the `main` branch + CI secrets | Phase 1 | 15 min |
| OA-08 | Provide golden test examples (VAT & CT) | Phase 1 | 2–3 hrs |
| OA-09 | Resend: account + verify your email domain | Phase 3 (earlier is fine) | 30 min + DNS wait |
| OA-10 | Supabase: send auth emails through Resend (SMTP) | Phase 3 | 10 min |
| OA-11 | Choose the app web address (domain) | Phase 3 | 15 min |
| OA-12 | Create the separate **Live** Supabase project | Before pilot | 15 min |
| OA-13 | Backups & plan upgrades before real client data | Before pilot | 15 min + cost |
| OA-14 | Engagement-letter clause on data hosting | Before pilot | legal |
| OA-15 | Book the independent security review | Before pilot | — |

---

### OA-01 · Answer open questions & approve specs
**Why:** code starts only from approved specs.
1. Read `docs/specs/01` to `05` (each starts with an "In plain words" summary).
2. Reply in chat: "Approved" or your changes, plus answers to the questions in PLAN.md §2.

**Done when:** specs show ✅ Approved in `docs/specs/README.md`.

### OA-02 · Two-factor login on admin accounts
**Why:** whoever controls these accounts controls your clients' data.
For each of **GitHub, Vercel, Supabase, Resend, your domain registrar, your email**:
1. Open account/security settings → enable **Two-factor authentication** with an authenticator app (Google/Microsoft Authenticator).
2. Save the recovery codes somewhere safe (password manager or printed in a safe).

**Done when:** all six show 2FA enabled.

### OA-03 · Rename the project folder
**Why:** the `&` in "Ai Acconting & Tax system" breaks some developer tools on Windows.
1. Close Claude and any editor using the folder.
2. In File Explorer rename it to `Ai Accounting and Tax system`.
3. Reopen it in Claude.

**Done when:** Claude can run `npm run dev` normally.

### OA-04 · Supabase authentication settings
**Why:** invite-only access and two-factor login are enforced here.
In the Supabase dashboard → project **Ai Accounting & Tax System**:
1. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up". Keep email provider on.
2. **Authentication → Multi-Factor:** enable **TOTP (authenticator app)**.
3. **Authentication → Policies / Passwords:** minimum length **12**; enable leaked-password protection if your plan offers it.
4. **Authentication → URL Configuration:** Site URL `http://localhost:5180` for now; add redirect URL `http://localhost:5180/**`, plus your Vercel preview address pattern (Claude will give you the exact text once the Vercel project is checked). Add your real domain later (OA-11).

**Done when:** a sign-up attempt from the app login page is refused.

### OA-05 · Local `.env.local` file (for running the app on your PC)
**Why:** the app needs to know which Supabase project to talk to.
1. Supabase → **Project Settings → API Keys**. Copy the **Project URL** and the **publishable (anon) key**. These are safe to be public.
2. In the `poc` folder create a file named `.env.local` (Claude will create it with blanks for you to fill in):
   ```
   VITE_SUPABASE_URL=<project URL>
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   SUPABASE_SECRET_KEY=<secret key — from the same page, "secret" section>
   ```
3. Save. This file is ignored by git and never uploaded.

**Done when:** the app shows the login screen instead of demo data.

### OA-06 · Vercel environment variables
**Why:** the live and preview sites need the same settings, with secrets kept on the server.
Vercel → your project → **Settings → Environment Variables**. Add each, choosing the environment:

| Name | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | Test project URL | Preview, Development |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Test publishable key | Preview, Development |
| `SUPABASE_SECRET_KEY` | Test secret key | Preview, Development |
| `RESEND_API_KEY` | from OA-09 | Preview, Production |
| `APP_BASE_URL` | your site address | each |
| *(Production values point to the **Live** project after OA-12)* | | Production |

Never add a `VITE_` prefix to a secret (anything with `VITE_` becomes visible in the browser).
Remove `SITE_PASSWORD` once real logins are live (Claude will tell you when).

**Done when:** a new preview deployment loads the login page.

### OA-07 · GitHub: protect `main` + CI secrets
**Why:** nothing reaches the live site without passing the checks.
1. GitHub repo → **Settings → Branches → Add branch ruleset** (or protection rule) for `main`:
   require a pull request; require status checks "CI" to pass; block force pushes.
2. **Settings → Secrets and variables → Actions → New repository secret**: `SUPABASE_TEST_URL`, `SUPABASE_TEST_SECRET_KEY` (Test project only — never Live).
3. **Settings → Code security:** enable Dependabot alerts.

**Done when:** a pull request shows the CI checks running.

### OA-08 · Golden test examples
**Why:** the system must match your manual work **to the fils** — this is the main quality gate.
Prepare (anonymised: replace client names):
1. One VAT quarter: list of sales and purchases (date, net, VAT, tax treatment, emirate) + your final VAT 201 figures.
2. One CT computation: P&L totals, add-backs, losses brought forward, final CT.
3. Any tricky cases you see often (credit notes, reverse charge, blocked VAT, overpayments).

Excel is perfect. Send in chat or save into `docs/golden/` (Claude will create the folder).

**Done when:** Claude has turned them into tests `VAT-15` and `CT-11`.

### OA-09 · Resend account + verified domain
**Why:** alerts and invites must come from your own domain (e.g. `no-reply@tfsplus.ae`), not land in spam.
1. Sign up at resend.com (free tier: about 3,000 emails/month — check current limits).
2. **Domains → Add domain**: use a sub-domain such as `mail.tfsplus.ae`.
3. Resend shows DNS records (TXT for SPF/DKIM, MX). Add them at your domain registrar/DNS provider (or send them to whoever manages your website).
4. Add a **DMARC** TXT record if you don't have one (Resend suggests the value).
5. Wait for "Verified" (minutes to a few hours).
6. **API Keys → Create** (permission: sending access). Paste it into Vercel as `RESEND_API_KEY` (OA-06). Don't paste it in chat.

**Done when:** Resend shows the domain as Verified.

### OA-10 · Supabase auth emails through Resend
**Why:** password-reset emails also come from your domain; Supabase's built-in email is rate-limited.
Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key,
sender = `no-reply@mail.tfsplus.ae`, sender name `TFS+ Smart Ledger`.

**Done when:** a "forgot password" email arrives from your domain.

### OA-11 · App web address
1. Choose an address, e.g. `ledger.tfsplus.ae`.
2. Vercel → project → **Settings → Domains → Add** → it shows a CNAME record → add it at your DNS provider.
3. Add the address to Supabase URL Configuration (OA-04 step 4) and to `APP_BASE_URL` (OA-06).

### OA-12 · Separate Live Supabase project
**Why:** testing must never touch real client data.
1. Supabase → **New project** `tfs-ledger-live` (free plan allows 2 projects).
2. Repeat OA-04 for it.
3. Tell Claude — it applies the same migrations, then you put its keys into Vercel **Production** variables.

### OA-13 · Backups & plans before real client data
1. **Supabase Free has no restorable backups and pauses after a week of inactivity.** Before real data: upgrade the Live project to **Pro** (daily backups), or approve the nightly encrypted export Claude sets up (PLAN Phase 3).
2. **Vercel Hobby is for non-commercial use** — upgrade to Pro before charging clients.

### OA-14 · Engagement-letter clause
Until Phase 6 (UAE self-hosting) data is stored in Singapore. Add a clause to pilot clients' engagement letters covering hosting outside the UAE and the use of sub-processors (Supabase, Vercel, Resend). Your legal/compliance judgement applies.

### OA-15 · Independent security review
Book a freelance senior developer/security reviewer for 2–3 days near the end of Phase 3 (Q-03). Claude will prepare a reviewer pack (architecture, specs, test results).

---

## Runbook: if a key leaks
1. Supabase → API Keys → **rotate** the leaked key (or Resend → revoke API key).
2. Put the new key in Vercel (and `.env.local`), redeploy.
3. Ask Claude to review `audit_log` and Supabase logs for the exposure window.
4. Inform affected clients if any data was accessed.
