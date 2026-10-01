# UAE Compliance Rules to Implement

Status: drafted 30 Sep 2026. Every item tagged **VERIFY** must be confirmed by the
product owner against current FTA / MoF publications before release, and re-checked
quarterly. Engineering must implement values through `uae-tax-config.ts`, never inline.

## 1. VAT (Federal Decree-Law No. 8 of 2017 and Executive Regulation, as amended)
- Standard rate 5%; zero-rated (exports, international transport, certain education &
  healthcare, first supply of residential property, investment precious metals, etc.);
  exempt (certain financial services, bare land, local passenger transport, subsequent
  residential supplies); out of scope.
- Registration: mandatory threshold AED 375,000, voluntary AED 187,500 (12-month
  rolling or next 30 days). System monitors taxable supplies and alerts at 80%/100%.
- Tax periods: quarterly by default, monthly for some; FTA-assigned stagger —
  store the actual period dates from the TRN certificate per organisation.
- Return & payment due: **28th day after the end of the tax period**.
- Tax invoice mandatory fields (full and simplified), Arabic/English, AED amounts,
  issued within 14 days of the date of supply.
- Reverse charge: imported services and goods (goods via customs declaration);
  output + input in the same return, subject to input recovery rules.
- Designated Zones: goods-supply rules differ — tag counterparty location.
- Input tax: blocked items (entertainment for non-employees, motor vehicles available
  for personal use, employee goods/services for personal benefit); apportionment for
  partially exempt businesses (annual adjustment); capital asset scheme — **VERIFY
  thresholds**.
- Bad-debt relief conditions (write-off in books, time elapsed since supply, notice to
  customer, etc.) — **VERIFY exact conditions** in Art. 64 and Exec. Reg.
- Profit margin scheme for eligible second-hand goods.
- Penalties: administrative penalties regime revised by Cabinet Decision 129 of 2025 —
  **VERIFY amounts and effective date** before coding the penalty estimator.
- Record keeping: generally 5 years (longer for real estate) — **VERIFY**, and note
  Tax Procedures Law amendments effective 1 Jan 2026 (FDL 17/2025).

### VAT 201 box map (engine output)
| Box | Description |
|---|---|
| 1a–1g | Standard-rated supplies by emirate (AD, DXB, SHJ, AJM, UAQ, RAK, FUJ): amount, VAT, adjustment |
| 2 | Tax refunds provided to tourists (Tax Refunds for Tourists Scheme) |
| 3 | Supplies subject to reverse charge (output side) |
| 4 | Zero-rated supplies |
| 5 | Exempt supplies |
| 6 | Goods imported into the UAE |
| 7 | Adjustments to goods imported into the UAE |
| 8 | Total outputs |
| 9 | Standard-rated expenses: amount, recoverable VAT, adjustment |
| 10 | Supplies subject to reverse charge (input side) |
| 11 | Total inputs |
| 12 | Total value of due tax |
| 13 | Total value of recoverable tax |
| 14 | Payable / (refundable) tax |
Emirate of supply follows the supplier's establishment for services and the location
rules for goods — store `emirate` on each revenue line. **VERIFY** mapping against the
current EmaraTax return form.

### FTA Audit File (FAF)
Export per the FTA-prescribed structure (company info, purchase listing, supply
listing, GL listing, totals). Build from posted journals only.

## 2. Corporate Tax (Federal Decree-Law No. 47 of 2022)
- 0% on taxable income up to AED 375,000; 9% above (Cabinet Decision 116/2022).
- **Small Business Relief**: revenue ≤ AED 3m in the current and every prior tax
  period; tax periods ending on or before 31 Dec 2029 (MD 73/2023 as amended by
  MD 131/2026); not for QFZPs or MNE group members; elected each return; losses and
  disallowed interest in SBR periods not carried forward.
- **QFZP**: qualifying income 0%, non-qualifying 9%; de minimis = non-qualifying revenue
  ≤ lower of AED 5m or 5% of total revenue; audited FS and substance required;
  failing = 9% for that and next 4 periods. Activities per MD 229/2025.
- Taxable-income bridge: exempt income (Art 22–24), 50% entertainment add-back (Art 32),
  fines/penalties, donations to non-qualifying bodies (Art 33), non-business / capital
  expenditure (Art 28), connected-person payments above market value (Art 36),
  transfer pricing adjustments (Art 34), general interest limitation (greater of 30% of
  tax-EBITDA or AED 12m; excess carried forward 10 periods — Art 30), specific interest
  limitation (Art 31), loss relief capped at 75% of taxable income (Art 37),
  transitional adjustments (Art 61).
- Accounting standards: IFRS; IFRS for SMEs permitted where revenue ≤ AED 50m; cash
  basis where revenue ≤ AED 3m (MD 114/2023). Audited FS required for revenue > AED 50m
  and for QFZPs (MD 82/2023) — **VERIFY** before shipping the "audit required" flag.
- Return and payment: within **9 months** of tax period end.
- Transfer pricing disclosure form and master/local file thresholds (MD 97/2023) —
  **VERIFY** current thresholds; store related-party transactions by counterparty.
- Records: 7 years (Art 56) — **VERIFY** interaction with FDL 17/2025.
- Deferred tax (IAS 12) at 9% for IFRS financial statements.

## 3. E-invoicing (MD 243/2025 & MD 244/2025, as amended)
- Model: Peppol-based decentralised continuous transaction control & exchange ("5-corner").
  Both issuer and recipient appoint an **Accredited Service Provider (ASP)**.
- Standard: **PINT AE** (UBL 2.1). Tax data reported to FTA by ASPs.
- Timeline: pilot/voluntary from 1 Jul 2026; revenue ≥ AED 50m — ASP by 30 Oct 2026
  (extended), live 1 Jan 2027; **revenue < AED 50m — ASP by 31 Mar 2027, live
  1 Jul 2027**; government entities — ASP by 31 Mar 2027, live 1 Oct 2027.
  **VERIFY** any further extensions before customer communications.
- Issue within 14 days; credit notes (not deletions) for cancellations, reductions,
  refunds, errors; electronic records stored in the UAE; report ASP/system failures to
  FTA within the prescribed time; certain transactions excluded or voluntary —
  **VERIFY exclusion list** and penalty table.

## 4. IFRS closing rules (engine behaviour)
- IAS 16 depreciation (straight-line default, component optional); IAS 38 intangibles.
- IFRS 16 leases: short-term (≤12 months) and low-value exemptions configurable.
- IFRS 9 ECL simplified approach with provision matrix; write-off after policy period.
- IAS 19: UAE Labour Law gratuity — 21 days' basic wage per year for first 5 years,
  30 days per year thereafter, total capped at two years' wage — **VERIFY** for
  free-zone employers (DIFC/ADGM have their own regimes).
- IAS 21: monthly revaluation of foreign-currency monetary items at CBUAE rate.
- IAS 12 deferred tax; IAS 24 related-party disclosures; IAS 37 provisions.

## 5. Compliance calendar events to generate
VAT return (per period) · VAT registration threshold crossing · CT registration ·
CT return/payment (period end + 9 months) · SBR revenue monitor · e-invoicing ASP
appointment & go-live · 14-day e-invoice issuance breaches · trade licence renewal ·
WPS monthly · TP disclosure · audit completion (where required) · AML/CDD refresh.
