-- Formula audit (Faizan, 2026-10-08): one realistic quarter with every kind of document, then the reports are
-- checked against each other with accounting identities. If any formula were wrong, an identity would break.
begin;
\ir fixtures/setup.psql
select plan(20);

create temp table au (k text primary key, id uuid) on commit drop;
grant all on au to authenticated;
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
values ((select id from fx where k = 'orgA'), 'vat', '2026-07-01', '2026-09-30', '2026-10-28');
do $$
declare v record;
begin
  for v in select * from (values ('c1', 'customer', 'Audit Buyer LLC', null, 'AE'), ('c2', 'customer', 'Audit Buyer Two LLC', null, 'AE'),
                                 ('cu', 'customer', 'Audit USD Inc', null, 'US'), ('su', 'supplier', 'Audit Supplier LLC', '100300400500003', 'AE'),
                                 ('nt', 'supplier', 'Audit No TRN', null, 'AE'), ('fo', 'supplier', 'Audit Overseas Ltd', null, 'GB')) x(k, kind, name, trn, cc) loop
    insert into au values (v.k, gen_random_uuid());
    insert into public.contacts (id, organization_id, kind, name, trn, country_code)
    values ((select id from au where k = v.k), (select id from fx where k = 'orgA'), v.kind::public.contact_kind, v.name, v.trn, v.cc);
  end loop;
end $$;

-- Lines 'qty|price|account|tax' ; prepared by the accountant, approved by the second Firm Admin
create function tests.sale(p_key text, p_contact text, p_date date, p_lines text[], p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into au values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from au where k = p_contact), 'issue_date', p_date,
    'lines', (select jsonb_agg(jsonb_build_object('quantity', split_part(x, '|', 1), 'unit_price', split_part(x, '|', 2)::bigint, 'description', 'Line',
              'account_id', tests.acct((select id from fx where k = 'orgA'), split_part(x, '|', 3)), 'tax_code', split_part(x, '|', 4))) from unnest(p_lines) x)) || p_extra));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from au where k = p_key));
end $$;
create function tests.bill(p_key text, p_contact text, p_date date, p_lines text[], p_extra jsonb default '{}', p_override text default null) returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into au values (p_key, public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from au where k = p_contact), 'supplier_invoice_no', p_key, 'bill_date', p_date,
    'lines', (select jsonb_agg(jsonb_build_object('quantity', split_part(x, '|', 1), 'unit_price', split_part(x, '|', 2)::bigint, 'description', 'Line',
              'account_id', tests.acct((select id from fx where k = 'orgA'), split_part(x, '|', 3)), 'tax_code', split_part(x, '|', 4))) from unnest(p_lines) x)) || p_extra));
  perform tests.login('admin2@test.local');
  perform public.post_purchase_bill((select id from au where k = p_key), p_override);
end $$;
create function tests.pay(p_key text, p_kind text, p_contact text, p_date date, p_amount bigint, p_charges bigint default 0, p_currency text default 'AED') returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into au values (p_key, public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', p_kind,
    'contact_id', (select id from au where k = p_contact), 'payment_date', p_date, 'amount', p_amount, 'bank_charges', p_charges, 'currency', p_currency,
    'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
  perform tests.login('admin2@test.local');
  perform public.post_payment((select id from au where k = p_key));
end $$;
-- GL movement (debit − credit) of an account code between two dates
create function tests.mv(p_code text, p_from date, p_to date) returns bigint language sql stable security definer as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  where j.status in ('posted', 'reversed') and j.entry_date between p_from and p_to and l.account_id = tests.acct((select id from fx where k = 'orgA'), p_code)
$$;
create function tests.box(p_box text, p_col text) returns bigint language sql stable security definer as $$
  select coalesce(sum(case when p_col = 'vat' then vat else amount end), 0)::bigint from app.vat201_base((select id from fx where k = 'orgA'), '2026-07-01', '2026-09-30')
  where box = any (string_to_array(p_box, ','))
$$;
grant execute on all functions in schema tests to authenticated;

-- ── The quarter ─────────────────────────────────────────────────────────────────────────
select tests.sale('s1', 'c1', '2026-07-05', array['1|1000000|4010|SR', '1|2000000|4000|ZR']);                     -- SR AUH + export
select tests.sale('s2', 'c2', '2026-07-06', array['1|3333|4010|SR', '1|3333|4010|SR', '1|3333|4010|SR', '1|800000|4300|EX'], '{"supply_emirate":"SHJ"}'); -- rounding 3×33.33, exempt
select tests.sale('s3', 'cu', '2026-07-07', array['1|100000|4010|SR'], '{"currency":"USD"}');                         -- USD 1,000
select tests.sale('cn', 'c1', '2026-08-02', array['1|200000|4010|SR'], jsonb_build_object('doc_type', 'credit_note', 'original_invoice_id', (select id from au where k = 's1')));
select tests.bill('b1', 'su', '2026-07-13', array['1|2500000|6130|SR', '1|380000|6140|BLK']);                       -- recoverable + blocked
select tests.bill('b2', 'nt', '2026-07-14', array['1|100000|6180|SR']);                                               -- no TRN → not recovered
select tests.bill('b3', 'nt', '2026-07-15', array['1|200000|6180|SR'], '{}', 'TRN confirmed with the FTA');           -- override → recovered
select tests.bill('b4', 'fo', '2026-07-16', array['1|600000|6130|RCS', '1|1000000|5000|IMG']);                      -- reverse charge + imported goods
select tests.bill('dn', 'su', '2026-08-03', array['1|500000|6130|SR'], jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from au where k = 'b1')));
select tests.pay('r1', 'customer_receipt', 'c1', '2026-07-20', 1000000, 5000);                                      -- part payment with bank charges
select tests.pay('r2', 'customer_receipt', 'c2', '2026-07-21', 900000);                                             -- overpayment → credit
select tests.sale('s4', 'c2', '2026-08-10', array['1|50000|4010|SR']);                                              -- credit applied automatically
select tests.pay('rf', 'customer_refund', 'c2', '2026-08-12', 10000);                                               -- refund part of the credit
select tests.pay('r3', 'customer_receipt', 'cu', '2026-07-25', 105000, 0, 'USD');                                   -- USD settled exactly
select tests.pay('p1', 'supplier_payment', 'su', '2026-08-15', 3000000);                                            -- pays bills, leaves an advance
-- a manual journal and its reversal
select tests.login('acct@test.local');
insert into au values ('jv', gen_random_uuid());
insert into public.journals (id, organization_id, entry_date, memo) values ((select id from au where k = 'jv'), (select id from fx where k = 'orgA'), '2026-08-31', 'Rent accrual');
insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
  ((select id from au where k = 'jv'), (select id from fx where k = 'orgA'), 1, tests.acct((select id from fx where k = 'orgA'), '6100'), 1200000, 0),
  ((select id from au where k = 'jv'), (select id from fx where k = 'orgA'), 2, tests.acct((select id from fx where k = 'orgA'), '2010'), 0, 1200000);
select tests.login('admin2@test.local');
select public.post_journal((select id from au where k = 'jv'));
insert into au values ('rev', public.reverse_journal((select id from au where k = 'jv'), 'Booked twice', '2026-09-01'));
select tests.login('super@test.local');
select public.post_journal((select id from au where k = 'rev'));
select tests.login('admin2@test.local');

reset role;
select set_config('request.jwt.claims', '', true);

-- ── Identities ──────────────────────────────────────────────────────────────────────────
select is((select sum(debit) - sum(credit) from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')), 0::numeric,
  'Trial balance: debits = credits for the year');
select is((select sum(amount) filter (where section = 'assets') - sum(amount) filter (where section <> 'assets')
           from public.balance_sheet((select id from fx where k = 'orgA'), '2026-12-31')), 0::numeric, 'Balance sheet: assets = liabilities + equity');
select is((select sum(case when type = 'revenue' then amount else -amount end) from public.profit_and_loss((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')),
  (select amount from public.balance_sheet((select id from fx where k = 'orgA'), '2026-12-31') where row_kind = 'current_year_result')::numeric,
  'P&L net result = the balance sheet''s profit for the year');
select is((select sum(case when type = 'revenue' then amount else -amount end) from public.profit_and_loss((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')),
  (select -sum(closing) from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31') where type in ('revenue', 'expense'))::numeric,
  'P&L net result = income and expense balances of the trial balance');
select is((select closing from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31') where code = '6100'), 100000::bigint,
  'The reversed 12,000 rent accrual nets to zero — only the fixture''s 1,000 January rent remains in 6100');

-- VAT 201 ↔ ledger (the basis of the P3-03 reconciliation)
select is(tests.box('1a,1b,1c,1d,1e,1f,1g', 'vat'), -tests.mv('2100', '2026-07-01', '2026-09-30'), 'Output VAT in boxes 1a–1g = movement on 2100 VAT output');
select is(tests.box('9', 'vat'), tests.mv('1300', '2026-07-01', '2026-09-30'), 'Recoverable VAT in box 9 = movement on 1300 VAT input');
select is(tests.box('3,6', 'vat'), -tests.mv('2110', '2026-07-01', '2026-09-30'), 'Reverse-charge VAT in boxes 3 + 6 = movement on 2110');
select is(tests.box('10', 'vat'), tests.mv('1310', '2026-07-01', '2026-09-30'), 'Box 10 = movement on 1310 reverse-charge input');
select is(tests.box('1a,1b,1c,1d,1e,1f,1g,4,5', 'amount'),
  -(tests.mv('4000', '2026-07-01', '2026-09-30') + tests.mv('4010', '2026-07-01', '2026-09-30') + tests.mv('4300', '2026-07-01', '2026-09-30')),
  'Sales boxes (1a–1g, 4, 5) = net sales on the income accounts');
select is(tests.box('1a', 'amount') || '/' || tests.box('1a', 'vat') || ' · ' || tests.box('1c', 'amount') || '/' || tests.box('1c', 'vat'), '1217250/60863 · 9999/500',
  'Worked figures: 1a = 10,000 − 2,000 + USD 1,000 × 3.6725 + 500 = 12,172.50 / VAT 608.63; Sharjah 3 × 33.33 = 99.99 / VAT 5.00 (D-62, on the total)');
select is((select sum(vat) from app.vat201_boxes((select id from fx where k = 'orgA'), '2026-07-01', '2026-09-30', null) where box_code = '14'),
  (select sum(vat) filter (where box_code = '12') - sum(vat) filter (where box_code = '13')
   from app.vat201_boxes((select id from fx where k = 'orgA'), '2026-07-01', '2026-09-30', null))::numeric, 'Box 14 = box 12 − box 13');
select is((select vat from app.vat201_boxes((select id from fx where k = 'orgA'), '2026-07-01', '2026-09-30', null) where box_code = '12'),
  -(tests.mv('2100', '2026-07-01', '2026-09-30') + tests.mv('2110', '2026-07-01', '2026-09-30')),
  'Box 12 (due tax) = movement on 2100 + 2110');
select is((select vat from app.vat201_boxes((select id from fx where k = 'orgA'), '2026-07-01', '2026-09-30', null) where box_code = '13'),
  tests.mv('1300', '2026-07-01', '2026-09-30') + tests.mv('1310', '2026-07-01', '2026-09-30'), 'Box 13 (recoverable tax) = movement on 1300 + 1310');

-- Sub-ledgers ↔ control accounts, statements
select is((select coalesce(sum(open_aed), 0) from public.ageing((select id from fx where k = 'orgA'), 'customer', '2026-12-31')), tests.mv('1100', '2000-01-01', '2026-12-31')::numeric,
  'Customer ageing = GL 1100 Trade receivables');
select is((select coalesce(sum(open_aed), 0) from public.ageing((select id from fx where k = 'orgA'), 'supplier', '2026-12-31')), (-tests.mv('2000', '2000-01-01', '2026-12-31'))::numeric,
  'Supplier ageing = GL 2000 Trade payables');
select is(app.credits_total((select id from fx where k = 'orgA'), 'customer_receipt'), -tests.mv('2150', '2000-01-01', '2026-12-31'), 'Unused customer credits = GL 2150');
select is(app.credits_total((select id from fx where k = 'orgA'), 'supplier_payment'), tests.mv('1160', '2000-01-01', '2026-12-31'), 'Unused supplier advances = GL 1160');
select is((select balance from public.contact_statement((select id from fx where k = 'orgA'), (select id from au where k = 'c2'), 'customer', '2027-01-01', '2027-01-01') where row_kind = 'opening'),
  (select coalesce(sum(open_aed), 0) from public.ageing((select id from fx where k = 'orgA'), 'customer', '2026-12-31') where contact_id = (select id from au where k = 'c2'))::bigint
    - coalesce((select sum(c.left_aed) from public.payments p, lateral app.credit_left(p.id) c where p.contact_id = (select id from au where k = 'c2')), 0)::bigint,
  'A customer''s statement balance = their open invoices − their unused credit');
select tests.login('admin2@test.local');
insert into au values ('ic', public.run_integrity_checks((select id from fx where k = 'orgA')));
select is((select status::text from public.integrity_runs where id = (select id from au where k = 'ic')), 'ok',
  'The integrity checks agree: everything ties up');

select * from finish();
rollback;
