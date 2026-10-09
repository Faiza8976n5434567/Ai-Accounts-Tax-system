-- VAT-17 · D-58 · advances for a specific supply (Decree-Law Art 25–26): VAT on receipt (F-02), taken back when the
-- advance is applied to the invoice or refunded; boxes, drill-down, reconciliation and integrity agree. Client A
-- (head office Abu Dhabi), quarters Oct–Dec 2026 and Jan–Mar 2027. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(16);

create temp table va (k text primary key, id uuid) on commit drop;
grant all on va to authenticated;
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values
  ((select id from fx where k = 'orgA'), 'vat', '2026-10-01', '2026-12-31', '2027-01-28'),
  ((select id from fx where k = 'orgA'), 'vat', '2027-01-01', '2027-03-31', '2027-04-28');
insert into va select 'q4', id from public.tax_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-10-01';
insert into va select 'q1', id from public.tax_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2027-01-01';
insert into va values ('cust', gen_random_uuid()), ('cust2', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, emirate_code) values
  ((select id from va where k = 'cust'), (select id from fx where k = 'orgA'), 'customer', 'Event Client LLC', 'DXB'),
  ((select id from va where k = 'cust2'), (select id from fx where k = 'orgA'), 'customer', 'Second Client LLC', 'DXB');

-- A receipt (or refund) prepared by the accountant, approved by the second Firm Admin.
create function tests.pay(p_key text, p_kind text, p_contact text, p_date date, p_amount bigint, p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into va values (p_key, public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'kind', p_kind, 'contact_id', (select id from va where k = p_contact), 'payment_date', p_date, 'amount', p_amount,
    'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010')) || p_extra));
  perform tests.login('admin2@test.local');
  perform public.post_payment((select id from va where k = p_key));
end $$;
create function tests.inv(p_key text, p_contact text, p_date date, p_net bigint) returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into va values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from va where k = p_contact), 'issue_date', p_date, 'supply_emirate', 'DXB',
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Event services',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
  perform public.submit_sales_invoice((select id from va where k = p_key));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from va where k = p_key));
end $$;
create function tests.vboxes(p_period text, p_codes text[]) returns text language sql as $$
  select string_agg((b ->> 'box_code') || ' ' || (b ->> 'amount') || '/' || (b ->> 'vat'), '; ' order by (b ->> 'sort')::int)
  from jsonb_array_elements(public.vat_return_preview((select id from va where k = p_period)) -> 'boxes') b
  where b ->> 'box_code' = any (p_codes)
$$;
create function tests.gl(p_code text) returns bigint language sql stable security definer as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  where j.status in ('posted', 'reversed') and l.account_id = tests.acct((select id from fx where k = 'orgA'), p_code)
$$;
grant execute on all functions in schema tests to authenticated;

-- 1 · Validation
select tests.login('acct@test.local');
select throws_like($$ select public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'supplier_payment',
  'contact_id', (select id from va where k = 'cust'), 'payment_date', '2026-10-10', 'amount', 100, 'vat_advance', true,
  'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))) $$, '%Only a customer receipt can be an advance%',
  'Only a customer receipt can be an advance for a specific supply');

-- 2 · Advance of 10,500 for an event in Dubai → VAT 500 declared in Q4 (VAT-17)
select tests.pay('adv1', 'customer_receipt', 'cust', '2026-10-10', 1050000, '{"vat_advance": true, "advance_emirate": "DXB"}');
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit || coalesce(' ' || l.tax_code || ' vat ' || l.vat_amount || ' ' || l.supply_emirate, ''), '; ' order by l.line_no)
           from public.journal_lines l join public.accounts a on a.id = l.account_id
           where l.journal_id = (select journal_id from public.payments where id = (select id from va where k = 'adv1'))),
  '1010 1050000/0; 2150 0/1000000 SR vat 50000 DXB; 2150 0/50000; 1170 50000/0; 2100 0/50000',
  'VAT-17 · Dr Bank 10,500 / Cr Customer credits 10,500 (tagged 10,000 + VAT 500, Dubai); Dr 1170 500 / Cr VAT output 500');
select is(tests.vboxes('q4', array['1b']), '1b 1000000/50000', 'VAT-17 · the advance is in box 1b of the quarter it was received');

-- 3 · A plain receipt (not ticked) is unchanged: customer credit, no VAT (D-11)
select tests.pay('plain', 'customer_receipt', 'cust2', '2026-10-11', 30000);
select is(tests.vboxes('q4', array['1b']), '1b 1000000/50000', 'A plain overpayment still changes no box (VAT-16)');

-- 4 · Invoice in January: full VAT on the invoice, advance VAT taken back → Q1 box nets to zero
select tests.inv('inv1', 'cust', '2027-01-15', 1000000);
select is((select (gross_total, vat_total)::text from public.sales_invoices where id = (select id from va where k = 'inv1')), '(1050000,50000)',
  'D-58 · the tax invoice shows its full value and VAT');
select is(tests.vboxes('q1', array['1b']), '1b 0/0', 'D-58 · in Q1 the invoice (10,000 / 500) and the advance taken back (−10,000 / −500) net to zero — VAT counted once');
select is(tests.gl('1100') || ' · 2150 ' || tests.gl('2150') || ' · 1170 ' || tests.gl('1170'), '0 · 2150 -30000 · 1170 0',
  'The invoice is settled by the advance; only the plain credit of 300 remains; 1170 is back to zero');

-- 5 · Partly used, then refunded: VAT taken back pro rata, then the rest on refund
select tests.pay('adv2', 'customer_receipt', 'cust2', '2026-11-01', 210000, '{"vat_advance": true}');      -- head office emirate (Abu Dhabi)
select tests.inv('inv2', 'cust2', '2026-11-20', 100000);                                                     -- 1,050 incl. VAT (Dubai)
select is((select advance_vat from public.payment_allocations where sales_invoice_id = (select id from va where k = 'inv2') and payment_id = (select id from va where k = 'adv2')),
  3571::bigint, 'The older plain credit (300) is used first (D-11); 750 of the 2,100 advance → VAT 35.71 of its 100 taken back');
select tests.pay('ref2', 'customer_refund', 'cust2', '2026-12-05', 135000);                                 -- what is left of the advance: 1,350
select is((select sum(advance_vat) from public.payment_allocations where refund_id = (select id from va where k = 'ref2')), 6429::numeric,
  'D-58 · the refund of the advance''s last 1,350 takes back the remaining VAT 64.29 (35.71 + 64.29 = 100)');
select is(tests.vboxes('q4', array['1a', '1b']), '1a 0/0; 1b 1100000/55000',
  'Q4: advance 1 (10,000 / 500) + the Dubai supply (1,000 / 50); the Abu Dhabi advance netted out by its application and refund');
select is(tests.gl('1170'), 0::bigint, '1170 is zero once every advance is used or refunded');

-- 6 · A mistaken advance reversed (D-40): its VAT leaves the box in the reversal's period
select tests.pay('adv3', 'customer_receipt', 'cust2', '2026-12-10', 105000, '{"vat_advance": true, "advance_emirate": "DXB"}');
select tests.login('admin2@test.local');
insert into va values ('rev3', public.reverse_journal((select journal_id from public.payments where id = (select id from va where k = 'adv3')), 'Posted to the wrong customer', '2026-12-11'));
select tests.login('super@test.local');
select public.post_journal((select id from va where k = 'rev3'));
select is(tests.vboxes('q4', array['1b']), '1b 1100000/55000', 'D-40 · the reversed advance (1,000 / 50) leaves box 1b');

-- 7 · Drill-down, reconciliation, integrity
select tests.login('admin2@test.local');
select is((select count(*) from public.vat_box_lines((select id from va where k = 'q4'), '1b') where source = 'receipt'), 3::bigint,
  'Drill-down: box 1b lists advance 1, advance 3 and its reversal');
select is((select string_agg((x ->> 'return') || '=' || (x ->> 'ledger'), ' ') from jsonb_array_elements(public.vat_reconciliation((select id from va where k = 'q4')) -> 'rows') x
           where x ->> 'account' = '2100'), '55000=55000', 'Reconciliation: output VAT in the return = VAT output account (2100)');
select is((select jsonb_array_length(public.vat_reconciliation((select id from va where k = 'q4')) -> 'other_postings')), 0,
  'Advance VAT is not listed as an unexplained posting');
insert into va values ('ic', public.run_integrity_checks((select id from fx where k = 'orgA')));
select is((select check_code || '=' || status from public.integrity_results where run_id = (select id from va where k = 'ic') and check_code = 'advance_vat'),
  'advance_vat=ok', 'Integrity: 1170 = VAT on advances not yet used');

select * from finish();
rollback;
