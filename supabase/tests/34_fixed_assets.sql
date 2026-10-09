-- P5-04 · Fixed asset register and depreciation (F-21 · D-68, D-70 → D-74, PLAN §6.6 FA-01 → FA-12). One client, FY 2025.
-- Amounts in fils (AED 36,000.00 = 3600000).
begin;
\ir fixtures/setup.psql
select plan(27);

create temp table fa (k text primary key, id uuid) on commit drop;
grant all on fa to authenticated;
insert into fa values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Asset Co LLC', 2025));
update public.organizations set emirate_code = 'DXB', trn = '100000000000903' where id = (select id from fa where k = 'org');
insert into fa values ('sup', gen_random_uuid()), ('cus', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, emirate_code) values
  ((select id from fa where k = 'sup'), (select id from fa where k = 'org'), 'supplier', 'Furniture Supplier', '100000000000103', 'DXB'),
  ((select id from fa where k = 'cus'), (select id from fa where k = 'org'), 'customer', 'Car Buyer LLC', '100000000000203', 'DXB');

create function tests.fa_new(p_key text, p jsonb) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into fa values (p_key, public.save_fixed_asset(null, (select id from fa where k = 'org'), p));
end $$;
create function tests.fa_sched(p_key text, p_upto date) returns text language sql security definer as $$
  select string_agg(charge::text, ',' order by month) from app.asset_schedule((select id from fa where k = p_key), p_upto)
$$;
-- Runs the month as the preparer and posts the journal as another admin
create function tests.fa_run(p_month date) returns void language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  insert into fa values ('run' || to_char(p_month, 'YYYYMM'), public.run_depreciation((select id from fa where k = 'org'), p_month));
  perform tests.login('super@test.local');
  perform public.post_journal((select journal_id from public.depreciation_runs where id = (select id from fa where k = 'run' || to_char(p_month, 'YYYYMM'))));
end $$;
create function tests.fa_entry(p_run text, p_asset text) returns bigint language sql security definer as $$
  select amount from public.depreciation_entries where run_id = (select id from fa where k = p_run) and asset_id = (select id from fa where k = p_asset)
$$;
grant execute on all functions in schema tests to authenticated;

-- Five assets bought in January 2025, one per method
select tests.fa_new('sl',  '{"name":"Delivery van","category_code":"VEHICLES","purchase_date":"2025-01-15","cost":3600000,"method":"straight_line","life_months":36}');
select tests.fa_new('rnd', '{"name":"Laptop","category_code":"IT","purchase_date":"2025-01-01","cost":1000000,"method":"straight_line","life_months":3}');
select tests.fa_new('rb',  '{"name":"Forklift","purchase_date":"2025-01-10","cost":10000000,"method":"reducing_balance","rate_bp":2000}');
select tests.fa_new('syd', '{"name":"Printer press","purchase_date":"2025-01-01","cost":6000000,"method":"sum_of_years","life_months":36}');
select tests.fa_new('un',  '{"name":"Truck","purchase_date":"2025-01-01","cost":5000000,"method":"units","units_total":100000,"units_name":"km"}');
select is((select string_agg(asset_no, ',' order by asset_no) from public.fixed_assets where organization_id = (select id from fa where k = 'org')),
          'FA-0001,FA-0002,FA-0003,FA-0004,FA-0005', 'Assets are numbered FA-0001, FA-0002, …');

reset role;
select is(tests.fa_sched('sl', '2025-01-31'), '100000', 'FA-01 · straight line: bought 15 Jan → a full month in January (D-68): 36,000 ÷ 36 = 1,000');
select is(tests.fa_sched('rnd', '2025-12-31'), '333333,333333,333334,0,0,0,0,0,0,0,0,0', 'FA-02 · rounding: 10,000 over 3 months = 3,333.33, 3,333.33, 3,333.34 — the last month absorbs (D-72)');
select is((select string_agg(charge::text, ',' order by month) from app.asset_schedule((select id from fa where k = 'rb'), '2026-01-31') where extract(month from month) in (1, 12)),
          '166667,166663,133333', 'FA-03 · reducing balance 20%: year 1 = 20,000 (1,666.67 × 11 + 1,666.63), year 2 starts on 80,000 → 1,333.33');
select is((select sum(charge)::text from app.asset_schedule((select id from fa where k = 'rb'), '2025-12-31')), '2000000', 'FA-03 · year 1 totals exactly 20% of cost');
select is((select string_agg(y::text, ',') from (select sum(charge) y from app.asset_schedule((select id from fa where k = 'syd'), '2027-12-31')
             group by extract(year from month) order by extract(year from month)) x), '3000000,2000000,1000000',
          'FA-04 · sum-of-years'' digits over 3 years: 30,000 / 20,000 / 10,000 (3/6, 2/6, 1/6)');
select tests.login('admin2@test.local');
select public.set_asset_usage((select id from fa where k = 'un'), '2025-01-01', 2000);
select is(tests.fa_sched('un', '2025-02-28'), '100000,0', 'FA-05 · units: 2,000 of 100,000 km → 1,000 in January; no usage in February → 0');

-- D-71 · the monthly run: one journal waiting for approval, maker-checker, months in order
select tests.login('admin2@test.local');
insert into fa values ('run202501', public.run_depreciation((select id from fa where k = 'org'), '2025-01-01'));
insert into fa select 'j202501', journal_id from public.depreciation_runs where id = (select id from fa where k = 'run202501');
select is((select status::text || ' ' || source::text || ' ' || entry_date from public.journals where id = (select id from fa where k = 'j202501')),
          'pending depreciation 2025-01-31', 'FA-06 · January run = one journal dated 31 Jan, waiting for approval');
select is((select sum(debit)::text from public.journal_lines where journal_id = (select id from fa where k = 'j202501')),
          (100000 + 333333 + 166667 + 250000 + 100000)::text, 'FA-06 · it charges each asset''s January depreciation (Dr expense / Cr accumulated)');
select throws_ok($$ select public.post_journal((select id from fa where k = 'j202501')) $$, '42501', null, 'FA-06 · the preparer cannot approve the run (maker-checker)');
select throws_like($$ update public.journal_lines set debit = debit + 1 where journal_id = (select id from fa where k = 'j202501') and line_no = 1 $$,
          '%built by the app%', 'FA-06 · the depreciation journal cannot be edited by hand');
select throws_like($$ select public.run_depreciation((select id from fa where k = 'org'), '2025-02-01') $$, '%Approve (or cancel) the Jan 2025%', 'FA-06 · February waits until January is approved');
select tests.login('super@test.local');
select public.post_journal((select id from fa where k = 'j202501'));
select tests.login('admin2@test.local');
select throws_like($$ select public.run_depreciation((select id from fa where k = 'org'), '2025-01-01') $$, '%already been run%', 'FA-06 · a month is run once');
select throws_like($$ select public.set_asset_usage((select id from fa where k = 'un'), '2025-01-01', 9) $$, '%already been run%', 'FA-05 · usage of a month already run cannot change');
select tests.fa_run('2025-02-01');

-- FA-07 · an asset registered late catches up in the next run
select tests.fa_new('late', '{"name":"Shelving","purchase_date":"2025-01-20","cost":1200000,"method":"straight_line","life_months":12}');
select tests.fa_run('2025-03-01');
select is(tests.fa_entry('run202503', 'late')::text || ' ' || (select catch_up::text from public.depreciation_entries where run_id = (select id from fa where k = 'run202503') and asset_id = (select id from fa where k = 'late')),
          '300000 true', 'FA-07 · registered after the February run → March charges Jan + Feb + Mar (3,000), marked as a catch-up');

-- Once charged, the figures are fixed; only descriptive fields change
select tests.login('admin2@test.local');
select public.save_fixed_asset((select id from fa where k = 'sl'), (select id from fa where k = 'org'),
  '{"name":"Delivery van (white)","location":"Warehouse 2","tag_no":"TAG-77","purchase_date":"2025-01-15","cost":1,"method":"straight_line","life_months":36}');
select is((select name || ' / ' || location || ' / ' || cost from public.fixed_assets where id = (select id from fa where k = 'sl')), 'Delivery van (white) / Warehouse 2 / 3600000',
          'D-70 · after depreciation has started only name, location and tag change — the cost stays');
select throws_ok($$ select public.save_fixed_asset(null, (select id from fa where k = 'org'), '{"name":"No rate","purchase_date":"2025-01-01","cost":100,"method":"reducing_balance"}') $$,
          '23514', null, 'D-73 · reducing balance needs a rate');

-- FA-10 · an asset owned before the app, with accumulated depreciation as at 31 Dec 2024
select tests.fa_new('old', '{"name":"Old fit-out","purchase_date":"2024-07-01","cost":1200000,"method":"straight_line","life_months":12,"opening_accum":600000,"opening_as_at":"2024-12-31"}');
select is(tests.fa_sched('old', '2025-12-31'), '100000,100000,100000,100000,100000,100000,0,0,0,0,0,0', 'FA-10 · bought Jul 2024, 6,000 charged before the app → Jan–Jun 2025 at 1,000, ending at nil');

-- FA-09 · from a posted bill line on a fixed-asset account
select tests.login('admin2@test.local');
insert into fa values ('bill', public.save_purchase_bill(null, (select id from fa where k = 'org'), jsonb_build_object(
  'contact_id', (select id from fa where k = 'sup'), 'supplier_invoice_no', 'F-901', 'bill_date', '2025-03-05',
  'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 1000000, 'tax_code', 'SR', 'description', 'Office desks',
    'account_id', tests.acct((select id from fa where k = 'org'), '1500'))))));
select tests.login('super@test.local');
select public.post_purchase_bill((select id from fa where k = 'bill'));
select tests.login('admin2@test.local');
select is((select (c ->> 'cost') || ' ' || (c ->> 'description') from jsonb_array_elements(public.asset_register((select id from fa where k = 'org'), '2025-03-31') -> 'candidates') c),
          '1000000 Office desks', 'FA-09 · the posted bill line on 1500 is offered for the register (cost before recoverable VAT)');
insert into fa select 'desk', public.save_fixed_asset(null, (select id from fa where k = 'org'), jsonb_build_object('name', 'Office desks', 'method', 'straight_line', 'life_months', 60,
  'source_bill_line_id', (select l.id from public.purchase_bill_lines l where l.purchase_bill_id = (select id from fa where k = 'bill'))));
select is((select purchase_date || ' ' || cost from public.fixed_assets where id = (select id from fa where k = 'desk')), '2025-03-05 1000000', 'FA-09 · cost and date come from the bill');
select throws_ok($$ select public.save_fixed_asset(null, (select id from fa where k = 'org'), jsonb_build_object('name', 'Again', 'method', 'straight_line', 'life_months', 60,
  'source_bill_line_id', (select l.id from public.purchase_bill_lines l where l.purchase_bill_id = (select id from fa where k = 'bill')))) $$, '23505', null, 'FA-09 · a bill line becomes one asset only');

-- D-74 · disposals (no charge in the month of disposal)
select throws_like($$ select public.dispose_asset((select id from fa where k = 'syd'), '2025-06-10', 'scrapped') $$, '%Run depreciation up to May 2025 first%',
          'D-74 · a disposal waits until depreciation is run up to the month before');
select public.dispose_asset((select id from fa where k = 'rnd'), '2025-04-15', 'scrapped');
select is((select string_agg(a.code || ':' || l.debit || '/' || l.credit, ' ' order by l.line_no) from public.journal_lines l join public.accounts a on a.id = l.account_id
            where l.journal_id = (select disposal_journal_id from public.fixed_assets where id = (select id from fa where k = 'rnd'))),
          '1510:1000000/0 1500:0/1000000', 'FA-08 · scrapping a fully depreciated laptop: accumulated depreciation and cost removed, no gain or loss');
-- Sale of the van: sales invoice to 1520 (VAT as usual), then the disposal
insert into fa values ('inv', public.save_sales_invoice(null, (select id from fa where k = 'org'), jsonb_build_object(
  'contact_id', (select id from fa where k = 'cus'), 'issue_date', '2025-04-10', 'supply_emirate', 'DXB',
  'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', 3500000, 'tax_code', 'SR', 'description', 'Sale of delivery van',
    'account_id', tests.acct((select id from fa where k = 'org'), '1520'))))));
select public.submit_sales_invoice((select id from fa where k = 'inv'));
select tests.login('super@test.local');
select public.post_sales_invoice((select id from fa where k = 'inv'));
select tests.login('admin2@test.local');
select public.dispose_asset((select id from fa where k = 'sl'), '2025-04-10', 'sold',
  (select l.id from public.sales_invoice_lines l where l.sales_invoice_id = (select id from fa where k = 'inv')));
select is((select string_agg(a.code || ':' || l.debit || '/' || l.credit, ' ' order by l.line_no) from public.journal_lines l join public.accounts a on a.id = l.account_id
            where l.journal_id = (select disposal_journal_id from public.fixed_assets where id = (select id from fa where k = 'sl'))),
          '1510:300000/0 1520:3500000/0 4320:0/200000 1500:0/3600000', 'FA-08 · van sold for 35,000 with book value 33,000 → gain 2,000');
select tests.login('super@test.local');
select public.post_journal((select disposal_journal_id from public.fixed_assets where id = (select id from fa where k = 'sl')));
select public.post_journal((select disposal_journal_id from public.fixed_assets where id = (select id from fa where k = 'rnd')));
select tests.fa_run('2025-04-01');
select is(tests.fa_entry('run202504', 'sl'), null, 'D-74 · no depreciation for the van in its month of disposal');

-- The register agrees with the ledger
-- (the assets entered by hand were owned before: their opening balances, as the opening-balance journal would hold them)
select tests.login('admin2@test.local');
with j as (insert into public.journals (organization_id, entry_date, memo, source) values ((select id from fa where k = 'org'), '2025-01-01', 'Opening fixed assets', 'opening') returning id)
insert into fa select 'open', id from j;
insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
  ((select id from fa where k = 'open'), (select id from fa where k = 'org'), 1, tests.acct((select id from fa where k = 'org'), '1500'), 28000000, 0),
  ((select id from fa where k = 'open'), (select id from fa where k = 'org'), 2, tests.acct((select id from fa where k = 'org'), '1510'), 0, 600000),
  ((select id from fa where k = 'open'), (select id from fa where k = 'org'), 3, tests.acct((select id from fa where k = 'org'), '3000'), 0, 27400000);
select tests.login('super@test.local');
select public.post_journal((select id from fa where k = 'open'));
select is((select count(*)::int from jsonb_array_elements(public.asset_register((select id from fa where k = 'org'), '2025-04-30') -> 'ledger') g
            where (g ->> 'register')::bigint is distinct from (g ->> 'ledger')::bigint and g ->> 'code' <> '1500'), 0,
          'Principle 10 · accumulated depreciation in the register = the ledger (1510)');
select is((select (g ->> 'register') || ' / ' || (g ->> 'ledger') from jsonb_array_elements(public.asset_register((select id from fa where k = 'org'), '2025-04-30') -> 'ledger') g where g ->> 'code' = '1500' and g ->> 'kind' = 'cost'),
          '24400000 / 24400000', 'Principle 10 · cost in the register = the ledger (1500), disposals removed');

select * from finish();
rollback;
