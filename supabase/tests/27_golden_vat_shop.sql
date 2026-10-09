-- P3-04 · Golden VAT set (VAT-15), examples 2–4: the retail shop's quarters Nov 2024 – Jan 2025, Feb – Apr 2025 and
-- Aug – Oct 2025 (anonymised per D-53; real invoice numbers, dates and amounts from Faizan's workings). Sales are VAT-inclusive
-- (D-54): paid = workings' "before VAT" ÷ 0.95; invoices 0844, 0850, 0876 and 0886 use the workings' inclusive amount (to
-- confirm against the paper invoices). Generated from the workings by a script — do not edit figures by hand. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(10);

create temp table gs (k text primary key, id uuid) on commit drop;
grant all on gs to authenticated;
insert into gs values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Pilot Retail LLC', 2024));
update public.organizations set emirate_code = 'DXB' where id = (select id from gs where k = 'org');
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values ((select id from gs where k = 'org'), 'vat', '2024-11-01', '2025-01-31', '2025-01-31'::date + 28);
insert into gs select 'q1', id from public.tax_periods where organization_id = (select id from gs where k = 'org') and start_date = '2024-11-01';
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values ((select id from gs where k = 'org'), 'vat', '2025-02-01', '2025-04-30', '2025-04-30'::date + 28);
insert into gs select 'q2', id from public.tax_periods where organization_id = (select id from gs where k = 'org') and start_date = '2025-02-01';
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values ((select id from gs where k = 'org'), 'vat', '2025-08-01', '2025-10-31', '2025-10-31'::date + 28);
insert into gs select 'q3', id from public.tax_periods where organization_id = (select id from gs where k = 'org') and start_date = '2025-08-01';
insert into gs values ('walkin', gen_random_uuid()), ('supA', gen_random_uuid()), ('supB', gen_random_uuid()), ('supC', gen_random_uuid()), ('supD', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, emirate_code) values
  ((select id from gs where k = 'walkin'), (select id from gs where k = 'org'), 'customer', 'Walk-in customer', null, 'DXB'),
  ((select id from gs where k = 'supA'), (select id from gs where k = 'org'), 'supplier', 'Supplier A', '100000000000103', 'DXB'),
  ((select id from gs where k = 'supB'), (select id from gs where k = 'org'), 'supplier', 'Supplier B', '100000000000203', 'SHJ'),
  ((select id from gs where k = 'supC'), (select id from gs where k = 'org'), 'supplier', 'Supplier C', '100000000000303', 'DXB'),
  ((select id from gs where k = 'supD'), (select id from gs where k = 'org'), 'supplier', 'Supplier D', '100000000000403', 'DXB');

create function tests.ssale(p_no text, p_date date, p_paid bigint) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into gs values ('s' || p_no, public.save_sales_invoice(null, (select id from gs where k = 'org'), jsonb_build_object(
    'contact_id', (select id from gs where k = 'walkin'), 'issue_date', p_date, 'supply_emirate', 'DXB', 'prices_include_vat', true,
    'customer_reference', p_no, 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_paid, 'tax_code', 'SR',
    'description', 'Sales', 'account_id', tests.acct((select id from gs where k = 'org'), '4000'))))));
  perform public.submit_sales_invoice((select id from gs where k = 's' || p_no));
  perform tests.login('super@test.local');
  perform public.post_sales_invoice((select id from gs where k = 's' || p_no));
end $$;
create function tests.sbill(p_no text, p_sup text, p_date date, p_net bigint) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into gs values ('b' || p_no, public.save_purchase_bill(null, (select id from gs where k = 'org'), jsonb_build_object(
    'contact_id', (select id from gs where k = p_sup), 'supplier_invoice_no', p_no, 'bill_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Goods for resale',
    'account_id', tests.acct((select id from gs where k = 'org'), '5000'))))));
  perform tests.login('super@test.local');
  perform public.post_purchase_bill((select id from gs where k = 'b' || p_no));
end $$;
create function tests.sboxes(p_period text, p_codes text[]) returns text language sql as $$
  select string_agg((b ->> 'box_code') || ' ' || (b ->> 'amount') || '/' || (b ->> 'vat'), '; ' order by (b ->> 'sort')::int)
  from jsonb_array_elements(public.vat_return_preview((select id from gs where k = p_period)) -> 'boxes') b
  where b ->> 'box_code' = any (p_codes)
$$;
grant execute on all functions in schema tests to authenticated;

select tests.ssale(n, d::date, p) from (values
  ('0838', '2024-11-01', 11500),
  ('0839', '2024-11-01', 13900),
  ('0840', '2024-11-04', 22500),
  ('0841', '2024-11-07', 8500),
  ('0842', '2024-11-08', 45000),
  ('0843', '2024-11-12', 28500),
  ('0844', '2024-11-16', 44677),
  ('0845', '2024-11-21', 20200),
  ('0846', '2024-11-26', 8000),
  ('0847', '2024-11-29', 13500),
  ('0848', '2024-12-01', 16500),
  ('0849', '2024-12-04', 38000),
  ('0850', '2024-12-02', 33390),
  ('0851', '2024-12-05', 14000),
  ('0852', '2024-12-08', 3000),
  ('0853', '2024-12-11', 30000),
  ('0854', '2024-12-15', 14500),
  ('0855', '2024-12-16', 18500),
  ('0856', '2024-12-18', 12000),
  ('0857', '2024-12-22', 17900),
  ('0858', '2024-12-23', 45000),
  ('0859', '2024-12-26', 10800),
  ('0860', '2024-12-30', 6000),
  ('0861', '2024-12-31', 34200),
  ('0862', '2025-01-02', 27900),
  ('0863', '2025-01-06', 1000),
  ('0864', '2025-01-10', 9900),
  ('0865', '2025-01-12', 6000),
  ('0866', '2025-01-13', 14700),
  ('0867', '2025-01-14', 6900),
  ('0868', '2025-01-21', 12900),
  ('0869', '2025-01-26', 13000),
  ('0870', '2025-01-30', 15000),
  ('0871', '2025-02-03', 3500),
  ('0872', '2025-02-05', 4900),
  ('0873', '2025-02-06', 6500),
  ('0874', '2025-02-12', 11000),
  ('0875', '2025-02-19', 7500),
  ('0876', '2025-02-28', 8505),
  ('0877', '2025-03-05', 9900),
  ('0878', '2025-03-06', 12900),
  ('0879', '2025-03-16', 9500),
  ('0880', '2025-03-22', 5000),
  ('0881', '2025-03-28', 44700),
  ('0882', '2025-04-01', 8900),
  ('0883', '2025-04-07', 14900),
  ('0884', '2025-04-07', 8000),
  ('0885', '2025-04-15', 25000),
  ('0886', '2025-04-23', 19250),
  ('0887', '2025-04-29', 16000),
  ('0888', '2025-04-29', 9500),
  ('0960', '2025-08-01', 10000),
  ('0961', '2025-08-04', 7500),
  ('0962', '2025-08-08', 19400),
  ('0963', '2025-08-17', 12000),
  ('0964', '2025-08-18', 25000),
  ('0965', '2025-08-25', 12500),
  ('0966', '2025-09-03', 14500),
  ('0967', '2025-09-08', 18000),
  ('0968', '2025-09-17', 15000),
  ('0969', '2025-09-26', 5500),
  ('0970', '2025-09-28', 15000),
  ('0971', '2025-10-04', 8900),
  ('0972', '2025-10-13', 43500),
  ('0973', '2025-10-19', 7000),
  ('0974', '2025-10-25', 8500),
  ('0975', '2025-10-31', 25000)) x(n, d, p);
select tests.sbill(n, s, d::date, a) from (values
  ('2400642', 'supC', '2024-11-06', 158000),
  ('000211', 'supA', '2024-12-16', 6500),
  ('SO-UAE-148641', 'supD', '2024-12-11', 54240),
  ('2500273', 'supC', '2025-04-19', 44000),
  ('SO-UAE-162486', 'supD', '2025-04-15', 21600),
  ('SIV-149733', 'supB', '2025-04-24', 62500),
  ('SO-UAE-157909', 'supD', '2025-02-26', 14400),
  ('SIV-155692', 'supB', '2025-09-23', 29800)) x(n, s, d, a);

select tests.login('admin2@test.local');
select is(tests.sboxes('q1', array['1b']), '1b 587967/29400', 'VAT-15 · Nov 2024 – Jan 2025 · box 1b Dubai = 5879.67 / 294.00');
select is(tests.sboxes('q1', array['9']), '9 218740/10937', 'VAT-15 · Nov 2024 – Jan 2025 · box 9 = 2187.40 / 109.37 (as in the workings)');
select is(tests.sboxes('q1', array['14']), '14 0/18463', 'VAT-15 · Nov 2024 – Jan 2025 · payable 184.63');
select is(tests.sboxes('q2', array['1b']), '1b 214719/10736', 'VAT-15 · Feb – Apr 2025 · box 1b Dubai = 2147.19 / 107.36');
select is(tests.sboxes('q2', array['9']), '9 142500/7125', 'VAT-15 · Feb – Apr 2025 · box 9 = 1425.00 / 71.25 (as in the workings)');
select is(tests.sboxes('q2', array['14']), '14 0/3611', 'VAT-15 · Feb – Apr 2025 · payable 36.11');
select is(tests.sboxes('q3', array['1b']), '1b 235527/11773', 'VAT-15 · Aug – Oct 2025 · box 1b Dubai = 2355.27 / 117.73');
select is(tests.sboxes('q3', array['9']), '9 29800/1490', 'VAT-15 · Aug – Oct 2025 · box 9 = 298.00 / 14.90 (as in the workings)');
select is(tests.sboxes('q3', array['14']), '14 0/10283', 'VAT-15 · Aug – Oct 2025 · payable 102.83');
select is((select count(*) from public.sales_invoices where organization_id = (select id from gs where k = 'org') and status = 'posted'), 67::bigint, 'All 67 shop invoices posted');

select * from finish();
rollback;
