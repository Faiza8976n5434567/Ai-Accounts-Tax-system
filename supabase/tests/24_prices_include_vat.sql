-- D-54 · "Prices include VAT" (F-02). Worked example: the 19 shop invoices of the Phase 2 exit-test client
-- (anonymised, D-53) — customers paid AED 2,595.00 in total; VAT inside = 123.56 (per invoice, half-up),
-- net 2,471.44. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(9);

create temp table pi (k text primary key, id uuid) on commit drop;
grant all on pi to authenticated;
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'customer', 'Walk-in customer') returning id)
insert into pi select 'walkin', id from x;
create function tests.idoc(p_lines text[], p_extra jsonb default '{"prices_include_vat": true}') returns jsonb
language sql stable security definer as $$
  select jsonb_build_object('contact_id', (select id from pi where k = 'walkin'), 'issue_date', '2026-10-05', 'supply_emirate', 'DXB',
    'lines', (select jsonb_agg(jsonb_build_object('quantity', split_part(x, '|', 1), 'unit_price', split_part(x, '|', 2),
              'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'), 'tax_code', coalesce(nullif(split_part(x, '|', 3), ''), 'SR'),
              'description', 'Sales')) from unnest(p_lines) x)) || p_extra
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login('acct@test.local');
-- 1 · One invoice: the customer paid 60.00 → VAT 2.86, before VAT 57.14 (the shop wrote 57.00 + 3.00)
insert into pi values ('i60', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['1|6000'])));
select is((select (prices_include_vat, net_total, vat_total, gross_total)::text from public.sales_invoices where id = (select id from pi where k = 'i60')),
  '(t,5714,286,6000)', 'F-02 · paid 60.00 → VAT 60 × 5/105 = 2.857 → 2.86; before VAT 57.14; total stays 60.00');

-- 2 · The quarter: 19 invoices, one line each, totals as paid
insert into pi select 'q' || n, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['1|' || g]))
from unnest(array[6000, 4500, 10500, 7500, 30000, 15000, 19500, 12400, 16400, 10000, 7400, 16000, 17000, 20500, 20500, 10400, 7000, 17500, 11400]) with ordinality t(g, n);
select is((select (count(*), sum(gross_total), sum(vat_total), sum(net_total))::text from public.sales_invoices where id in (select id from pi where k like 'q%')),
  '(19,259500,12356,247144)', 'Exit-test quarter · paid 2,595.00 = before VAT 2,471.44 + VAT 123.56');

-- 3 · Rounding is per line: the same 60.00 split 15.00 + 45.00 gives 0.71 + 2.14 = 2.85
insert into pi values ('split', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['1|1500', '1|4500'])));
select is((select string_agg(net || '+' || vat, ', ' order by line_no) from public.sales_invoice_lines where sales_invoice_id = (select id from pi where k = 'split')),
  '1428+72, 4286+214', 'D-62: VAT on the total 60.00 → 2.86, spread by largest remainder → 0.72 + 2.14');

-- 4 · Quantity × price first, then F-02; zero-rated lines carry no VAT
insert into pi values ('qty', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['3|2500', '2|1000|ZR'])));
select is((select (net_total, vat_total, gross_total)::text from public.sales_invoices where id = (select id from pi where k = 'qty')),
  '(9143,357,9500)', '3 × 25.00 = 75.00 → VAT 3.57; 2 × 10.00 zero-rated → VAT 0');

-- 5 · USD: gross converted to AED first (F-24), then F-02
insert into pi values ('usd', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['1|1000'], '{"prices_include_vat": true, "currency": "USD"}')));
select is((select (gross_total_fcy, gross_total, vat_total, net_total)::text from public.sales_invoices where id = (select id from pi where k = 'usd')),
  '(1000,3673,175,3498)', 'USD 10.00 incl. VAT → AED 36.73 → VAT 1.75, before VAT 34.98');

-- 6 · Switch off = unchanged behaviour (F-01 on the net)
insert into pi values ('off', public.save_sales_invoice(null, (select id from fx where k = 'orgA'), tests.idoc(array['1|6000'], '{}')));
select is((select (prices_include_vat, net_total, vat_total, gross_total)::text from public.sales_invoices where id = (select id from pi where k = 'off')),
  '(f,6000,300,6300)', 'Without the switch: 60.00 is before VAT → VAT 3.00, total 63.00');

-- 7 · Posting: Dr Receivables 60.00 / Cr Income 57.14 / Cr VAT output 2.86
select public.submit_sales_invoice((select id from pi where k = 'i60'));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from pi where k = 'i60'));
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit || coalesce(' ' || l.tax_code || ' vat ' || l.vat_amount || ' ' || l.supply_emirate, ''), '; ' order by l.line_no)
           from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.sales_invoices where id = (select id from pi where k = 'i60'))),
  '1100 6000/0; 4010 0/5714 SR vat 286 DXB; 2100 0/286', 'Posted: Dr 1100 60.00 / Cr 4010 57.14 (SR, Dubai) / Cr 2100 2.86');

-- 8 · A credit note follows its invoice
select tests.login('acct@test.local');
insert into pi values ('cn', public.save_sales_invoice(null, (select id from fx where k = 'orgA'),
  tests.idoc(array['1|6000'], jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from pi where k = 'i60')))));
select is((select (prices_include_vat, net_total, vat_total)::text from public.sales_invoices where id = (select id from pi where k = 'cn')),
  '(t,5714,286)', 'The credit note inherits "prices include VAT" and reverses exactly 57.14 + 2.86');

-- 9 · Integrity still ties up (VAT on the invoice = VAT posted)
select tests.login('admin2@test.local');
insert into pi values ('ic', public.run_integrity_checks((select id from fx where k = 'orgA')));
select is((select string_agg(check_code || '=' || status, ' ') from public.integrity_results where run_id = (select id from pi where k = 'ic') and status = 'error'), null,
  'Integrity: no errors with VAT-inclusive invoices posted');

select * from finish();
rollback;
