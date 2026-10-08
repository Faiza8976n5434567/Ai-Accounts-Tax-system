-- Data migration (Q-25 → D-52): opening journal + opening documents; 3999 ends at zero and the trial balance at the
-- cut-off equals the old system's. Conversion date 30 Jun 2026.
begin;
\ir fixtures/setup.psql
select plan(12);

create temp table op (k text primary key, id uuid) on commit drop;
grant all on op to authenticated;
insert into op values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Pilot Co LLC', 2026));
insert into op values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('s', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name) values
  ((select id from op where k = 'a'), (select id from op where k = 'org'), 'customer', 'Customer A'),
  ((select id from op where k = 'b'), (select id from op where k = 'org'), 'customer', 'Customer B'),
  ((select id from op where k = 's'), (select id from op where k = 'org'), 'supplier', 'Supplier S');
create function tests.gl(p_code text, p_to date) returns bigint language sql stable security definer as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  where j.status in ('posted', 'reversed') and j.entry_date <= p_to and l.account_id = tests.acct((select id from op where k = 'org'), p_code)
$$;
grant execute on all functions in schema tests to authenticated;

-- 1 · The opening journal from the old trial balance; receivables and payables go to 3999
select tests.login('admin2@test.local');
insert into op values ('oj', gen_random_uuid());
insert into public.journals (id, organization_id, entry_date, source, memo) values ((select id from op where k = 'oj'), (select id from op where k = 'org'), '2026-06-30', 'opening', 'Opening balances at 30 Jun 2026');
insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
select (select id from op where k = 'oj'), (select id from op where k = 'org'), n, tests.acct((select id from op where k = 'org'), code), dr, cr
from (values (1, '1010', 5000000, 0), (2, '3999', 1575000, 0), (3, '3999', 0, 420000), (4, '2100', 0, 75000), (5, '3000', 0, 2000000), (6, '3200', 0, 4080000)) x(n, code, dr, cr);
select tests.login('super@test.local');
select public.post_journal((select id from op where k = 'oj'));
select is(tests.gl('3999', '2026-06-30'), 1155000::bigint, 'After the opening journal 3999 holds receivables 15,750 − payables 4,200 = 11,550');

-- 2 · The unpaid documents of the old system (all-or-nothing)
select tests.login('admin2@test.local');
select throws_like($$ select public.save_opening_documents((select id from op where k = 'org'), '[
  {"row": 2, "kind": "customer", "contact_name": "Customer A", "number": "INV-OLD-101", "date": "2026-05-15", "due_date": "2026-06-14", "amount": 1050000},
  {"row": 3, "kind": "customer", "contact_name": "Nobody LLC", "number": "INV-OLD-103", "date": "2026-05-15", "amount": 1000},
  {"row": 4, "kind": "customer", "contact_name": "Customer A", "number": "inv-old-101", "date": "2026-05-15", "amount": 1000}]') $$,
  'Nothing was saved — please correct: Row 3: Nobody LLC is not a contact of this client%Row 4: inv-old-101 appears twice in the file%',
  'One wrong row stops the whole list, with row numbers');
select is(public.save_opening_documents((select id from op where k = 'org'), '[
  {"row": 2, "kind": "customer", "contact_name": "Customer A", "number": "INV-OLD-101", "date": "2026-05-15", "due_date": "2026-06-14", "amount": 1050000},
  {"row": 3, "kind": "customer", "contact_name": "customer b", "number": "INV-OLD-102", "date": "2026-06-20", "due_date": "2026-07-20", "amount": 525000},
  {"row": 4, "kind": "supplier", "contact_name": "Supplier S", "number": "BILL-77", "date": "2026-06-10", "due_date": "2026-07-10", "amount": 420000}]'),
  3, 'Three opening documents saved, waiting to be posted');
select throws_like($$ select public.post_opening_documents((select id from op where k = 'org'), '2026-06-30') $$, '%someone else must post them%',
  'R1 · the person who entered them cannot post them');

-- 3 · A second Firm Admin posts them at the conversion date
select tests.login('super@test.local');
select is(public.post_opening_documents((select id from op where k = 'org'), '2026-06-30'), 3, 'Posted at 30 Jun 2026');
select is(tests.gl('3999', '2026-06-30') || ' · AR ' || tests.gl('1100', '2026-06-30') || ' · AP ' || tests.gl('2000', '2026-06-30'), '0 · AR 1575000 · AP -420000',
  'D-52 · 3999 is exactly zero: the documents match the trial balance; receivables 15,750 and payables 4,200 are in place');
select is((select string_agg(code || ' ' || closing, ', ' order by code) from public.trial_balance((select id from op where k = 'org'), '2026-01-01', '2026-06-30') where closing <> 0),
  '1010 5000000, 1100 1575000, 2000 -420000, 2100 -75000, 3000 -2000000, 3200 -4080000',
  'The trial balance at the cut-off equals the old system''s, account by account');

-- 4 · They behave like any invoice or bill: ageing, statements, receipts; no VAT
select is((select string_agg(doc_no || ' ' || open_aed || ' (' || days_overdue || 'd)', ', ' order by doc_no) from public.ageing((select id from op where k = 'org'), 'customer', '2026-07-31')),
  'INV-OLD-101 1050000 (47d), INV-OLD-102 525000 (11d)', 'Opening invoices age by their real due dates');
insert into op values ('r', public.save_payment(null, (select id from op where k = 'org'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from op where k = 'a'), 'payment_date', '2026-07-05', 'amount', 1050000, 'bank_account_id', tests.acct((select id from op where k = 'org'), '1010'))));
select tests.login('admin2@test.local');
select public.post_payment((select id from op where k = 'r'));
select is((select count(*) from public.ageing((select id from op where k = 'org'), 'customer', '2026-07-31') where doc_no = 'INV-OLD-101'), 0::bigint,
  'A receipt settles the old invoice INV-OLD-101');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from app.vat201_base((select id from op where k = 'org'), '2026-01-01', '2026-12-31')), 0::bigint,
  'Opening documents never touch the VAT return (the VAT was declared in the old system)');
select tests.login('admin2@test.local');
insert into op values ('ic', public.run_integrity_checks((select id from op where k = 'org')));
select is((select string_agg(check_code || '=' || status, ' ' order by check_code) from public.integrity_results
           where run_id = (select id from op where k = 'ic') and status <> 'ok'), null,
  'Integrity: everything ties up — old numbers are not counted as gaps and 3999 is zero');
select throws_like($$ select public.delete_opening_document((select id from public.sales_invoices where invoice_no = 'INV-OLD-102')) $$,
  '%Only an opening document waiting for posting can be deleted%', 'A posted opening document cannot be deleted');

select * from finish();
rollback;
