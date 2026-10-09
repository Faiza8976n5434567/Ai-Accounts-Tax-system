-- Reference data and versioned tax rules (Spec 01 §4.2, §4.11 · Spec 03 CFG-01 → CFG-17).
begin;
\ir fixtures/setup.psql
select plan(27);

-- Reference data (P1-01)
select is((select count(*)::int from public.vat_boxes), 20, 'VAT 201 has 20 boxes (1a–1g, 2–14)');
select ok((select bool_and(code in (select code from public.vat_boxes)) from (values ('2'), ('6'), ('7')) b(code)),
  'Boxes 2, 6 and 7 are present');
select is((select string_agg(code || '→' || vat_box, ',' order by vat_box) from public.emirates),
  'AUH→1a,DXB→1b,SHJ→1c,AJM→1d,UAQ→1e,RAK→1f,FUJ→1g', 'Each emirate maps to its own box (1a–1g)');
select is((select (output_by_emirate, input_box)::text from public.tax_codes where code = 'SR'), '(t,9)',
  'SR: sales by supply emirate (D-10), purchases in box 9');
select is((select (output_box, input_box)::text from public.tax_codes where code = 'RCS'), '(3,10)',
  'Reverse charge lands in boxes 3 and 10');
select is((select count(*)::int from public.coa_template_accounts), 46, 'Default chart has 46 accounts (P2-04 added 1160, 4310, 6190, 6410; P3-03 added 2120; D-52 added 3999; D-58 added 1170)');
select is((select (type, subtype, is_control)::text from public.coa_template_accounts where code = '2150'),
  '(liability,customer_credits,t)', 'Customer Credits (2150) is a liability control account (D-11)');
select is((select legal_name from public.firms where is_platform_owner), 'TFS Plus Tax & Accountancy LLC',
  'TFS Plus is the platform owner (D-20)');
select is((select value #>> '{}' from public.platform_settings where key = 'app_name'), 'TFS+ Smart Ledger',
  'App name is a setting, not code');

-- Seeded tax rules match the POC
select is(app.config_value('vat.rate_bp', '2026-10-01'), '500'::jsonb, 'VAT rate 5% (500 bp)');
select is(app.config_value('ct.zero_band', '2026-12-31'), '37500000'::jsonb, 'CT 0% band AED 375,000');
select is(app.config_value('fx.usd_aed', '2026-10-01'), '3.6725'::jsonb, 'USD → AED 3.6725 (D-21)');
select is((select string_agg(key, ',' order by key) from public.config_values where needs_verification),
  'ct.sbr_last_period_end,einvoicing.asp_by,einvoicing.go_live,vat.full_invoice_threshold,vat.return_due_days',
  'VERIFY flags carried over (PLAN Q-07)');

-- CFG-05 / RBAC-17 · only Super Admin edits tax rules
select tests.login('acct@test.local');
select ok((select count(*) from public.config_values) > 0, 'CFG-05 · Firm Accountant can view tax rules');
select throws_ok($$ insert into public.config_versions (label, effective_from) values ('hack', '2027-01-01') $$,
  '42501', null, 'CFG-05 / RBAC-17 · Firm Accountant cannot create a rule version');
update public.config_values set value = '0' where key = 'vat.rate_bp';
reset role;
select is(app.config_value('vat.rate_bp', '2026-10-01'), '500'::jsonb, 'CFG-05 · … and their update changes nothing');

-- CFG-01 · a new value with a future effective date leaves earlier periods untouched
select tests.login('super@test.local');
insert into public.config_versions (label, effective_from, based_on)
values ('uae-2027.01', '2027-01-01', (select id from public.config_versions where label = 'uae-2026.09'));
insert into public.config_values (version_id, key, value, legal_reference, last_verified, needs_verification)
select (select id from public.config_versions where label = 'uae-2027.01'), key, value, legal_reference, last_verified, needs_verification
from public.config_values where version_id = (select id from public.config_versions where label = 'uae-2026.09');
update public.config_values set value = '50000000'
 where key = 'ct.zero_band' and version_id = (select id from public.config_versions where label = 'uae-2027.01');

-- CFG-03 / CFG-04 · nonsense rejected
select throws_like($$ update public.config_values set value = '15000'
  where key = 'vat.rate_bp' and version_id = (select id from public.config_versions where label = 'uae-2027.01') $$,
  'vat.rate_bp must be between 0% and 100%', 'CFG-03 · VAT rate of 150% rejected');
select throws_like($$ update public.config_values set value = '"soon"'
  where key = 'ct.sbr_last_period_end' and version_id = (select id from public.config_versions where label = 'uae-2027.01') $$,
  'ct.sbr_last_period_end must be a date%', 'CFG-03 · a non-date for a date rule rejected');
select throws_ok($$ update public.tax_codes set output_box = 'X9' where code = 'ZR' $$, '23503', null,
  'CFG-04 · mapping a tax code to a non-existent box rejected');

-- CFG-16 · one Super Admin: a written reason is required (D-23)
select throws_like($$ select public.approve_config_version((select id from public.config_versions where label = 'uae-2027.01'), ' ') $$,
  'A written reason is required%', 'CFG-16 · approval without a reason rejected');
select public.approve_config_version((select id from public.config_versions where label = 'uae-2027.01'),
  'Test: hypothetical band change');
select is(app.config_value('ct.zero_band', '2026-12-31'), '37500000'::jsonb, 'CFG-01 · FY2026 keeps AED 375,000');
select is(app.config_value('ct.zero_band', '2027-01-01'), '50000000'::jsonb, 'CFG-01 · 2027 uses the new value');
select is((select effective_to from public.config_versions where label = 'uae-2026.09'), '2026-12-31'::date,
  'CFG-01 · previous version now ends the day before');
select throws_ok($$ update public.config_values set value = '600'
  where key = 'vat.rate_bp' and version_id = (select id from public.config_versions where label = 'uae-2027.01') $$,
  '42501', null, 'Approved versions are frozen');
select ok(exists (select 1 from public.audit_log where table_name = 'config_versions' and action = 'approve_config_version'
                  and reason = 'Test: hypothetical band change' and actor_id = tests.uid('super@test.local')),
  'CFG-13 · approval audit-logged with user and reason');

-- CFG-17 · with two Super Admins, the drafter cannot approve their own version
select public.set_super_admin(tests.uid('admin2@test.local'), true, 'Backup Super Admin for test');
insert into public.config_versions (label, effective_from) values ('uae-2027.07', '2027-07-01');
insert into public.config_values (version_id, key, value)
select (select id from public.config_versions where label = 'uae-2027.07'), key, value
from public.config_values where version_id = (select id from public.config_versions where label = 'uae-2027.01');
select throws_like($$ select public.approve_config_version((select id from public.config_versions where label = 'uae-2027.07'), 'mine') $$,
  'Another Super Admin must approve%', 'CFG-17 · two-person rule once a second Super Admin exists');
select tests.login('admin2@test.local');
select lives_ok($$ select public.approve_config_version((select id from public.config_versions where label = 'uae-2027.07'), 'Reviewed') $$,
  'CFG-17 · the other Super Admin can approve');

select * from finish();
rollback;
