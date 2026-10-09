-- Reports (P2-06): P&L, balance sheet with the D-28 roll-forward, ageing at any date, statements.
-- PLAN §6: RPT-01, RPT-02 (D-28), ARAP-01/02/03, ARAP-12. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(17);

create temp table rk (k text primary key, id uuid) on commit drop;
grant all on rk to authenticated;
insert into rk values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Reports LLC', 2025));

-- A manual journal prepared by the second Firm Admin and approved by the Super Admin.
create function tests.jv(p_date date, p_dr text, p_cr text, p_amount bigint) returns void language plpgsql as $$
declare v_j uuid;
begin
  perform tests.login('admin2@test.local');
  insert into public.journals (organization_id, entry_date, memo) values ((select id from rk where k = 'org'), p_date, 'Test ' || p_dr || '/' || p_cr)
  returning id into v_j;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
    (v_j, (select id from rk where k = 'org'), 1, tests.acct((select id from rk where k = 'org'), p_dr), p_amount, 0),
    (v_j, (select id from rk where k = 'org'), 2, tests.acct((select id from rk where k = 'org'), p_cr), 0, p_amount);
  perform tests.login('super@test.local');
  perform public.post_journal(v_j);
end $$;
create function tests.bs(p_as_of date) returns text language sql stable as $$
  select string_agg(coalesce(code, row_kind) || ' ' || amount, '; ' order by section, row_kind, code)
  from public.balance_sheet((select id from rk where k = 'org'), p_as_of)
$$;
grant execute on all functions in schema tests to authenticated;

-- 2025: other income 1,000 and rent 300 → result 700. 2026: other income 500 and capital 2,000.
select tests.jv('2025-06-15', '1150', '4300', 100000);
select tests.jv('2025-07-01', '6100', '2010', 30000);
select tests.jv('2026-03-10', '1150', '4300', 50000);
select tests.jv('2026-03-20', '1150', '3000', 200000);
select tests.login('admin2@test.local');

select is(tests.bs('2026-03-31'), '1150 350000; 3000 200000; current_year_result 50000; earlier_years_result 70000; 2010 30000',
  'D-28 · balance sheet at 31 Mar 2026: last year''s 700 shown as earlier years'' results, this year''s 500 separately');
select is((select sum(amount) filter (where section = 'assets') - sum(amount) filter (where section <> 'assets')
           from public.balance_sheet((select id from rk where k = 'org'), '2026-03-31')), 0::numeric, 'RPT-01 · assets = liabilities + equity');
select is((select string_agg(code || ' ' || amount, '; ') from public.profit_and_loss((select id from rk where k = 'org'), '2026-01-01', '2026-03-31')),
  '4300 50000', 'RPT-02 · the 2026 P&L shows only 2026 — last year''s income and rent are not carried into it');
select is(tests.bs('2025-12-31'), '1150 100000; current_year_result 70000; 2010 30000',
  'At 31 Dec 2025 the 700 is still the current year''s result');
select is((select count(*) from public.journals where organization_id = (select id from rk where k = 'org') and source <> 'manual'), 0::bigint,
  'D-28 · the roll-forward is presentation only — no journal is created');
select is(public.fy_start_of('2026-03-31', 7) || ' ' || public.fy_start_of('2026-07-01', 7) || ' ' || public.fy_start_of('2026-03-31', 1),
  '2025-07-01 2026-07-01 2026-01-01', 'Financial year start for July and January year-ends');
select is((select sum(amount) filter (where type = 'revenue') from public.profit_and_loss((select id from rk where k = 'org'), '2025-01-01', '2025-12-31')),
  100000::numeric, 'P&L 2025: income 1,000');

-- Ageing and statements on client A (customers and a supplier)
select tests.login('acct@test.local');
insert into rk values ('cust', gen_random_uuid()), ('sup', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name) values ((select id from rk where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Ageing Buyer LLC');
insert into public.contacts (id, organization_id, kind, name, trn) values ((select id from rk where k = 'sup'), (select id from fx where k = 'orgA'), 'supplier', 'Ageing Supplier LLC', '100300400500003');
insert into rk values ('inv', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from rk where k = 'cust'),
  'issue_date', '2026-10-01', 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 1000000, 'tax_code', 'SR', 'description', 'Services',
  'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
insert into rk values ('bill', public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object('contact_id', (select id from rk where k = 'sup'),
  'supplier_invoice_no', 'AS-1', 'bill_date', '2026-10-02', 'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 100000, 'tax_code', 'SR',
  'description', 'Paper', 'account_id', tests.acct((select id from fx where k = 'orgA'), '6180'))))));
insert into rk values ('r1', public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from rk where k = 'cust'), 'payment_date', '2026-10-10', 'amount', 400000, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
insert into rk values ('r2', public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from rk where k = 'cust'), 'payment_date', '2026-10-20', 'amount', 700000, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from rk where k = 'inv'));
select public.post_purchase_bill((select id from rk where k = 'bill'));
select public.post_payment((select id from rk where k = 'r1'));
select public.post_payment((select id from rk where k = 'r2'));

reset role;
select set_config('request.jwt.claims', '', true);
create function tests.ar_at(p date) returns text language sql stable as $$
  select coalesce(string_agg(open_aed || ' (' || days_overdue || 'd)', ', '), 'none')
  from public.ageing((select id from fx where k = 'orgA'), 'customer', p) where contact_id = (select id from rk where k = 'cust')
$$;
create function tests.gl_at(p_code text, p date) returns bigint language sql stable security definer as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  where j.status in ('posted', 'reversed') and j.entry_date <= p and l.account_id = tests.acct((select id from fx where k = 'orgA'), p_code)
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login('admin2@test.local');
select is(tests.ar_at('2026-10-05'), '1050000 (-26d)', 'ARAP-01 · at 5 Oct the invoice is open in full, due in 26 days');
select is(tests.ar_at('2026-10-15'), '650000 (-16d)', 'ARAP-01 · at 15 Oct, after the 4,000 receipt: 6,500 open');
select is(tests.ar_at('2026-11-30'), 'none', 'At 30 Nov it is settled (the 7,000 receipt on 20 Oct)');
select is((select sum(open_aed) from public.ageing((select id from fx where k = 'orgA'), 'customer', '2026-10-15')), tests.gl_at('1100', '2026-10-15')::numeric,
  'ARAP-02 · customer ageing at 15 Oct = GL 1100 at 15 Oct');
select is((select coalesce(sum(open_aed), 0) from public.ageing((select id from fx where k = 'orgA'), 'customer', '2026-10-31')), tests.gl_at('1100', '2026-10-31')::numeric,
  'ARAP-02 · customer ageing at 31 Oct = GL 1100 at 31 Oct');
select is((select -sum(open_aed) from public.ageing((select id from fx where k = 'orgA'), 'supplier', '2026-10-31')), tests.gl_at('2000', '2026-10-31')::numeric,
  'ARAP-03 · supplier ageing = GL 2000');

select is((select string_agg(row_kind || ' ' || coalesce(debit, 0) || '/' || coalesce(credit, 0) || ' = ' || balance, '; ' order by row_kind desc, entry_date, journal_no)
           from public.contact_statement((select id from fx where k = 'orgA'), (select id from rk where k = 'cust'), 'customer', '2026-10-01', '2026-10-31')),
  'opening 0/0 = 0; line 1050000/0 = 1050000; line 0/400000 = 650000; line 0/650000 = 0; line 0/50000 = -50000',
  'Customer statement: invoice 10,500, receipts 4,000 and 7,000 (6,500 settled + 500 credit) → 500 in the customer''s favour');
select is((select balance from public.contact_statement((select id from fx where k = 'orgA'), (select id from rk where k = 'cust'), 'customer', '2026-11-01', '2026-11-30')),
  -50000::bigint, 'November statement starts with the 500 credit brought forward');
select is((select string_agg(section || ' ' || code, '') from public.balance_sheet((select id from fx where k = 'orgA'), '2026-10-31') where code in ('1100', '2150')),
  'liabilities 2150', 'ARAP-12 · at 31 Oct receivables are 0 and the 500 Customer Credit is shown as a liability, not netted');

-- Tenant isolation: another firm gets nothing from any report
select tests.login('badmin@test.local');
select is((select count(*) from public.balance_sheet((select id from fx where k = 'orgA'), '2026-12-31'))
          + (select count(*) from public.ageing((select id from fx where k = 'orgA'), 'customer', '2026-12-31')), 0::bigint,
  'Another firm gets nothing from the balance sheet or the ageing');
select * from finish();
rollback;
