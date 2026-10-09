-- Sales invoices and credit notes (P2-02). Worked examples from PLAN §6: VAT-01, VAT-02, VAT-09, VAT-10,
-- FX-01, NUM-01/02/06/07, DM-15, D-29, D-30. Amounts in fils (AED 10,000.00 = 1000000); USD in cents.
begin;
\ir fixtures/setup.psql
select plan(31);

create temp table si (k text primary key, id uuid) on commit drop;
grant all on si to authenticated;
insert into si select 'cust', id from (select 1) x, lateral (select gen_random_uuid() id) g;
insert into public.contacts (id, organization_id, kind, name, trn, emirate_code)
values ((select id from si where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Gulf Buyer LLC', '100211938400003', 'DXB');
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'both', 'Second Buyer LLC') returning id)
insert into si select 'cust2', id from x;
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'supplier', 'Only Supplier LLC') returning id)
insert into si select 'sup', id from x;
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgB'), 'customer', 'Client B Buyer') returning id)
insert into si select 'custB', id from x;

-- Builds the p_doc JSON. Each line 'qty|unit_price|account_code|tax_code|description'.
create function tests.doc(p_contact text, p_date date, p_lines text[], p_extra jsonb default '{}') returns jsonb
language sql stable security definer as $$
  select jsonb_build_object('contact_id', (select id from si where k = p_contact), 'issue_date', p_date,
    'lines', (select jsonb_agg(jsonb_build_object('quantity', split_part(x, '|', 1), 'unit_price', split_part(x, '|', 2),
              'account_id', tests.acct((select id from fx where k = 'orgA'), split_part(x, '|', 3)), 'tax_code', split_part(x, '|', 4),
              'description', split_part(x, '|', 5))) from unnest(p_lines) x)) || p_extra
$$;
grant execute on function tests.doc(text, date, text[], jsonb) to authenticated;

-- VAT-01 · standard-rated sale, net 10,000 → VAT 500; prepared by the accountant
select tests.login('acct@test.local');
insert into si values ('inv1', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-05', array['1|1000000|4010|SR|Consulting October'])));
select is((select (net_total, vat_total, gross_total, due_date, supply_emirate, status::text)::text from public.sales_invoices where id = (select id from si where k = 'inv1')),
  '(1000000,50000,1050000,2026-11-04,AUH,draft)', 'VAT-01 · net 10,000 → VAT 500; due +30 days (F-13); emirate pre-filled with head office (D-10)');
select throws_like($$ select public.post_sales_invoice((select id from si where k = 'inv1')) $$, 'You are not allowed%', 'A Firm Accountant cannot approve invoices');
select public.submit_sales_invoice((select id from si where k = 'inv1'));
select tests.login('admin2@test.local');
select is(public.post_sales_invoice((select id from si where k = 'inv1')), 'INV-2026-10-0001', 'NUM-01 · first October invoice is INV-2026-10-0001');
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit || coalesce(' ' || l.tax_code || ' vat ' || l.vat_amount || ' ' || l.supply_emirate, ''), '; ' order by l.line_no)
           from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.sales_invoices where id = (select id from si where k = 'inv1'))),
  '1100 1050000/0; 4010 0/1000000 SR vat 50000 AUH; 2100 0/50000', 'Posting: Dr Receivables 10,500 / Cr Income 10,000 (SR, AUH) / Cr VAT output 500');
select is((select (j.journal_no, j.source::text, j.prepared_by = tests.uid('acct@test.local'), j.approved_by = tests.uid('admin2@test.local'), j.contact_id = (select id from si where k = 'cust'))::text
           from public.journals j where j.id = (select journal_id from public.sales_invoices where id = (select id from si where k = 'inv1'))),
  '(JV-2026-10-0002,sale,t,t,t)', 'Its journal is numbered, keeps the accountant as preparer and the admin as approver');

-- Posted documents are frozen (R2)
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.sales_invoices set notes = 'changed' where id = (select id from si where k = 'inv1') $$, '42501', null,
  'A posted invoice cannot be changed, not even by the database owner');
select throws_ok($$ delete from public.sales_invoice_lines where sales_invoice_id = (select id from si where k = 'inv1') $$, '42501', null,
  'Its lines cannot be deleted');
select tests.login('admin2@test.local');
select throws_like($$ select public.reverse_journal((select journal_id from public.sales_invoices where id = (select id from si where k = 'inv1')), 'x') $$,
  'This journal comes from a document%', 'An invoice''s journal cannot be reversed directly — use a credit note');

-- VAT-02 / VAT-09 · Dubai chosen on the invoice; 3 lines × 33.33 → 1.67 VAT each, 5.01 total
select tests.login('acct@test.local');
insert into si values ('inv2', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-06', array['1|3333|4000|SR|A', '1|3333|4000|SR|B', '1|3333|4000|SR|C'], '{"supply_emirate":"DXB"}')));
select is((select string_agg(vat::text, ',' order by line_no) from public.sales_invoice_lines where sales_invoice_id = (select id from si where k = 'inv2')),
  '167,167,166', 'VAT-09 · D-62: VAT on the total, spread by largest remainder → 1.67, 1.67, 1.66');
select is((select vat_total from public.sales_invoices where id = (select id from si where k = 'inv2')), 500::bigint, 'VAT-09 · D-62: total VAT = 99.99 × 5% = 4.9995 → 5.00 (rounded once)');
select public.submit_sales_invoice((select id from si where k = 'inv2'));
select tests.login('admin2@test.local');
select is(public.post_sales_invoice((select id from si where k = 'inv2')), 'INV-2026-10-0002', 'NUM-02 · second October invoice');
select is((select string_agg(distinct supply_emirate, ',') from public.journal_lines
           where journal_id = (select journal_id from public.sales_invoices where id = (select id from si where k = 'inv2')) and tax_code = 'SR'),
  'DXB', 'VAT-02 · the chosen emirate (Dubai) is on the income lines for box 1b');

-- Zero-rated and exempt lines carry no VAT; fractional quantities round half-up to the fils
select tests.login('acct@test.local');
insert into si values ('inv3', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-07', array['1|2000000|4000|ZR|Export', '1|800000|4300|EX|Residential sublease', '1.5|1001|4000|SR|Half units'])));
select is((select string_agg(net || '/' || vat, ',' order by line_no) from public.sales_invoice_lines where sales_invoice_id = (select id from si where k = 'inv3')),
  '2000000/0,800000/0,1502/75', 'Zero-rated and exempt: no VAT; 1.5 × 10.01 = 15.015 → 15.02 (half-up), VAT 0.75');

-- NUM-06 · a deleted draft never uses a number
insert into si values ('del', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-08', array['1|100000|4010|SR|To be deleted'])));
select public.delete_sales_invoice((select id from si where k = 'del'));
select public.submit_sales_invoice((select id from si where k = 'inv3'));
select tests.login('admin2@test.local');
select is(public.post_sales_invoice((select id from si where k = 'inv3')), 'INV-2026-10-0003', 'NUM-06 · the deleted draft left no gap');

-- FX-01 · USD 1,000.00 standard-rated → AED 3,672.50, VAT 183.63, gross 3,856.13; USD gross 1,050.00
select tests.login('acct@test.local');
insert into si values ('usd', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-09', array['1|100000|4010|SR|Services in USD'], '{"currency":"USD"}')));
select is((select (fx_rate, net_total, vat_total, gross_total, gross_total_fcy)::text from public.sales_invoices where id = (select id from si where k = 'usd')),
  '(3.672500,367250,18363,385613,105000)', 'FX-01 · AED 3,672.50 + VAT 183.63 = 3,856.13 (USD 1,050.00)');
select public.submit_sales_invoice((select id from si where k = 'usd'));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from si where k = 'usd'));
select is((select (l.currency, l.amount_fcy, l.debit)::text from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.sales_invoices where id = (select id from si where k = 'usd')) and a.code = '1100'),
  '(USD,105000,385613)', 'FX-04 groundwork · the ledger is in AED; USD kept as document detail');

-- Validation
select tests.login('acct@test.local');
select throws_ok($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-09', array['1|100|4010|SR|x'], '{"currency":"EUR"}')) $$,
  '23514', null, 'DM-15 / FX-06 · a EUR invoice is refused');
select throws_like($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('sup', '2026-10-09', array['1|100|4010|SR|x'])) $$,
  '%supplier only%', 'A supplier-only contact cannot be invoiced');
select throws_like($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('custB', '2026-10-09', array['1|100|4010|SR|x'])) $$,
  'Choose a customer of this client%', 'Another client''s customer is refused');
select throws_like($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-09', array['1|100|6100|SR|x'])) $$,
  'Line 1: choose an active income account%', 'Sales lines must use an income account');
select throws_ok($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-09', array['1|100|4010|RCS|x'])) $$,
  '23514', null, 'Reverse charge is not a sales tax code');
select throws_ok($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-09', array['1|100.5|4010|SR|x'])) $$,
  '22P02', null, 'LED-06 · a fraction of a fils is refused');

-- Maker-checker also for a Firm Admin who prepares
select tests.login('admin2@test.local');
insert into si values ('own', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-10-10', array['1|10000|4010|SR|Own'])));
select throws_like($$ select public.post_sales_invoice((select id from si where k = 'own')) $$, 'You prepared this document%', 'R1 · the preparer cannot approve, even a Firm Admin');

-- VAT-10 / D-30 · credit note 2,000 against VAT-01 → VAT reduced by 100; never more than what is left
select tests.login('acct@test.local');
insert into si values ('cn1', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-15', array['1|200000|4010|SR|Fee reduction'], jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from si where k = 'inv1')))));
select public.submit_sales_invoice((select id from si where k = 'cn1'));
select tests.login('admin2@test.local');
select is(public.post_sales_invoice((select id from si where k = 'cn1')), 'CN-2026-10-0001', 'Credit notes have their own counter (CN-)');
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit, '; ' order by l.line_no)
           from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.sales_invoices where id = (select id from si where k = 'cn1'))),
  '1100 0/210000; 4010 200000/0; 2100 10000/0', 'VAT-10 · Dr Income 2,000 / Dr VAT 100 / Cr Receivables 2,100');
select tests.login('acct@test.local');
insert into si values ('cn2', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust', '2026-10-16', array['1|900000|4010|SR|Too much'], jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from si where k = 'inv1')))));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_sales_invoice((select id from si where k = 'cn2')) $$, '%more than what is left on the invoice%',
  'D-30 · a credit note larger than what is left (8,000) is refused');
select tests.login('acct@test.local');
select throws_like($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.doc('cust2', '2026-10-16', array['1|100|4010|SR|x'], jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from si where k = 'inv1')))) $$,
  '%same customer and currency%', 'A credit note must be for the invoice''s own customer');

-- LED-10 · an invoice dated in a locked month cannot be posted
select tests.login('admin2@test.local');
select public.lock_period((select id from public.accounting_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-11-01'), 'closed');
select tests.login('acct@test.local');
insert into si values ('nov', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.doc('cust', '2026-11-03', array['1|10000|4010|SR|November'])));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_sales_invoice((select id from si where k = 'nov')) $$, 'The period containing 2026-11-03 is locked%',
  'LED-10 · locked month refuses the invoice');

-- The ledger stays balanced, and access follows the client
select ok((select sum(closing) = 0 and sum(debit) = sum(credit) from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')),
  'Trial balance still balances after invoices and credit notes');
select tests.login('staff@test.local');
select ok((select count(*) from public.sales_invoices) >= 4, 'Client staff of A can see A''s invoices');
select tests.login('acct2@test.local');
select is((select count(*)::int from public.sales_invoices), 0, 'An unassigned accountant sees none');

select * from finish();
rollback;
