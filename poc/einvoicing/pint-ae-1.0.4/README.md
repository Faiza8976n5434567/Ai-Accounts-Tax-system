# PINT AE Billing 1.0.4 — official artefacts (do not edit)

Unchanged copies from the UAE Peppol Authority's specification site, downloaded 2026-10-09 with Faizan's permission (D-61):

- Source: https://docs.peppol.eu/poac/ae/pint-ae/resources.zip (PDK 1.4.4, released 29 Jul 2026)
- SHA-256 of the zip: `1e8b0bd595c672ac9d6fc886ddd0eb8027cb39a1d26bebdcb1ada37b7eee491f`
- Kept: `trn-invoice/` and `trn-creditnote/` — `schematron/*.xslt` (compiled official rules), `codelist/*.gc`, `example/*.xml`.
  Not kept: the PDFs (`bis.pdf`, `compliance.pdf`, release notes) — read them on the site.

Used by `poc/api/_pint.ts` (validation with Saxon-JS) and its tests: every official example must pass.
To upgrade, download the new release into a new folder `pint-ae-<version>/`, point `_pint.ts` at it, and run the tests.
