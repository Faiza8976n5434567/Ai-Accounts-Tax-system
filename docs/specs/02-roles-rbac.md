# Spec 02 — Roles & access control (RBAC + RLS)

| | |
|---|---|
| **Status** | Draft — awaiting Faizan's approval |
| **Implements** | PLAN.md Phase 1 (firm roles) and Phase 3 (client roles) |
| **Related** | [01 Data model](01-data-model.md) · [04 Security](04-security.md) |

## In plain words

Everyone who logs in has a **role**, and the role decides what they can see and do. The
important part: these rules are enforced **inside the database**, not just by hiding buttons.
Even if someone found a way around the screens, the database would still refuse. Two golden
rules apply to everyone, including you:

1. **Maker-checker:** whoever prepares an entry or a return can never approve it.
2. **Nobody edits history:** posted entries and approved returns can only be reversed, never changed.

---

## 1. Roles

| Role | Level | Who | Purpose |
|---|---|---|---|
| **Super Admin** | Platform | Faizan (+1 backup person recommended) | Owns the system: tax rules, email settings, invites, firm settings, user suspension. A *flag on top of* Firm Admin. |
| **Firm Admin** | Firm | Partners / managers | Runs the practice: clients, staff assignment, approvals, period locks, VAT return approval |
| **Firm Accountant** | Firm, per assigned client | TFS staff | Prepares: bills, invoices, journals, bank matching, draft VAT returns |
| **Client Owner** | One client | Client director | Sees own company; approves own bills/invoices; can invite own staff |
| **Client Staff** | One client | Client finance person | Uploads bills, raises sales invoices (as drafts) |
| **Read-only** | One client, time-limited | External auditor / viewer | Views reports and documents until the access end date |

**Why Super Admin is a flag, not a separate login:** you need to do accounting work *and*
administer the system. One login with an extra power is simpler and safer than sharing two accounts.

**Why only 6 roles:** each extra role multiplies testing. These six cover every person in
PLAN.md. A "Firm Manager / Reviewer" role can be added later in one migration if needed.

---

## 2. Permission matrix

✔ = allowed · ✔* = only on own assigned client(s) · ✔° = own client only · — = not allowed

### 2.1 Everyday accounting
| Action | Super Admin | Firm Admin | Firm Accountant | Client Owner | Client Staff | Read-only |
|---|---|---|---|---|---|---|
| View client data & reports | ✔ | ✔ | ✔* | ✔° | ✔° | ✔° (until end date) |
| Create / edit **draft** journals, invoices, bills | ✔ | ✔ | ✔* | ✔° | ✔° | — |
| Upload documents & bank statements | ✔ | ✔ | ✔* | ✔° | ✔° | — |
| **Approve & post** (not own drafts) | ✔ | ✔ | — | ✔° bills & invoices only | — | — |
| Post manual journals | ✔ | ✔ | — (prepare only) | — | — | — |
| Reverse a posted journal | ✔ | ✔ | — | — | — | — |
| Record receipts / payments, allocate | ✔ | ✔ | ✔* (draft) | ✔° | — | — |
| Refund a customer credit | ✔ | ✔ | — (prepare only) | ✔° approve | — | — |
| Bank matching | ✔ | ✔ | ✔* | — | — | — |
| Export reports (Excel/PDF) | ✔ | ✔ | ✔* | ✔° | ✔° | ✔° |

### 2.2 Tax & period control
| Action | Super Admin | Firm Admin | Firm Accountant | Client Owner | Client Staff | Read-only |
|---|---|---|---|---|---|---|
| Prepare draft VAT return | ✔ | ✔ | ✔* | — | — | — |
| Approve & freeze VAT return | ✔ | ✔ | — | — | — | — |
| Mark return as filed (FTA ref) | ✔ | ✔ | — | — | — | — |
| Lock accounting period | ✔ | ✔ | — | — | — | — |
| **Reopen** a locked period (reason required) | ✔ | ✔ | — | — | — | — |

### 2.3 Administration
| Action | Super Admin | Firm Admin | Firm Accountant | Client Owner | Client Staff | Read-only |
|---|---|---|---|---|---|---|
| Create / archive clients | ✔ | ✔ | — | — | — | — |
| Assign staff to clients | ✔ | ✔ | — | — | — | — |
| Invite firm staff | ✔ | ✔ (accountants only) | — | — | — | — |
| Invite client users | ✔ | ✔ | — | ✔° (staff & read-only) | — | — |
| Suspend any user | ✔ | — | — | — | — | — |
| Grant / remove Super Admin | ✔ (not self) | — | — | — | — | — |
| Edit client chart of accounts | ✔ | ✔ | — | — | — | — |
| Edit tax rules (rates, thresholds, deadlines) | ✔ (versioned) | view | view | — | — | — |
| Edit VAT box / tax code / CT tag mapping | ✔ | view | — | — | — | — |
| Email settings & templates | ✔ | — | — | — | — | — |
| Firm settings (terms, ageing, reminders) | ✔ | ✔ | — | — | — | — |
| View audit log | ✔ (all) | ✔ (all clients) | ✔* | ✔° | — | ✔° |

### 2.4 Always-on rules (apply to every role, including Super Admin)
- **R1 Maker-checker:** approver ≠ preparer, for journals, bills, invoices, refunds and VAT returns.
- **R2 Immutability:** posted/approved records cannot be edited or deleted — only reversed.
- **R3 Locked periods** reject postings; reopening needs Firm Admin + reason, audit-logged.
- **R4 No self-promotion:** nobody can change their own role or Super Admin flag.
- **R5 Time-boxed access:** read-only access stops automatically after `valid_to`.
- **R6 MFA:** firm users (Super Admin, Firm Admin, Firm Accountant) must use two-factor login; the database refuses their requests without it.
- **R7 Last admin protection:** the last active Super Admin cannot be removed or suspended.

---

## 3. How it is enforced (four layers)

| Layer | What it does | Example |
|---|---|---|
| **1. Screens** | Hide buttons the role can't use | Accountant doesn't see "Approve" |
| **2. Database functions** | Every important action is a function that re-checks permission | `post_journal()`, `approve_vat_return()`, `lock_period()`, `invite_user()` |
| **3. Row-Level Security (RLS)** | Each table only returns rows the user is allowed to see | A Client Staff user physically cannot read another client's rows |
| **4. Triggers & constraints** | Rules nobody can bypass, not even an admin | Posted journal can't be updated; approver ≠ preparer |

Layers 2–4 live in the database, so a bug in the screens can never leak data or break the books.

### 3.1 RLS design (technical)

Helper functions in a private schema `app` (`security definer`, `stable`, `set search_path = ''`), not callable from the API directly:

| Function | Returns |
|---|---|
| `app.is_super_admin()` | true if `profiles.is_super_admin` and active |
| `app.firm_role(firm_id)` | `firm_admin` / `firm_accountant` / null |
| `app.org_role(org_id)` | the user's effective role for a client (admin roles inherited from firm) |
| `app.has_perm(org_id, perm)` | checks `app.role_permissions` (seeded table: role × permission) |
| `app.mfa_ok()` | `(auth.jwt()->>'aal') = 'aal2'` or user is not a firm user |

Policy pattern (identical on every client table):

```sql
-- read
create policy sel on public.<table> for select to authenticated
  using ( (select app.has_perm(organization_id, 'view')) );
-- write drafts only; posting goes through functions
create policy ins on public.<table> for insert to authenticated
  with check ( (select app.has_perm(organization_id, 'prepare')) );
-- MFA for firm users, on every table
create policy mfa on public.<table> as restrictive to authenticated
  using ( (select app.mfa_ok()) );
```

- `(select …)` wrapping makes Postgres evaluate the helper once per query (performance).
- `anon` role has **no** grants on any business table.
- Posted-row updates/deletes are blocked by triggers regardless of policy.
- The role × permission table is **seeded by migration and read-only in the UI** — changing it is a code change with tests, not a settings click (see Spec 03 §4 on why).
- Storage bucket `documents` is private; object policies use the first path segment (`organization_id`) with the same `app.has_perm` check.

---

## 4. Test cases (RBAC-*)

Each is a database test run as a real test user on the temporary CI database (Gate G-6).

| ID | As | Try to | Expected |
|---|---|---|---|
| RBAC-01 | Anonymous | Read any table | 0 rows / denied |
| RBAC-02 | Client Staff (Client A) | Read Client B journals | 0 rows |
| RBAC-03 | Firm Accountant | Read a client not assigned | 0 rows |
| RBAC-04 | Firm Accountant | Post a journal | Rejected |
| RBAC-05 | Firm Admin | Approve own draft | Rejected (R1) |
| RBAC-06 | Super Admin | Approve own draft | Rejected (R1 applies to everyone) |
| RBAC-07 | Firm Admin | Update a posted journal line | Rejected (R2) |
| RBAC-08 | Firm Admin | Post into a locked period | Rejected (R3) |
| RBAC-09 | Firm Admin | Reopen a period without a reason | Rejected |
| RBAC-10 | Firm Admin | Set own `is_super_admin = true` | Rejected (R4) |
| RBAC-11 | Super Admin | Remove the last Super Admin | Rejected (R7) |
| RBAC-12 | Read-only | Read after `valid_to` | 0 rows (R5) |
| RBAC-13 | Read-only | Insert a draft | Rejected |
| RBAC-14 | Firm Admin signed in **without** MFA | Read any client | 0 rows (R6) |
| RBAC-15 | Client Owner | Invite a Firm Accountant | Rejected |
| RBAC-16 | Client Owner | Invite Client Staff to own company | Allowed; invitation row created |
| RBAC-17 | Firm Accountant | Edit tax rules | Rejected |
| RBAC-18 | Client Staff | Download another client's attachment by guessing the path | Denied (storage policy) |
| RBAC-19 | Any user | Call `app.*` helper functions via the API | Not exposed |
| RBAC-20 | Each role | Full matrix sweep: every action in §2 × every role | Matches the matrix exactly (generated test) |
