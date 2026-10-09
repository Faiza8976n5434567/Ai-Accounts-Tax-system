-- P4-02 → P4-05 · e-invoicing data (PINT AE 1.0.4, D-59, D-60): items list rules, invoice lines keep the item's codes,
-- document fields, customer type, permissions. Client A.
begin;
\ir fixtures/setup.psql
select plan(12);

create temp table ed (k text primary key, id uuid) on commit drop;
grant all on ed to authenticated;
insert into ed values ('cust', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, emirate_code, address_line1, city)
values ((select id from ed where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Peppol Buyer LLC', '100111222300003', 'DXB', 'Office 12, Bay Square', 'Dubai');
grant execute on all functions in schema tests to authenticated;

-- 1 · Items list rules (D-60)
select tests.login('acct@test.local');
select throws_ok($$ insert into public.items (organization_id, name, item_type, unit_code) values ((select id from fx where k = 'orgA'), 'Laptop', 'G', 'H87') $$,
  '23514', null, 'Goods need an HS code (IBR-184-AE)');
select throws_ok($$ insert into public.items (organization_id, name, item_type) values ((select id from fx where k = 'orgA'), 'Audit', 'S') $$,
  '23514', null, 'Services need a service accounting code (IBR-185-AE)');
select throws_ok($$ insert into public.items (organization_id, name, item_type, sac_code, tax_code) values ((select id from fx where k = 'orgA'), 'Loan fee', 'S', '9971', 'EX') $$,
  '23514', null, 'Exempt items need an exemption reason (IBR-167-AE)');
with x as (insert into public.items (organization_id, name, description, item_type, hs_code, unit_code, default_price, tax_code)
  values ((select id from fx where k = 'orgA'), 'Laptop 14"', 'Business laptop, 14 inch', 'G', '84713000', 'H87', 350000, 'SR') returning id)
insert into ed select 'laptop', id from x;
with x as (insert into public.items (organization_id, name, description, item_type, sac_code, unit_code, tax_code)
  values ((select id from fx where k = 'orgA'), 'Consulting', 'Advisory services per hour', 'S', '998311', 'HUR', 'SR') returning id)
insert into ed select 'consult', id from x;
select is((select count(*) from public.items where organization_id = (select id from fx where k = 'orgA')), 2::bigint, 'The accountant adds goods and services to the items list');
select throws_ok($$ insert into public.items (organization_id, name, item_type, sac_code) values ((select id from fx where k = 'orgA'), 'consulting', 'S', '1') $$,
  '23505', null, 'Item names are unique per client (any capitalisation)');

-- 2 · An invoice line keeps the item's codes; document fields
insert into ed values ('inv', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
  'contact_id', (select id from ed where k = 'cust'), 'issue_date', '2026-10-05', 'supply_emirate', 'DXB', 'payment_means_code', '30',
  'lines', jsonb_build_array(
    jsonb_build_object('item_id', (select id from ed where k = 'laptop'), 'description', 'Business laptop, 14 inch', 'quantity', 2, 'unit_price', 350000, 'tax_code', 'SR',
                       'account_id', tests.acct((select id from fx where k = 'orgA'), '4000')),
    jsonb_build_object('item_id', (select id from ed where k = 'consult'), 'description', 'Advisory services per hour', 'quantity', 3, 'unit_price', 50000, 'tax_code', 'SR',
                       'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
select is((select string_agg(item_type || ' ' || coalesce(hs_code, '-') || ' ' || coalesce(sac_code, '-') || ' ' || unit_code, '; ' order by line_no)
           from public.sales_invoice_lines where sales_invoice_id = (select id from ed where k = 'inv')),
  'G 84713000 - H87; S - 998311 HUR', 'P4-04 · each line keeps its item''s type, HS / service code and unit');
update public.items set hs_code = '84714100' where id = (select id from ed where k = 'laptop');
select is((select hs_code from public.sales_invoice_lines where sales_invoice_id = (select id from ed where k = 'inv') and line_no = 1), '84713000',
  'Changing the item later does not change an existing invoice');
select is((select (transaction_type, payment_means_code, einv_uuid is not null)::text from public.sales_invoices where id = (select id from ed where k = 'inv')),
  '(00000000,30,t)', 'P4-05 · transaction type (BTAE-02), payment means and UUID (BTAE-07) are kept');
select throws_like($$ select public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
  'contact_id', (select id from ed where k = 'cust'), 'issue_date', '2026-10-05', 'credit_reason_code', 'DL8.61.1.A',
  'lines', jsonb_build_array(jsonb_build_object('description', 'x', 'quantity', 1, 'unit_price', 100, 'tax_code', 'SR',
           'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))) $$, '%sales_invoices_credit_reason%',
  'A credit note reason belongs on credit notes only');
select is((select count(distinct einv_uuid) = count(*) from public.sales_invoices), true, 'Every document has its own UUID');

-- 3 · Customer type (D-59) and permissions
select is((select customer_type from public.contacts where id = (select id from ed where k = 'cust')), 'business', 'Customers are businesses unless marked otherwise (consumers are B2C, D-59)');
select tests.login('ro@test.local');
select throws_ok($$ insert into public.items (organization_id, name, item_type, sac_code) values ((select id from fx where k = 'orgA'), 'Training', 'S', '999293') $$,
  '42501', null, 'A read-only user cannot add items');

select * from finish();
rollback;
