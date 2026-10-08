-- Phase 2 closing tests: FX-05 (a future USD rate change), DM-02 (duplicate invoice numbers), VAT-12 (Q4 due date).
begin;
\ir fixtures/setup.psql
select plan(6);

create temp table g (k text primary key, id uuid) on commit drop;
grant all on g to authenticated;
insert into g values ('cust', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name) values ((select id from g where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'USD Buyer Inc');

create function tests.usd_invoice(p_key text, p_date date) returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into g values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from g where k = 'cust'), 'issue_date', p_date, 'currency', 'USD',
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 100000, 'tax_code', 'ZR', 'description', 'Export',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from g where k = p_key));
end $$;
grant execute on all functions in schema tests to authenticated;

-- A December invoice at today's rate, posted
select tests.usd_invoice('dec', '2026-12-15');

-- FX-05 · a new rate 3.7000 is approved, effective 1 Jan 2027
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.config_versions (label, effective_from) values ('test-2027.01', '2027-01-01');
insert into public.config_values (version_id, key, value, legal_reference, last_verified, needs_verification)
select id, 'fx.usd_aed', '3.7', 'Test only', '2026-10-08', false from public.config_versions where label = 'test-2027.01';
select app.set_ctx('approve_config_version');
update public.config_versions set status = 'approved', approved_at = now(), approval_reason = 'FX-05 test' where label = 'test-2027.01';
select app.set_ctx(null);

select tests.usd_invoice('jan', '2027-01-05');
select is((select (fx_rate::numeric(12,4), gross_total)::text from public.sales_invoices where id = (select id from g where k = 'jan')), '(3.7000,370000)',
  'FX-05 · a document dated after the change uses the new rate: USD 1,000 → AED 3,700.00');
select is((select (fx_rate::numeric(12,4), gross_total)::text from public.sales_invoices where id = (select id from g where k = 'dec')), '(3.6725,367250)',
  'FX-05 · the existing December document is unchanged (AED 3,672.50)');
select tests.login('acct@test.local');
insert into g values ('dec2', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
  'contact_id', (select id from g where k = 'cust'), 'issue_date', '2026-12-20', 'currency', 'USD',
  'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 100000, 'tax_code', 'ZR', 'description', 'Late December',
           'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
select is((select fx_rate::numeric(12,4) from public.sales_invoices where id = (select id from g where k = 'dec2')), 3.6725::numeric(12,4),
  'FX-05 · a new document dated before the change still uses the old rate (by document date)');

-- DM-02 · two invoices can never share a number, even if the rules were switched off
reset role;
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
select throws_ok($$ update public.sales_invoices set invoice_no = (select invoice_no from public.sales_invoices where id = (select id from g where k = 'dec'))
  where id = (select id from g where k = 'jan') $$, '23505', null, 'DM-02 · a duplicate invoice number is rejected by the database');
set local session_replication_role = origin;

-- VAT-12 · quarter Oct–Dec 2026 is due 28 Jan 2027 (a client whose first VAT period ends 31 Dec 2026)
select tests.login('admin2@test.local');
insert into g values ('q4', public.create_client(p_legal_name => 'Q4 Stagger LLC', p_emirate_code => 'AUH', p_books_start => '2026-10-01',
  p_trn => '100999888777003', p_vat_registered => true, p_vat_period => 'quarterly', p_vat_first_period_end => '2026-12-31'));
select is((select start_date || '→' || end_date || ' due ' || due_date from public.tax_periods
           where organization_id = (select id from g where k = 'q4') and kind = 'vat' order by start_date limit 1),
  '2026-10-01→2026-12-31 due 2027-01-28', 'VAT-12 · Oct–Dec 2026 is due 28 Jan 2027');
select is((select count(*) from public.tax_periods where organization_id = (select id from g where k = 'q4') and kind = 'vat' and due_date <> end_date + 28),
  0::bigint, 'Every VAT period is due 28 days after it ends');

select * from finish();
rollback;
