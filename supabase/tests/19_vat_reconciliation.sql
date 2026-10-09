-- VAT reconciliation and the automatic clearing journal (P3-03 · VAT-14 · D-47). Quarter Jul–Sep 2026, client A.
begin;
\ir fixtures/setup.psql
select plan(10);

create temp table vc (k text primary key, id uuid) on commit drop;
grant all on vc to authenticated;
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
values ((select id from fx where k = 'orgA'), 'vat', '2026-07-01', '2026-09-30', '2026-10-28');
insert into vc select 'q', id from public.tax_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-07-01' and kind = 'vat';
insert into vc values ('cust', gen_random_uuid()), ('sup', gen_random_uuid()), ('fo', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, country_code) values
  ((select id from vc where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Rec Buyer LLC', null, 'AE'),
  ((select id from vc where k = 'sup'), (select id from fx where k = 'orgA'), 'supplier', 'Rec Supplier LLC', '100300400500003', 'AE'),
  ((select id from vc where k = 'fo'), (select id from fx where k = 'orgA'), 'supplier', 'Rec Overseas Ltd', null, 'GB');

select tests.login('acct@test.local');
insert into vc values ('inv', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from vc where k = 'cust'),
  'issue_date', '2026-07-05', 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 1000000, 'tax_code', 'SR', 'description', 'Service',
  'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
insert into vc values ('b1', public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from vc where k = 'sup'),
  'supplier_invoice_no', 'R-1', 'bill_date', '2026-07-06', 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 400000, 'tax_code', 'SR',
  'description', 'Supplies', 'account_id', tests.acct((select id from fx where k = 'orgA'), '6180'))))));
insert into vc values ('b2', public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from vc where k = 'fo'),
  'supplier_invoice_no', 'R-2', 'bill_date', '2026-07-07', 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 100000, 'tax_code', 'RCS',
  'description', 'Software', 'account_id', tests.acct((select id from fx where k = 'orgA'), '6180'))))));
-- an opening VAT balance of 70 posted into the quarter (not from an invoice) — it must show as a reconciling item
insert into vc values ('op', gen_random_uuid());
insert into public.journals (id, organization_id, entry_date, source, memo) values ((select id from vc where k = 'op'), (select id from fx where k = 'orgA'), '2026-07-01', 'opening', 'Opening VAT payable');
insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
  ((select id from vc where k = 'op'), (select id from fx where k = 'orgA'), 1, tests.acct((select id from fx where k = 'orgA'), '1150'), 7000, 0),
  ((select id from vc where k = 'op'), (select id from fx where k = 'orgA'), 2, tests.acct((select id from fx where k = 'orgA'), '2100'), 0, 7000);
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from vc where k = 'inv'));
select public.post_purchase_bill((select id from vc where k = 'b1'));
select public.post_purchase_bill((select id from vc where k = 'b2'));
select public.post_journal((select id from vc where k = 'op'));

reset role;
select set_config('request.jwt.claims', '', true);
create function tests.rec() returns jsonb language sql as $$ select public.vat_reconciliation((select id from vc where k = 'q')) $$;
create function tests.rows() returns text language sql as $$
  select string_agg((x ->> 'account') || ' ' || (x ->> 'return') || '/' || (x ->> 'ledger'), '; ') from jsonb_array_elements(tests.rec() -> 'rows') x
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login('acct@test.local');
select is(tests.rows(), '2100 50000/57000; 2110 5000/5000; 1300 20000/20000; 1310 5000/5000',
  'VAT-14 · each group of boxes against its VAT account: input and reverse charge agree; output differs by the opening 70');
select is((select string_agg((x ->> 'journal_no') || ' ' || (x ->> 'source') || ' ' || (x ->> 'account') || ' ' || (x ->> 'amount'), '; ')
           from jsonb_array_elements(tests.rec() -> 'other_postings') x), 'JV-2026-07-0005 opening 2100 -7000',
  'VAT-14 · the difference is explained: the opening journal posted to 2100');
select is((tests.rec() ->> 'box14') || ' / ' || (tests.rec() ->> 'ledger_net'), '30000 / 37000', 'Box 14 = 300 payable; the ledger shows 370 including the opening 70');

-- D-43 adjustments are listed for the accountant to book
insert into vc values ('ret', public.start_vat_return((select id from vc where k = 'q')));
select public.add_vat_adjustment((select id from vc where k = 'ret'), '1a', 0, 0, -1000, 'Bad debt relief');
select is((tests.rec() ->> 'box14') || ' · ' || (tests.rec() -> 'adjustments' -> 0 ->> 'reason'), '29000 · Bad debt relief',
  'A manual adjustment changes box 14 (290) and is listed as a reconciling item');

-- D-47 · approval posts the clearing journal: VAT accounts emptied into 2120 at the quarter end
select public.submit_vat_return((select id from vc where k = 'ret'));
select tests.login('admin2@test.local');
select public.approve_vat_return((select id from vc where k = 'ret'));
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit, '; ' order by l.line_no)
           from public.vat_returns r join public.journal_lines l on l.journal_id = r.clearing_journal_id join public.accounts a on a.id = l.account_id
           where r.id = (select id from vc where k = 'ret')),
  '1300 0/20000; 1310 0/5000; 2100 57000/0; 2110 5000/0; 2120 0/37000', 'D-47 · Dr 2100 570, Dr 2110 50 / Cr 1300 200, Cr 1310 50, Cr 2120 370');
select is((select (j.entry_date, j.source::text, j.status::text, j.prepared_by = tests.uid('acct@test.local'), j.approved_by = tests.uid('admin2@test.local'))::text
           from public.vat_returns r join public.journals j on j.id = r.clearing_journal_id where r.id = (select id from vc where k = 'ret')),
  '(2026-09-30,vat,posted,t,t)', 'The clearing journal is dated the quarter end, prepared by the preparer, approved by the approver');
select is((select string_agg(a.code || ' ' || coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
             where l.account_id = a.id and j.status in ('posted', 'reversed') and j.entry_date <= '2026-09-30'), 0), '; ' order by a.code)
           from public.accounts a where a.organization_id = (select id from fx where k = 'orgA') and a.code in ('1300', '1310', '2100', '2110', '2120')),
  '1300 0; 1310 0; 2100 0; 2110 0; 2120 -37000', 'After approval the VAT accounts are empty and 2120 shows 370 payable to the FTA');
select is((tests.rec() -> 'clearing_journal' ->> 'amount') || ' ' || (select string_agg(x ->> 'ledger', ',') from jsonb_array_elements(tests.rec() -> 'rows') x),
  '37000 57000,5000,20000,5000', 'The reconciliation still compares the quarter''s own movements (the clearing journal is left out) and shows the cleared amount');

-- Paying the FTA from the bank line → 2120 (not a protected account, so Bank → Other… works)
insert into vc values ('ba', public.save_bank_account(null, (select id from fx where k = 'orgA'), jsonb_build_object('name', 'Current', 'account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select public.import_bank_statement((select id from vc where k = 'ba'), 'oct.csv', repeat('e', 64), '[{"date": "2026-10-05", "amount": -37000, "description": "FTA VAT PAYMENT"}]');
insert into vc values ('payj', public.post_bank_line((select id from public.bank_transactions where description = 'FTA VAT PAYMENT'), tests.acct((select id from fx where k = 'orgA'), '2120'), 'VAT Q3 2026'));
select tests.login('super@test.local');
select public.post_journal((select id from vc where k = 'payj'));
select is((select sum(l.debit - l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
           where l.account_id = tests.acct((select id from fx where k = 'orgA'), '2120') and j.status in ('posted', 'reversed')), 0::numeric,
  'After paying the FTA from the bank line, 2120 is zero');
select is((select status::text from public.bank_transactions where description = 'FTA VAT PAYMENT'), 'matched', 'and the bank line is matched');

select * from finish();
rollback;
