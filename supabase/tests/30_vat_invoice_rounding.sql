-- D-62 · VAT on sales documents is rounded once per tax code on the total and spread over the lines (largest remainder),
-- so e-invoices meet the FTA rule ALIGNED-IBRP-S-09 (taxable × rate within 0.02). Client A. Amounts in fils / cents.
begin;
\ir fixtures/setup.psql
select plan(6);

create temp table vr (k text primary key, id uuid) on commit drop;
grant all on vr to authenticated;
insert into vr values ('cust', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name) values ((select id from vr where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Rounding Buyer LLC');
create function tests.rinv(p_key text, p_lines jsonb, p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into vr values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from vr where k = 'cust'), 'issue_date', '2026-10-05',
    'lines', (select jsonb_agg(x || jsonb_build_object('description', 'Item', 'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))) from jsonb_array_elements(p_lines) x)) || p_extra));
end $$;
grant execute on all functions in schema tests to authenticated;
select tests.login('acct@test.local');

-- 1 · Ten lines of 0.10: line rounding would give 0.10; on the total 1.00 × 5% = 0.05
select tests.rinv('ten', (select jsonb_agg(jsonb_build_object('quantity', 1, 'unit_price', 10, 'tax_code', 'SR')) from generate_series(1, 10)));
select is((select (vat_total, string_agg(l.vat::text, ',' order by l.line_no))::text from public.sales_invoices i join public.sales_invoice_lines l on l.sales_invoice_id = i.id
           where i.id = (select id from vr where k = 'ten') group by i.vat_total), '(5,"1,1,1,1,1,0,0,0,0,0")',
  'D-62 · ten lines of 0.10 → VAT 0.05 on the total (meets ALIGNED-IBRP-S-09), spread one fil each to the first five');

-- 2 · Mixed tax codes are rounded per code; zero-rated lines carry no VAT
select tests.rinv('mix', '[{"quantity": 1, "unit_price": 3333, "tax_code": "SR"}, {"quantity": 1, "unit_price": 3333, "tax_code": "SR"},
                          {"quantity": 1, "unit_price": 5000, "tax_code": "ZR"}, {"quantity": 1, "unit_price": 3333, "tax_code": "SR"}]');
select is((select string_agg(l.tax_code || ' ' || l.vat, ', ' order by l.line_no) from public.sales_invoice_lines l where l.sales_invoice_id = (select id from vr where k = 'mix')),
  'SR 167, SR 167, ZR 0, SR 166', 'Standard-rated lines: 99.99 × 5% = 5.00 spread 1.67 + 1.67 + 1.66; zero-rated 0');

-- 3 · Prices including VAT: VAT inside the total, net = gross − VAT per line, lines add up to the paid amount
select tests.rinv('incl', '[{"quantity": 1, "unit_price": 1500, "tax_code": "SR"}, {"quantity": 1, "unit_price": 4500, "tax_code": "SR"}, {"quantity": 1, "unit_price": 1050, "tax_code": "SR"}]',
  '{"prices_include_vat": true}');
select is((select (gross_total, vat_total, net_total)::text from public.sales_invoices where id = (select id from vr where k = 'incl')), '(7050,336,6714)',
  'Paid 70.50 → VAT 70.50 × 5/105 = 3.357 → 3.36 once; net 67.14');
select is((select sum(net + vat) from public.sales_invoice_lines where sales_invoice_id = (select id from vr where k = 'incl')), 7050::numeric,
  'Each line''s net + VAT still adds up to what the customer paid');

-- 4 · USD: rounded once in USD and once in AED
select tests.rinv('usd', '[{"quantity": 1, "unit_price": 3333, "tax_code": "SR"}, {"quantity": 1, "unit_price": 3333, "tax_code": "SR"}, {"quantity": 1, "unit_price": 3333, "tax_code": "SR"}]',
  '{"currency": "USD"}');
select is((select (gross_total_fcy - (select sum(net_fcy) from public.sales_invoice_lines where sales_invoice_id = i.id), vat_total, net_total)::text
           from public.sales_invoices i where id = (select id from vr where k = 'usd')),
  '(500,1836,36720)', 'USD 99.99 → VAT USD 5.00; AED 3 × 122.40 = 367.20 → VAT AED 18.36, each rounded once');

-- 5 · Posting still balances and the VAT return agrees with the ledger
select tests.login('acct@test.local');
select public.submit_sales_invoice((select id from vr where k = 'ten'));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from vr where k = 'ten'));
select is((select sum(debit) = sum(credit) and sum(credit) filter (where a.code = '2100') = 5 from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.sales_invoices where id = (select id from vr where k = 'ten'))), true,
  'The posted journal balances and credits VAT output 0.05');

select * from finish();
rollback;
