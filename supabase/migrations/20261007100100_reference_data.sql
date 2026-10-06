-- P1-01 · Reference data shared by all clients (Spec 01 §4.2). Edited by Super Admin only.
-- Seeded from the POC (`poc/src/lib/coa.ts`, `vat.ts`) plus VAT boxes 2, 6, 7 and account 2150.

create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor_units smallint not null default 2 check (minor_units between 0 and 3)
);
select app.setup_table('public.currencies');
insert into public.currencies (code, name) values
  ('AED', 'UAE dirham'), ('USD', 'US dollar');  -- D-21: only these two in v1

create table public.vat_boxes (
  code text primary key,
  label text not null,
  section text not null check (section in ('output', 'input', 'net')),
  has_amount_column boolean not null,
  has_vat_column boolean not null,
  has_adjustment_column boolean not null default false,
  is_total boolean not null default false,
  sort smallint not null unique
);
select app.setup_table('public.vat_boxes');
insert into public.vat_boxes (code, label, section, has_amount_column, has_vat_column, has_adjustment_column, is_total, sort) values
  ('1a', 'Standard rated supplies in Abu Dhabi', 'output', true, true, true, false, 10),
  ('1b', 'Standard rated supplies in Dubai', 'output', true, true, true, false, 20),
  ('1c', 'Standard rated supplies in Sharjah', 'output', true, true, true, false, 30),
  ('1d', 'Standard rated supplies in Ajman', 'output', true, true, true, false, 40),
  ('1e', 'Standard rated supplies in Umm Al Quwain', 'output', true, true, true, false, 50),
  ('1f', 'Standard rated supplies in Ras Al Khaimah', 'output', true, true, true, false, 60),
  ('1g', 'Standard rated supplies in Fujairah', 'output', true, true, true, false, 70),
  ('2',  'Tax refunds provided to tourists under the tax refunds for tourists scheme', 'output', true, true, false, false, 80),
  ('3',  'Supplies subject to the reverse charge provisions', 'output', true, true, false, false, 90),
  ('4',  'Zero rated supplies', 'output', true, false, false, false, 100),
  ('5',  'Supplies of goods and services which are exempt from VAT', 'output', true, false, false, false, 110),
  ('6',  'Goods imported into the UAE', 'output', true, true, false, false, 120),
  ('7',  'Adjustments to goods imported into the UAE', 'output', true, true, false, false, 130),
  ('8',  'Totals (output)', 'output', true, true, true, true, 140),
  ('9',  'Standard rated expenses', 'input', true, true, true, false, 150),
  ('10', 'Supplies subject to the reverse charge provisions (input)', 'input', true, true, false, false, 160),
  ('11', 'Totals (input)', 'input', true, true, true, true, 170),
  ('12', 'Total value of due tax for the period', 'net', false, true, false, true, 180),
  ('13', 'Total value of recoverable tax for the period', 'net', false, true, false, true, 190),
  ('14', 'Payable tax for the period', 'net', false, true, false, true, 200);

create table public.emirates (
  code text primary key check (code in ('AUH', 'DXB', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')),
  name text not null,
  vat_box text not null unique references public.vat_boxes (code) on delete restrict
);
select app.setup_table('public.emirates');
create index emirates_vat_box_idx on public.emirates (vat_box);
insert into public.emirates (code, name, vat_box) values
  ('AUH', 'Abu Dhabi', '1a'), ('DXB', 'Dubai', '1b'), ('SHJ', 'Sharjah', '1c'), ('AJM', 'Ajman', '1d'),
  ('UAQ', 'Umm Al Quwain', '1e'), ('RAK', 'Ras Al Khaimah', '1f'), ('FUJ', 'Fujairah', '1g');

-- Which VAT 201 box each tax code lands in (Spec 03 F-03). Standard-rated sales go to the
-- box of the supply emirate chosen on the invoice (D-10), hence `output_by_emirate`.
create table public.tax_codes (
  code text primary key check (code ~ '^[A-Z]{2,6}$'),
  label text not null,
  rate_key text,                   -- config key holding the rate; null = 0%
  output_by_emirate boolean not null default false,
  output_box text references public.vat_boxes (code) on delete restrict,
  input_box text references public.vat_boxes (code) on delete restrict,
  recoverable boolean not null default false,
  pint_category text,              -- PINT AE tax category (Phase 4)
  is_active boolean not null default true,
  check (not (output_by_emirate and output_box is not null))
);
select app.setup_table('public.tax_codes');
create index tax_codes_output_box_idx on public.tax_codes (output_box);
create index tax_codes_input_box_idx on public.tax_codes (input_box);
insert into public.tax_codes (code, label, rate_key, output_by_emirate, output_box, input_box, recoverable, pint_category) values
  ('SR',  'Standard rated 5%', 'vat.rate_bp', true,  null, '9',  true,  'S'),
  ('ZR',  'Zero rated',        null,          false, '4',  null, false, 'Z'),
  ('EX',  'Exempt',            null,          false, '5',  null, false, 'E'),
  ('OS',  'Out of scope',      null,          false, null, null, false, 'O'),
  ('RCS', 'Reverse charge',    'vat.rate_bp', false, '3',  '10', true,  'AE'),
  ('BLK', 'Blocked input VAT', 'vat.rate_bp', false, null, null, false, 'S');

-- Corporate Tax adjustment tags (Spec 03 F-08). The add-back % lives in config.
create table public.ct_tags (
  code text primary key check (code ~ '^[A-Z0-9_]+$'),
  label text not null,
  addback_key text,                -- config key with the add-back % (bp); null = handled in code
  legal_reference text
);
select app.setup_table('public.ct_tags');
insert into public.ct_tags (code, label, addback_key, legal_reference) values
  ('ENTERTAINMENT_50',  'Client entertainment (partly disallowed)', 'ct.addback.ENTERTAINMENT_50', 'FDL 47/2022 Art 32'),
  ('FINES_PENALTIES',   'Fines and penalties',                       'ct.addback.FINES_PENALTIES', 'FDL 47/2022 Art 33'),
  ('DONATION_NON_QPBE', 'Donations to non-qualifying bodies',        'ct.addback.DONATION_NON_QPBE', 'FDL 47/2022 Art 33'),
  ('NON_DEDUCTIBLE',    'Non-deductible / personal expenses',        'ct.addback.NON_DEDUCTIBLE', 'FDL 47/2022 Art 28, 33'),
  ('CT_EXPENSE',        'Corporate tax expense (excluded from profit before tax)', null, 'FDL 47/2022 Art 33');

create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');

create table public.coa_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_default boolean not null default false
);
select app.setup_table('public.coa_templates');
create unique index coa_templates_one_default on public.coa_templates (is_default) where is_default;

create table public.coa_template_accounts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.coa_templates (id) on delete restrict,
  code text not null check (code ~ '^[0-9A-Za-z.-]{1,20}$'),
  name text not null,
  type public.account_type not null,
  subtype text,
  report_group text,
  ct_tag text references public.ct_tags (code) on delete restrict,
  is_control boolean not null default false,
  unique (template_id, code)
);
select app.setup_table('public.coa_template_accounts');
create index coa_template_accounts_ct_tag_idx on public.coa_template_accounts (ct_tag);

with t as (
  insert into public.coa_templates (code, name, is_default)
  values ('uae-sme', 'UAE SME (IFRS for SMEs)', true) returning id
)
insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, a.code, a.name, a.type::public.account_type, a.subtype, a.grp, a.ct_tag, a.is_control
from t, (values
  ('1010', 'Bank - current account (AED)',            'asset',     'bank',            'Cash & equivalents',      null,                true),
  ('1100', 'Trade receivables',                       'asset',     'receivable',      'Receivables',             null,                true),
  ('1150', 'Prepayments and deposits',                'asset',     null,              'Receivables',             null,                false),
  ('1200', 'Inventory',                               'asset',     'inventory',       'Inventories',             null,                false),
  ('1300', 'VAT input (recoverable)',                 'asset',     'vat_input',       'Receivables',             null,                true),
  ('1310', 'VAT input - reverse charge',              'asset',     'vat_input_rc',    'Receivables',             null,                true),
  ('1500', 'Property, plant and equipment',           'asset',     'fixed_asset',     'Non-current assets',      null,                false),
  ('1510', 'PPE - accumulated depreciation',          'asset',     'accum_depreciation', 'Non-current assets',   null,                false),
  ('2000', 'Trade payables',                          'liability', 'payable',         'Payables',                null,                true),
  ('2010', 'Accruals',                                'liability', null,              'Payables',                null,                false),
  ('2100', 'VAT output',                              'liability', 'vat_output',      'Tax liabilities',         null,                true),
  ('2110', 'VAT output - reverse charge',             'liability', 'vat_output_rc',   'Tax liabilities',         null,                true),
  ('2150', 'Customer credits',                        'liability', 'customer_credits','Payables',                null,                true),
  ('2200', 'Corporate tax payable',                   'liability', 'ct_payable',      'Tax liabilities',         null,                false),
  ('2500', 'Provision for end-of-service benefits',   'liability', null,              'Non-current liabilities', null,                false),
  ('3000', 'Share capital',                           'equity',    null,              'Equity',                  null,                false),
  ('3200', 'Retained earnings',                       'equity',    'retained_earnings','Equity',                 null,                false),
  ('4000', 'Revenue - sale of goods',                 'revenue',   null,              'Revenue',                 null,                false),
  ('4010', 'Revenue - services',                      'revenue',   null,              'Revenue',                 null,                false),
  ('4300', 'Other income',                            'revenue',   null,              'Other income',            null,                false),
  ('5000', 'Cost of goods sold',                      'expense',   null,              'Cost of sales',           null,                false),
  ('5010', 'Direct costs - subcontractors',           'expense',   null,              'Cost of sales',           null,                false),
  ('6000', 'Salaries and wages',                      'expense',   null,              'Staff costs',             null,                false),
  ('6010', 'End-of-service benefits expense',         'expense',   null,              'Staff costs',             null,                false),
  ('6050', 'Transportation and travel',               'expense',   null,              'Operating expenses',      null,                false),
  ('6060', 'Fuel and vehicle running',                'expense',   null,              'Operating expenses',      null,                false),
  ('6100', 'Rent',                                    'expense',   null,              'Operating expenses',      null,                false),
  ('6110', 'Utilities and telecom',                   'expense',   null,              'Operating expenses',      null,                false),
  ('6120', 'Licences, visas and government fees',     'expense',   null,              'Operating expenses',      null,                false),
  ('6130', 'Professional fees',                       'expense',   null,              'Operating expenses',      null,                false),
  ('6140', 'Client entertainment',                    'expense',   null,              'Operating expenses',      'ENTERTAINMENT_50',  false),
  ('6150', 'Marketing and advertising',               'expense',   null,              'Operating expenses',      null,                false),
  ('6160', 'Fines and penalties',                     'expense',   null,              'Operating expenses',      'FINES_PENALTIES',   false),
  ('6170', 'Donations',                               'expense',   null,              'Operating expenses',      'DONATION_NON_QPBE', false),
  ('6180', 'Office supplies and IT',                  'expense',   null,              'Operating expenses',      null,                false),
  ('6200', 'Depreciation - PPE',                      'expense',   null,              'Depreciation',            null,                false),
  ('6400', 'Bank charges',                            'expense',   null,              'Finance costs',           null,                false),
  ('6500', 'Non-deductible / personal expenses',      'expense',   null,              'Operating expenses',      'NON_DEDUCTIBLE',    false),
  ('7000', 'Corporate tax expense',                   'expense',   'ct_expense',      'Income tax',              'CT_EXPENSE',        false)
) as a(code, name, type, subtype, grp, ct_tag, is_control);

grant select on public.currencies, public.vat_boxes, public.emirates, public.tax_codes,
  public.ct_tags, public.coa_templates, public.coa_template_accounts to authenticated;
grant insert, update on public.vat_boxes, public.emirates, public.tax_codes, public.ct_tags,
  public.coa_templates, public.coa_template_accounts to authenticated;
