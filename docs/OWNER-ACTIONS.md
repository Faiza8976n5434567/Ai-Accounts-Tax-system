# Owner actions — things only Faizan can do

These need your accounts, passwords, money or legal judgement, so Claude can't do them.
Each one says **why**, gives **steps**, and says how to know it's **done**. Tick them off in
PLAN.md as you go. Screen names in Supabase/Vercel/GitHub may differ slightly over time.

> **Golden rule for secrets:** never paste a secret key, password or API key into the chat.
> Put it straight into Vercel / Supabase / your local `.env.local` file as described below.

| # | Action | Needed by | Time |
|---|---|---|---|
| OA-01 | Answer open questions & approve specs — ✅ done 2026-10-06 | Phase 1 start | — |
| OA-02 | Turn on two-factor login on all admin accounts | Phase 1 start | 20 min |
| OA-03 | Rename the project folder | Phase 1 start | 5 min |
| OA-04 | Supabase: authentication settings | Phase 1 | 15 min |
| OA-05 | Local `.env.local` file for development — ✅ done by Claude | Phase 1 | — |
| OA-06 | Vercel environment variables | Phase 1 | 15 min |
| OA-07 | GitHub: protect the `main` branch | Phase 1 | 10 min |
| OA-08 | Provide golden test examples (VAT & CT) | Phase 1 | 2–3 hrs |
| OA-09 | Resend: account + verify your email domain | Phase 3 (earlier is fine) | 30 min + DNS wait |
| OA-10 | Supabase: send auth emails through Resend (SMTP) | Phase 3 | 10 min |
| OA-11 | Choose the app web address (domain) | Phase 3 | 15 min |
| ~~OA-12~~ | ~~Separate Live project~~ — not needed (D-18) | — | — |
| OA-13 | Backups & plan upgrades before real client data | Before pilot | 15 min + cost |
| OA-14 | Engagement-letter clause on data hosting | Before pilot | legal |
| OA-15 | Book the independent security review | Before pilot | — |
| **OA-16** | **Rotate the secret key and Resend key shared in chat** | **Now** | 10 min |

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
4. **Authentication → URL Configuration:** Site URL `https://ai-accounts-tax-system.vercel.app`; add redirect URLs `https://ai-accounts-tax-system.vercel.app/**` and `http://localhost:5180/**`. Add your own domain later (OA-11).

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

**Status:** ✅ Done — Claude created `poc/.env.local` (git-ignored) and verified both Supabase keys work. After OA-16, replace the two rotated values in that file.

**Done when:** the app shows the login screen instead of demo data.

### OA-06 · Vercel environment variables
**Why:** the live and preview sites need the same settings, with secrets kept on the server.
Vercel → your project → **Settings → Environment Variables**. Add each, choosing the environment:

| Name | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://mmsdgyvaxxsyzsowongx.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your publishable key (`sb_publishable_…`) | Production, Preview, Development |
| `SUPABASE_URL` | same URL as above | Production, Preview |
| `SUPABASE_SECRET_KEY` | the **new** secret key after OA-16 | Production, Preview |
| `RESEND_API_KEY` | the **new** Resend key after OA-16 | Production, Preview |
| `APP_BASE_URL` | `https://ai-accounts-tax-system.vercel.app` | Production |

Note: this is a Vite app, so browser variables start with `VITE_` — not `NEXT_PUBLIC_` (that prefix is for Next.js).

Never add a `VITE_` prefix to a secret (anything with `VITE_` becomes visible in the browser).
Remove `SITE_PASSWORD` once real logins are live (Claude will tell you when).

**Done when:** a new preview deployment loads the login page.

### OA-07 · GitHub: protect `main` + CI secrets
**Why:** nothing reaches the live site without passing the checks.
1. GitHub repo → **Settings → Branches → Add branch ruleset** (or protection rule) for `main`:
   require a pull request; require status checks "CI" to pass; block force pushes.
2. No database secrets are needed in GitHub: automated tests start their own temporary Supabase inside GitHub Actions (D-18).
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

> **For now (D-24):** we use Resend's test sender `onboarding@resend.dev`. It only delivers to the email address that owns your Resend account — enough for you to test, but **invites to staff won't arrive** until the steps below are done (Q-19).
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

### ~~OA-12~~ · Separate Live project — not needed
Decision D-18: the current project becomes production. Its safety comes from tests running on a temporary database and the production cut-over step (PLAN P3-12).

### OA-13 · Backups & plans before real client data
1. **Supabase Free has no restorable backups and pauses after a week of inactivity.** Before real data: upgrade the project to **Pro** (daily backups), or approve the nightly encrypted export Claude sets up (PLAN Phase 3).
2. **Vercel Hobby is for non-commercial use** — upgrade to Pro before charging clients.

### OA-14 · Engagement-letter clause
Until Phase 6 (UAE self-hosting) data is stored in Singapore. Add a clause to pilot clients' engagement letters covering hosting outside the UAE and the use of sub-processors (Supabase, Vercel, Resend). Your legal/compliance judgement applies.

### OA-15 · Independent security review
Book a freelance senior developer/security reviewer for 2–3 days near the end of Phase 3 (Q-03). Claude will prepare a reviewer pack (architecture, specs, test results).

---

### OA-16 · Rotate the keys shared in chat (do this now)
**Why:** the Supabase **secret** key and the Resend API key were pasted into the chat, so they now sit in a conversation log. Treat them as exposed. (The publishable key and project URL are public by design — no action needed.)
1. **Supabase** → Project Settings → **API Keys** → *Secret keys* → create a new secret key, then delete the old one (starts `sb_secret_1ShA…`).
2. **Resend** → **API Keys** → delete the old key (starts `re_Pmew…`) → create a new one with **Sending access** (as before — that restriction is good).
3. Open `poc/.env.local` in Notepad and replace the two values. Save.
4. Later, use the new values in Vercel (OA-06).
5. Tell Claude "keys rotated" — it will re-check they work, without you pasting them.

**Done when:** the old keys are deleted and the app still connects.

## Runbook: locked out (break-glass, D-25)
You are the only Super Admin, so keep this safe.
1. **Prevent it:** when you set up two-factor login, save the recovery codes offline; keep your Supabase dashboard login (with its own 2FA) separate from the app login.
2. **If you lose your phone / authenticator:** sign in to the **Supabase dashboard** (not the app) → Authentication → Users → find your user → remove the MFA factor.
3. Sign in to the app with your password and set up two-factor login again.
4. Tell Claude — it checks the audit log for anything unusual during the lockout.
5. Before the pilot, consider naming a backup Super Admin (Q-16) so this is never needed.

## Runbook: if a key leaks
1. Supabase → API Keys → **rotate** the leaked key (or Resend → revoke API key).
2. Put the new key in Vercel (and `.env.local`), redeploy.
3. Ask Claude to review `audit_log` and Supabase logs for the exposure window.
4. Inform affected clients if any data was accessed.
