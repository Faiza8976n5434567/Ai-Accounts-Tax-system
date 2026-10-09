# Specifications

We build **spec-first**: nothing is coded until its spec is approved by Faizan. Each phase in
[PLAN.md](../../PLAN.md) points to the specs it implements, and every spec ends with test
cases that must pass before the phase is signed off.

| # | Spec | Status |
|---|---|---|
| 01 | [Data model](01-data-model.md) — every table and relationship; where each piece of POC data goes | ✅ Approved 2026-10-06 |
| 02 | [Roles & access control](02-roles-rbac.md) — 6 roles, permission matrix, RLS design | ✅ Approved 2026-10-06 |
| 03 | [Configuration, formulas & admin settings](03-configuration-and-formulas.md) — formula catalogue, versioned tax rules, email/invites/onboarding | ✅ Approved 2026-10-06 |
| 04 | [Security](04-security.md) — five layers of controls + tests | ✅ Approved 2026-10-06 |
| 05 | [Scope review](05-scope-and-simplifications.md) — what we simplify, defer or drop | ✅ Approved 2026-10-06 |

## Spec lifecycle

```
Draft ──► Approved (Faizan) ──► Implemented (Claude) ──► Verified (tests green + Faizan preview check)
```

- A change to an approved spec is made **in the spec first**, then in code, and noted in the
  PLAN.md change log.
- Test IDs are shared between specs and PLAN.md §6 (e.g. `VAT-01`, `RBAC-05`, `CFG-02`).
