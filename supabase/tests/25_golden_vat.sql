-- P3-04 · Golden VAT set (VAT-15). Example 1: the Phase 2 exit-test retail shop, VAT quarter Nov 2025 – Jan 2026
-- (D-55, anonymised per D-53; real amounts, dates and document numbers). Every box must match Faizan's working to
-- the fils: 1b 2,471.44 / 123.56 · 9 838.00 / 41.90 · payable 81.66. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(5);

create temp table gv (k text primary key, id uuid) on commit drop;
grant all on gv to authenticated;
insert into gv values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Pilot Retail LLC', 2025));
update public.organizations set emirate_code = 'DXB' where id = (select id from gv where k = 'org');
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
values ((select id from gv where k = 'org'), 'vat', '2025-11-01', '2026-01-31', '2026-02-28');
insert into gv select 'q', id from public.tax_periods where organization_id = (select id from gv where k = 'org') and start_date = '2025-11-01';
insert into gv values ('walkin', gen_random_uuid()), ('supA', gen_random_uuid()), ('supB', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, emirate_code) values
  ((select id from gv where k = 'walkin'), (select id from gv where k = 'org'), 'customer', 'Walk-in customer', null, 'DXB'),
  ((select id from gv where k = 'supA'), (select id from gv where k = 'org'), 'supplier', 'Supplier A', '100000000000103', 'DXB'),
  ((select id from gv where k = 'supB'), (select id from gv where k = 'org'), 'supplier', 'Supplier B', '100000000000203', 'SHJ');

create function tests.gsale(p_no text, p_date date, p_paid bigint) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into gv values (p_no, public.save_sales_invoice(null, (select id from gv where k = 'org'), jsonb_build_object(
    'contact_id', (select id from gv where k = 'walkin'), 'issue_date', p_date, 'supply_emirate', 'DXB', 'prices_include_vat', true,
    'customer_reference', p_no, 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_paid, 'tax_code', 'SR',
    'description', 'Sales', 'account_id', tests.acct((select id from gv where k = 'org'), '4000'))))));
  perform public.submit_sales_invoice((select id from gv where k = p_no));
  perform tests.login('super@test.local');
  perform public.post_sales_invoice((select id from gv where k = p_no));
end $$;
create function tests.gbill(p_no text, p_sup text, p_date date, p_net bigint) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into gv values (p_no, public.save_purchase_bill(null, (select id from gv where k = 'org'), jsonb_build_object(
    'contact_id', (select id from gv where k = p_sup), 'supplier_invoice_no', p_no, 'bill_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Goods for resale',
    'account_id', tests.acct((select id from gv where k = 'org'), '5000'))))));
  perform tests.login('super@test.local');
  perform public.post_purchase_bill((select id from gv where k = p_no));
end $$;
create function tests.gboxes(p_codes text[]) returns text language sql as $$
  select string_agg((b ->> 'box_code') || ' ' || (b ->> 'amount') || '/' || (b ->> 'vat'), '; ' order by (b ->> 'sort')::int)
  from jsonb_array_elements(public.vat_return_preview((select id from gv where k = 'q')) -> 'boxes') b
  where b ->> 'box_code' = any (p_codes)
$$;
grant execute on all functions in schema tests to authenticated;

-- 19 handwritten shop invoices: the customer paid a round amount that includes VAT (D-54)
select tests.gsale(n, d::date, p) from (values
  ('0976', '2025-11-02', 6000), ('0977', '2025-11-05', 4500), ('0978', '2025-11-09', 10500), ('0979', '2025-11-15', 7500),
  ('0980', '2025-11-15', 30000), ('0981', '2025-11-24', 15000), ('0982', '2025-11-30', 19500), ('0983', '2025-12-01', 12400),
  ('0984', '2025-12-09', 16400), ('0985', '2025-12-09', 10000), ('0986', '2025-12-16', 7400), ('0987', '2025-12-25', 16000),
  ('0988', '2025-12-30', 17000), ('0989', '2026-01-04', 20500), ('0990', '2026-01-13', 20500), ('0991', '2026-01-23', 10400),
  ('0992', '2026-01-27', 7000), ('0993', '2026-01-28', 17500), ('0994', '2026-01-31', 11400)) x(n, d, p);
-- 4 supplier tax invoices (before VAT)
select tests.gbill(n, s, d::date, a) from (values
  ('SIV-157569', 'supB', '2025-11-10', 13800), ('INV-000337', 'supA', '2025-11-18', 33000),
  ('SIV-158757', 'supB', '2025-12-10', 7000), ('INV-000358', 'supA', '2025-12-16', 30000)) x(n, s, d, a);

select tests.login('admin2@test.local');
select is(tests.gboxes(array['1b']), '1b 247144/12356', 'VAT-15 · box 1b Dubai = 2,471.44 / 123.56 (paid 2,595.00 incl. VAT)');
select is(tests.gboxes(array['9']), '9 83800/4190', 'VAT-15 · box 9 = 838.00 / 41.90');
select is(tests.gboxes(array['8', '11', '12', '13', '14']), '8 247144/12356; 11 83800/4190; 12 0/12356; 13 0/4190; 14 0/8166',
  'VAT-15 · totals and payable 81.66 (the shop filed 81.36 — VAT written as 5% of the total, D-54)');
select is(tests.gboxes(array['1a', '1c', '1d', '1e', '1f', '1g', '2', '3', '4', '5', '6', '7', '10']),
  '1a 0/0; 1c 0/0; 1d 0/0; 1e 0/0; 1f 0/0; 1g 0/0; 2 0/0; 3 0/0; 4 0/0; 5 0/0; 6 0/0; 7 0/0; 10 0/0', 'Every other box is 0.00 (D-12)');
select is((select sum(vat_amount) from public.journal_lines l join public.journals j on j.id = l.journal_id
           where j.organization_id = (select id from gv where k = 'org') and l.tax_code = 'SR' and l.account_id = tests.acct((select id from gv where k = 'org'), '4000')),
  12356::numeric, 'The ledger carries the same output VAT, invoice by invoice (drill-down source)');

select * from finish();
rollback;
