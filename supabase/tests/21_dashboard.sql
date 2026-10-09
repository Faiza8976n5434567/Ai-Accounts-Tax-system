-- Firm dashboard (P3-07): live figures per client, and each person sees only the clients they may see.
begin;
\ir fixtures/setup.psql
select plan(8);

create temp table db (k text primary key, id uuid) on commit drop;
grant all on db to authenticated;
create function tests.dash(p_col text) returns text language plpgsql as $$
declare v text;
begin
  execute format('select (%s)::text from public.firm_dashboard() where organization_id = %L', p_col, (select id from fx where k = 'orgA')) into v;
  return v;
end $$;
grant execute on all functions in schema tests to authenticated;
-- An ended VAT quarter past its due date (overdue) and one ended recently (due in the future)
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values
  ((select id from fx where k = 'orgA'), 'vat', current_date - 190, current_date - 100, current_date - 72),
  ((select id from fx where k = 'orgA'), 'vat', current_date - 99, current_date - 5, current_date + 23);
insert into db values ('cust', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name) values ((select id from db where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Dash Buyer LLC');

select tests.login('acct@test.local');
-- an invoice 60 days old (due 30 days ago, unpaid) and a second one waiting for approval
insert into db values ('old', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from db where k = 'cust'),
  'issue_date', current_date - 60, 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 1000000, 'tax_code', 'SR', 'description', 'Service',
  'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
insert into db values ('new', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from db where k = 'cust'),
  'issue_date', current_date, 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 50000, 'tax_code', 'SR', 'description', 'Service',
  'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
select public.submit_sales_invoice((select id from db where k = 'new'));
-- a manual journal waiting for approval
insert into public.journals (organization_id, entry_date, memo, status) values ((select id from fx where k = 'orgA'), current_date, 'Waiting', 'pending');
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from db where k = 'old'));
select public.run_integrity_checks((select id from fx where k = 'orgA'));


select is(tests.dash('vat_open_returns') || ' open, ' || tests.dash('vat_overdue_returns') || ' overdue, next due ' || tests.dash('vat_next_due'),
  '2 open, 1 overdue, next due ' || (current_date - 72), 'VAT: two ended quarters not yet approved, one already past its due date');
select is(tests.dash('pending_journals') || '/' || tests.dash('pending_invoices') || '/' || tests.dash('pending_bills'), '1/1/0',
  'Approvals waiting: 1 journal, 1 invoice, 0 bills');
select is(tests.dash('ar_open') || ' / ' || tests.dash('ar_overdue'), '1050000 / 1050000', 'Receivables 10,500 open, all of it overdue (due 30 days ago)');
select is(tests.dash('revenue_365'), '1000000', 'Revenue of the last 12 months 10,000 (the waiting invoice is not counted)');
select is((select ar_open::numeric from public.firm_dashboard() where organization_id = (select id from fx where k = 'orgA')),
  (select sum(open_aed) from public.ageing((select id from fx where k = 'orgA'), 'customer', current_date)),
  'The dashboard''s receivables equal the ageing report');
select ok(tests.dash('integrity_status') is not null, 'The latest integrity result is shown');

-- Each person sees only their own clients
select tests.login('badmin@test.local');
select is((select string_agg(legal_name, ', ') from public.firm_dashboard()), 'Firm B Client C LLC', 'Another firm sees only its own client');
select tests.login('staff@test.local');
select is((select string_agg(legal_name, ', ') from public.firm_dashboard()), 'Client A LLC', 'A client user sees only their company');

select * from finish();
rollback;
