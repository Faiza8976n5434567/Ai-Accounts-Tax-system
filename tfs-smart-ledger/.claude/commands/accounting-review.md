Review the changes on the current branch as a senior UAE chartered accountant and tax
auditor. Check, and report as a table (Finding | Risk | File | Fix):
1. Double-entry balance in txn currency and AED; rounding; no floats for money.
2. Posted records immutable; reversals only; period locks respected.
3. Audit log written for every mutation, including AI involvement and approver.
4. Tenant isolation (organizationId + RLS) on every new query.
5. VAT: correct tax code behaviour, VAT 201 box mapping, reverse charge both sides,
   credit notes reduce the right boxes, emirate captured.
6. CT: adjustments tagged and traceable; config version recorded.
7. Tax thresholds/dates pulled from uae-tax-config.ts, never hard-coded.
8. Tests cover edge cases with worked AED examples.
Then fix the High-risk findings.
