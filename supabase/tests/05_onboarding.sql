-- Client onboarding (P1-12 · Spec 03 §3.1 · CFG-06, CT-10, F-05/F-06/F-12).
begin;
\ir fixtures/setup.psql
select plan(23);

create temp table c (k text primary key, id uuid) on commit drop;
grant all on c to authenticated;

-- A quarterly VAT client whose first VAT period ends 28 Feb 2026 (stagger Feb/May/Aug/Nov)
select tests.login('admin2@test.local');
insert into c values ('q', public.create_client(
  p_legal_name => 'Onboard Trading LLC', p_emirate_code => 'DXB', p_books_start => '2026-01-01',
  p_trn => '100123456700003', p_vat_registered => true, p_vat_period => 'quarterly',
  p_vat_first_period_end => '2026-02-28', p_accountant_ids => array[tests.uid('acct@test.local')]));

select is((select (firm_id, status::text)::text from public.organizations where id = (select id from c where k = 'q')),
  ((select id from fx where k = 'tfs'), 'active')::text, 'Client created in the inviter''s firm, active');
select is((select count(*)::int from public.accounts where organization_id = (select id from c where k = 'q')), 44,
  'Default chart of accounts copied (44 accounts)');
select ok(exists (select 1 from public.accounts where organization_id = (select id from c where k = 'q') and code = '2150' and is_control),
  'Customer Credits (2150) included as a control account');
select is((select min(start_date) from public.accounting_periods where organization_id = (select id from c where k = 'q')),
  '2026-01-01'::date, 'Monthly periods start when the books start');
select is((select max(end_date) from public.accounting_periods where organization_id = (select id from c where k = 'q')),
  make_date(extract(year from current_date)::int + 1, 12, 31), 'Monthly periods run to the end of next financial year');
select is((select count(*)::int from public.accounting_periods where organization_id = (select id from c where k = 'q')),
  (extract(year from current_date)::int + 1 - 2026 + 1) * 12, 'One period per month, no gaps');

-- CFG-06 · VAT periods from the stagger, due 28 days after period end (F-05, VERIFY)
select is((select string_agg(start_date || '→' || end_date || ' due ' || due_date, '; ' order by start_date)
           from (select * from public.tax_periods where organization_id = (select id from c where k = 'q') and kind = 'vat'
                 order by start_date limit 4) x),
  '2025-12-01→2026-02-28 due 2026-03-28; 2026-03-01→2026-05-31 due 2026-06-28; 2026-06-01→2026-08-31 due 2026-09-28; 2026-09-01→2026-11-30 due 2026-12-28',
  'CFG-06 · quarterly VAT periods Dec–Feb, Mar–May, Jun–Aug, Sep–Nov; due +28 days');
-- CT-10 · FY ending 31 Dec 2026 → return and payment due 30 Sep 2027 (F-12)
select is((select due_date from public.tax_periods where organization_id = (select id from c where k = 'q') and kind = 'ct'
           and end_date = '2026-12-31'), '2027-09-30'::date, 'CT-10 · FY2026 Corporate Tax due 30 Sep 2027');
select is((select count(*)::int from public.number_sequences where organization_id = (select id from c where k = 'q')), 5,
  'Document number counters created for all five document types');
select ok(exists (select 1 from public.audit_log where table_name = 'organizations' and action = 'create_client'
                  and row_id = (select id from c where k = 'q')::text), 'Client creation is audit-logged');

-- Staff assignment
select tests.login('acct@test.local');
select is((select count(*)::int from public.organizations where id = (select id from c where k = 'q')), 1,
  'The assigned Firm Accountant sees the new client');
select throws_like($$ select public.create_client(p_legal_name => 'X', p_emirate_code => 'AUH', p_books_start => '2026-01-01') $$,
  'Only a Firm Admin can add clients%', 'Firm Accountant cannot add clients');
select tests.login('acct2@test.local');
select is((select count(*)::int from public.organizations where id = (select id from c where k = 'q')), 0,
  'An unassigned Firm Accountant does not see it');

-- Monthly VAT and a financial year starting in April
select tests.login('admin2@test.local');
insert into c values ('m', public.create_client(
  p_legal_name => 'April Year Co', p_emirate_code => 'SHJ', p_books_start => '2026-04-15', p_fy_start_month => 4,
  p_trn => '100765432100003', p_vat_registered => true, p_vat_period => 'monthly', p_vat_first_period_end => '2026-04-30'));
select is((select min(start_date) from public.accounting_periods where organization_id = (select id from c where k = 'm')),
  '2026-04-01'::date, 'Books starting mid-month begin on the first of that month');
select is((select string_agg(end_date || ' due ' || due_date, '; ' order by start_date)
           from (select * from public.tax_periods where organization_id = (select id from c where k = 'm') and kind = 'vat'
                 order by start_date limit 2) x),
  '2026-04-30 due 2026-05-28; 2026-05-31 due 2026-06-28', 'Monthly VAT periods');
select is((select (start_date, end_date, due_date)::text from public.tax_periods
           where organization_id = (select id from c where k = 'm') and kind = 'ct' order by start_date limit 1),
  ('2026-04-01'::date, '2027-03-31'::date, '2027-12-31'::date)::text, 'April–March financial year; CT due 31 Dec (9 months after)');

-- Validation
select throws_ok($$ select public.create_client(p_legal_name => 'Bad TRN', p_emirate_code => 'AUH', p_books_start => '2026-01-01',
  p_trn => '200000000000000') $$, '23514', null, 'Invalid TRN rejected (15 digits starting with 1)');
select throws_like($$ select public.create_client(p_legal_name => 'No stagger', p_emirate_code => 'AUH', p_books_start => '2026-01-01',
  p_trn => '100111111100003', p_vat_registered => true) $$,
  'A VAT-registered client needs%', 'VAT-registered client needs its VAT period and first period end');
select throws_like($$ select public.create_client(p_legal_name => 'Mid month', p_emirate_code => 'AUH', p_books_start => '2026-01-01',
  p_trn => '100222222200003', p_vat_registered => true, p_vat_period => 'quarterly', p_vat_first_period_end => '2026-02-15') $$,
  'The first VAT period must end on the last day of a month%', 'First VAT period must end on a month end');

-- Editing client details (address for tax invoices): Firm Admin yes, Firm Accountant no
select tests.login('admin2@test.local');
update public.organizations set address = 'Office 1201, Al Maqam Tower, ADGM, Abu Dhabi' where id = (select id from c where k = 'q');
select is((select address from public.organizations where id = (select id from c where k = 'q')), 'Office 1201, Al Maqam Tower, ADGM, Abu Dhabi',
  'A Firm Admin can set the client''s address (needed on tax invoices)');
select tests.login('acct@test.local');
update public.organizations set address = 'Hacked' where id = (select id from c where k = 'q');
select is((select address from public.organizations where id = (select id from c where k = 'q')), 'Office 1201, Al Maqam Tower, ADGM, Abu Dhabi',
  'A Firm Accountant cannot change client details');

-- Firms stay separate
select tests.login('badmin@test.local');
select throws_like($$ select public.create_client(p_legal_name => 'Poach', p_emirate_code => 'AUH', p_books_start => '2026-01-01',
  p_accountant_ids => array[tests.uid('acct@test.local')]) $$,
  'Only active staff of this client''s firm%', 'Cannot assign another firm''s accountant');
insert into c values ('b', public.create_client(p_legal_name => 'Firm B New Client', p_emirate_code => 'AJM', p_books_start => '2026-01-01'));
select tests.login('admin2@test.local');
select is((select count(*)::int from public.organizations where id = (select id from c where k = 'b')), 0,
  'A client added by Firm B is invisible to TFS Plus');

select * from finish();
rollback;
