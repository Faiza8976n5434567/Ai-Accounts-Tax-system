-- Nightly integrity checks (P2-08 · S-5.4). A clean client passes; data damaged behind the database's
-- back (rules switched off) is caught; results are permanent and visible only to people with access.
begin;
\ir fixtures/setup.psql
select plan(14);

create function tests.results(p_run uuid) returns text language sql stable security definer as $$
  select string_agg(check_code || '=' || status, ' ' order by check_code) from public.integrity_results where run_id = p_run
$$;
create function tests.failing(p_run uuid) returns text language sql stable security definer as $$
  select coalesce(string_agg(check_code || '=' || status, ' ' order by check_code), 'none') from public.integrity_results where run_id = p_run and status <> 'ok'
$$;
grant execute on all functions in schema tests to authenticated;

-- Some normal activity on client A: an invoice and a receipt
select tests.login('acct@test.local');
insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'customer', 'Integrity Buyer LLC');
create temp table ik (k text primary key, id uuid) on commit drop;
grant all on ik to authenticated;
insert into ik values ('inv', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
  'contact_id', (select id from public.contacts where name = 'Integrity Buyer LLC'), 'issue_date', current_date,
  'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 1000000, 'tax_code', 'SR', 'description', 'Services',
           'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
insert into ik values ('rcpt', public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from public.contacts where name = 'Integrity Buyer LLC'), 'payment_date', current_date, 'amount', 1100000,
  'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from ik where k = 'inv'));
select public.post_payment((select id from ik where k = 'rcpt'));

-- A clean client passes every check
select tests.login('acct@test.local');
insert into ik values ('run1', public.run_integrity_checks((select id from fx where k = 'orgA')));
select is(tests.results((select id from ik where k = 'run1')),
  'advances_control=ok ap_control=ok ar_control=ok bank_reconciled=ok bank_unmatched=ok credits_control=ok journals_balanced=ok numbering=ok opening_clearing=ok payment_journals=ok purchase_journals=ok sales_journals=ok tb_balanced=ok',
  'Thirteen checks, all passing on a clean client');
select is((select (status, errors, warnings, trigger, triggered_by = tests.uid('acct@test.local'))::text from public.integrity_runs where id = (select id from ik where k = 'run1')),
  '(ok,0,0,manual,t)', 'The run is recorded as a manual run by the accountant');

-- Damage behind the database's back (rules switched off for this test only) is caught
reset role;
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
update public.journal_lines set debit = debit + 100 where journal_id = (select id from fx where k = 'jfix') and debit > 0;
update public.sales_invoices set net_total = net_total + 1, gross_total = gross_total + 1, gross_total_fcy = gross_total_fcy + 1 where id = (select id from ik where k = 'inv');
set local session_replication_role = origin;
insert into ik values ('run2', app.integrity_check_org((select id from fx where k = 'orgA'), 'nightly', null));
select is(tests.failing((select id from ik where k = 'run2')),
  'ar_control=error journals_balanced=error sales_journals=error tb_balanced=error',
  'An unbalanced journal and an invoice that differs from its journal are caught');
select is((select detail from public.integrity_results where run_id = (select id from ik where k = 'run2') and check_code = 'tb_balanced'),
  'Debits 22501.00, credits 22500.00', 'The detail says exactly what is wrong');
select is((select (status, errors) ::text from public.integrity_runs where id = (select id from ik where k = 'run2')), '(error,4)', 'The run is marked as failed with 4 errors');

-- Numbering gaps (D-22)
select is(app.number_gaps(array['INV-2026-10-0001', 'INV-2026-10-0002', 'INV-2026-11-0004']), '1 number(s) missing between 1 and 4', 'A missing invoice number is reported');
select is(app.number_gaps(array['JV-2026-10-0001', 'JV-2026-11-0002']), null, 'Consecutive numbers across months are fine (one running counter)');

-- Bank warnings: a line unmatched for over 30 days, and the last month-end not reconciled
select tests.login('admin2@test.local');
insert into ik values ('ba', public.save_bank_account(null, (select id from fx where k = 'orgA'), jsonb_build_object('name', 'Current account', 'account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select public.import_bank_statement((select id from ik where k = 'ba'), 'old.csv', repeat('d', 64),
  jsonb_build_array(jsonb_build_object('date', current_date - 40, 'amount', -5000, 'description', 'OLD CHARGE')));
insert into ik values ('run3', public.run_integrity_checks((select id from fx where k = 'orgA')));
select is((select string_agg(check_code || '=' || status || ': ' || detail, ' | ' order by check_code) from public.integrity_results
           where run_id = (select id from ik where k = 'run3') and check_code like 'bank%'),
  'bank_reconciled=warning: Current account: never reconciled | bank_unmatched=warning: 1 bank line(s) older than 30 days are not matched',
  'Bank: the old unmatched line and the missing month-end reconciliation are warnings');

-- The nightly job checks every active client
select throws_like($$ select app.run_integrity_checks_all() $$, '%permission denied%', 'Users cannot start the all-clients nightly job');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(app.run_integrity_checks_all() >= 3, 'The nightly job runs for every client that is not archived');
select is((select count(*) from public.integrity_runs where trigger = 'nightly' and organization_id = (select id from fx where k = 'orgB')), 1::bigint, 'Client B was checked too');

-- Permanent record, and only for people with access
select throws_ok($$ update public.integrity_results set status = 'ok' where run_id = (select id from ik where k = 'run2') $$, '42501', null,
  'Results cannot be changed, not even by the database owner');
select tests.login('badmin@test.local');
select is((select count(*) from public.integrity_runs where organization_id = (select id from fx where k = 'orgA')), 0::bigint, 'Another firm sees none of client A''s results');
select throws_like($$ select public.run_integrity_checks((select id from fx where k = 'orgA')) $$, 'You are not allowed%', 'Another firm cannot run client A''s checks');

select * from finish();
rollback;
