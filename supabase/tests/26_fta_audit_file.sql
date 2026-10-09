-- P3-03 · FTA VAT Audit File data (FAF, FTA Appendix 5) and D-57. October 2026, client A. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(9);

create temp table fa (k text primary key, id uuid) on commit drop;
grant all on fa to authenticated;
do $$
declare v record;
begin
  for v in select * from (values ('cust', 'customer', 'Local Buyer LLC', '100111222300003', 'AE'), ('exp', 'customer', 'Export Buyer Ltd', null, 'GB'),
                                 ('sup', 'supplier', 'Registered Supplier LLC', '100300400500003', 'AE'), ('foreign', 'supplier', 'Overseas Ltd', null, 'GB')) x(k, kind, name, trn, cc) loop
    insert into fa values (v.k, gen_random_uuid());
    insert into public.contacts (id, organization_id, kind, name, trn, country_code)
    values ((select id from fa where k = v.k), (select id from fx where k = 'orgA'), v.kind::public.contact_kind, v.name, v.trn, v.cc);
  end loop;
end $$;
create function tests.fsale(p_key text, p_contact text, p_date date, p_price bigint, p_code text, p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into fa values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from fa where k = p_contact), 'issue_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_price, 'tax_code', p_code, 'description', 'Supply, with comma',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010')))) || p_extra));
  perform public.submit_sales_invoice((select id from fa where k = p_key));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from fa where k = p_key));
end $$;
create function tests.fbill(p_key text, p_contact text, p_date date, p_net bigint, p_code text, p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into fa values (p_key, public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from fa where k = p_contact), 'supplier_invoice_no', upper(p_key), 'bill_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', p_code, 'description', 'Purchase',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '6180')))) || p_extra));
  perform tests.login('admin2@test.local');
  perform public.post_purchase_bill((select id from fa where k = p_key));
end $$;
grant execute on all functions in schema tests to authenticated;

select tests.fsale('inv1', 'cust', '2026-10-05', 100000, 'SR');                        -- 1,000.00 + 50.00
select tests.fsale('inv2', 'exp', '2026-10-06', 200000, 'ZR');                         -- export 2,000.00
select tests.fsale('inv3', 'cust', '2026-10-07', 30000, 'OS');                         -- out of scope 300.00
select tests.fsale('usd', 'cust', '2026-10-08', 10000, 'SR', '{"currency": "USD"}');   -- USD 100.00 → AED 367.25 + 18.36
select tests.fsale('cn1', 'cust', '2026-10-09', 20000, 'SR', jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from fa where k = 'inv1')));
select tests.fbill('b1', 'sup', '2026-10-10', 40000, 'SR');                             -- 400.00 + 20.00
select tests.fbill('b2', 'foreign', '2026-10-11', 10000, 'RCS');                        -- reverse charge 100.00 / 5.00
select tests.fbill('b3', 'sup', '2026-10-12', 50000, 'BLK');                            -- blocked 500.00 / 25.00
select tests.fbill('dn1', 'sup', '2026-10-13', 10000, 'SR', jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from fa where k = 'b1')));
select tests.fsale('nov', 'cust', '2026-11-02', 50000, 'SR');                           -- outside the period

select tests.login('admin2@test.local');
create temp table faf on commit drop as select public.faf_data((select id from fx where k = 'orgA'), '2026-10-01', '2026-10-31') d;
grant all on faf to authenticated;

select is((select string_agg((x ->> 'tax_code') || ' ' || (x ->> 'value') || '/' || (x ->> 'vat') || coalesce(' ' || nullif(x ->> 'country', ''), '')
                             || case when x ->> 'currency' <> 'AED' then ' ' || (x ->> 'currency') || ' ' || (x ->> 'value_fcy') || '/' || (x ->> 'vat_fcy') else '' end, '; ')
           from faf, jsonb_array_elements(d -> 'supplies') x),
  'SR 100000/5000; ZR 200000/0 GB; OS 30000/0; SR 36725/1836 USD 10000/500; SR -20000/-1000',
  'Supply listing: every posted line in date order; export shows the country; USD with FCY; credit note negative (D-57); November left out');
select is((select string_agg((x ->> 'tax_code') || ' ' || (x ->> 'value') || '/' || (x ->> 'vat'), '; ') from faf, jsonb_array_elements(d -> 'purchases') x),
  'SR 40000/2000; RC 10000/500; SR 50000/2500; SR -10000/-500',
  'Purchase listing in FTA codes: RCS → RC, BLK → SR with the invoice VAT, debit note negative (D-57)');
select is((select (sum((x ->> 'value')::bigint), sum((x ->> 'vat')::bigint))::text from faf, jsonb_array_elements(d -> 'supplies') x
           where x ->> 'tax_code' <> 'OS'),
  (select (sum(net_total * case when doc_type = 'credit_note' then -1 else 1 end) - 30000,
           sum(vat_total * case when doc_type = 'credit_note' then -1 else 1 end))::text
   from public.sales_invoices where organization_id = (select id from fx where k = 'orgA') and status = 'posted' and issue_date between '2026-10-01' and '2026-10-31'),
  'Supply totals (without OS) equal the posted invoices less credit notes');
select is((select x ->> 'trn' from faf, jsonb_array_elements(d -> 'purchases') x where x ->> 'tax_code' = 'RC'), '',
  'A foreign supplier has no TRN (empty, not null)');
select is((select (sum((x ->> 'debit')::bigint) = sum((x ->> 'credit')::bigint)) from faf, jsonb_array_elements(d -> 'ledger') x), true,
  'General ledger table: total debits = total credits');
select is((select string_agg(distinct x ->> 'source_type', ', ') from faf, jsonb_array_elements(d -> 'ledger') x),
  'AP, AP - Cancel, AR, AR - Cancel', 'Source types as the FTA names them (AR / AR - Cancel / AP / AP - Cancel)');
select is((select (x ->> 'balance')::bigint from faf, jsonb_array_elements(d -> 'ledger') x where x ->> 'account_code' = '1100'
           order by x ->> 'date' desc, x ->> 'transaction_id' desc limit 1),
  (select closing from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-10-31') where code = '1100'),
  'The running balance of an account ends at its trial-balance closing (opening balance included)');
select is((select d -> 'company' ->> 'product' from faf), 'TFS+ Smart Ledger', 'Product name read from platform settings (never hard-coded)');
select tests.login('badmin@test.local');
select throws_like($$ select public.faf_data((select id from fx where k = 'orgA'), '2026-10-01', '2026-10-31') $$, 'You are not allowed%',
  'Another firm cannot export client A''s audit file');

select * from finish();
rollback;
