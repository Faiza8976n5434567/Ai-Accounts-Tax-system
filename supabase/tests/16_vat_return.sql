-- VAT 201 return and workflow (P3-01, P3-02). PLAN §6: VAT-01→08, VAT-10, VAT-11, VAT-13, VAT-16, VAT-18 · D-12, D-42 → D-44.
-- Quarter Oct–Dec 2026 for client A (head office Abu Dhabi). Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(25);

create temp table vr (k text primary key, id uuid) on commit drop;
grant all on vr to authenticated;
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values
  ((select id from fx where k = 'orgA'), 'vat', '2026-10-01', '2026-12-31', '2027-01-28'),
  ((select id from fx where k = 'orgA'), 'vat', '2027-01-01', '2027-03-31', '2027-04-28');
insert into vr select 'q4', id from public.tax_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-10-01';
insert into vr select 'q1', id from public.tax_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2027-01-01';
do $$
declare v record;
begin
  for v in select * from (values ('cust', 'customer', 'VAT Buyer LLC', null, 'AE'), ('sup', 'supplier', 'Registered Supplier LLC', '100300400500003', 'AE'),
                                 ('notrn', 'supplier', 'No TRN Shop', null, 'AE'), ('foreign', 'supplier', 'Overseas Ltd', null, 'GB')) x(k, kind, name, trn, cc) loop
    insert into vr values (v.k, gen_random_uuid());
    insert into public.contacts (id, organization_id, kind, name, trn, country_code)
    values ((select id from vr where k = v.k), (select id from fx where k = 'orgA'), v.kind::public.contact_kind, v.name, v.trn, v.cc);
  end loop;
end $$;

-- Sales document prepared by the accountant, approved by the second Firm Admin.
create function tests.sale(p_key text, p_date date, p_net bigint, p_code text, p_emirate text default null, p_credit_for text default null) returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into vr values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_strip_nulls(jsonb_build_object(
    'doc_type', case when p_credit_for is null then 'invoice' else 'credit_note' end, 'original_invoice_id', (select id from vr where k = p_credit_for),
    'contact_id', (select id from vr where k = 'cust'), 'issue_date', p_date, 'supply_emirate', p_emirate,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', p_code, 'description', 'Supply',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010')))))));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from vr where k = p_key));
end $$;
create function tests.bill(p_key text, p_contact text, p_date date, p_net bigint, p_code text, p_account text default '6130') returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into vr values (p_key, public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from vr where k = p_contact), 'supplier_invoice_no', p_key, 'bill_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', p_code, 'description', 'Purchase',
             'account_id', tests.acct((select id from fx where k = 'orgA'), p_account))))));
  perform tests.login('admin2@test.local');
  perform public.post_purchase_bill((select id from vr where k = p_key));
end $$;
-- 'box amount/vat/adjustment' for the boxes asked, from what the screen shows.
create function tests.boxes(p_period text, p_codes text[]) returns text language sql as $$
  select string_agg((b ->> 'box_code') || ' ' || (b ->> 'amount') || '/' || (b ->> 'vat') || '/' || (b ->> 'adjustment'), '; ' order by (b ->> 'sort')::int)
  from jsonb_array_elements(public.vat_return_preview((select id from vr where k = p_period)) -> 'boxes') b
  where b ->> 'box_code' = any (p_codes)
$$;
grant execute on all functions in schema tests to authenticated;

select tests.sale('inv1', '2026-10-05', 1000000, 'SR');                -- VAT-01 / VAT-02b: head office Abu Dhabi → 1a
select tests.sale('inv2', '2026-10-06', 1000000, 'SR', 'DXB');         -- VAT-02: Dubai chosen → 1b
select tests.sale('inv3', '2026-10-07', 2000000, 'ZR');                -- VAT-03: zero-rated export → 4
select tests.sale('inv4', '2026-10-08', 800000, 'EX');                 -- VAT-04: exempt → 5
select tests.sale('cn1', '2026-11-02', 200000, 'SR', null, 'inv1');    -- VAT-10: credit note 2,000 → 1a 8,000 / 400
select tests.bill('b-rcs', 'foreign', '2026-10-09', 600000, 'RCS');    -- VAT-05: imported service → 3 and 10
select tests.bill('b-img', 'foreign', '2026-10-12', 1000000, 'IMG');   -- D-42: imported goods → 6 and 10
select tests.bill('b-sr', 'sup', '2026-10-13', 2500000, 'SR');         -- VAT-06: → 9
select tests.bill('b-blk', 'sup', '2026-10-14', 380000, 'BLK', '6140');-- VAT-07: blocked → not in 9
select tests.bill('b-notrn', 'notrn', '2026-10-15', 100000, 'SR', '6180'); -- VAT-08: no TRN → not recovered, not in 9

select tests.login('acct@test.local');
select is(tests.boxes('q4', array['1a', '1b', '1c', '4', '5']), '1a 800000/40000/0; 1b 1000000/50000/0; 1c 0/0/0; 4 2000000/0/0; 5 800000/0/0',
  'VAT-01/02/02b/03/04/10 · 1a 8,000/400 after the credit note, 1b Dubai 10,000/500, zero-rated 20,000, exempt 8,000');
select is(tests.boxes('q4', array['3', '6', '9', '10']), '3 600000/30000/0; 6 1000000/50000/0; 9 2500000/125000/0; 10 1600000/80000/0',
  'VAT-05/06/07/08, D-42 · reverse charge 6,000/300 in 3 and 10, imported goods 10,000/500 in 6 and 10, box 9 only the recoverable 25,000/1,250');
select is(tests.boxes('q4', array['8', '11', '12', '13', '14']), '8 6200000/170000/0; 11 4100000/205000/0; 12 0/170000/0; 13 0/205000/0; 14 0/-35000/0',
  'VAT-11 · totals: due 1,700, recoverable 2,050, box 14 = -350 (refundable)');
select is((select string_agg(code || ' ' || debit || '/' || credit, '; ' order by line_no) from (
  select a.code, l.debit, l.credit, l.line_no from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = (select journal_id from public.purchase_bills where id = (select id from vr where k = 'b-img'))) x),
  '6130 1000000/0; 1310 50000/0; 2110 0/50000; 2000 0/1000000', 'D-42 · an import-of-goods bill self-assesses VAT like reverse charge: supplier owed 10,000');
select is(jsonb_array_length(public.vat_return_preview((select id from vr where k = 'q4')) -> 'boxes'), 20, 'D-12 · all 20 boxes are always there');
select is(tests.boxes('q4', array['1c', '1d', '1e', '1f', '1g', '2', '7']), '1c 0/0/0; 1d 0/0/0; 1e 0/0/0; 1f 0/0/0; 1g 0/0/0; 2 0/0/0; 7 0/0/0',
  'VAT-18 · unused boxes are 0/0/0, never missing');

-- VAT-16 · an overpayment received on account touches no VAT box
insert into vr values ('rcpt', public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from vr where k = 'cust'), 'payment_date', '2026-10-20', 'amount', 5000000, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select tests.login('admin2@test.local');
select public.post_payment((select id from vr where k = 'rcpt'));
select tests.login('acct@test.local');
select is(tests.boxes('q4', array['8', '14']), '8 6200000/170000/0; 14 0/-35000/0', 'VAT-16 · the receipt (incl. its customer credit) changes no box');

-- D-43 · manual adjustments only where allowed, always with a reason
insert into vr values ('ret', public.start_vat_return((select id from vr where k = 'q4')));
select throws_like($$ select public.add_vat_adjustment((select id from vr where k = 'ret'), '4', 0, 0, 1000, 'x') $$, '%calculated from the books only%',
  'D-43 · box 4 cannot be adjusted by hand');
select throws_like($$ select public.add_vat_adjustment((select id from vr where k = 'ret'), '1a', 0, 0, -10000, '  ') $$, '%reason is required%',
  'D-43 · an adjustment needs a reason');
select public.add_vat_adjustment((select id from vr where k = 'ret'), '1a', 0, 0, -10000, 'Bad debt relief — invoice INV-2026-04-0007', 'FDL 8/2017 Art 64');
select is(tests.boxes('q4', array['1a', '8', '12', '14']), '1a 800000/40000/-10000; 8 6200000/170000/-10000; 12 0/160000/0; 14 0/-45000/0',
  'D-43 · the -100 adjustment flows into the box 8 adjustment column and boxes 12 and 14');

-- P3-02 · review, maker-checker, approval and frozen snapshot
select public.submit_vat_return((select id from vr where k = 'ret'));
select throws_like($$ select public.approve_vat_return((select id from vr where k = 'ret')) $$, 'You are not allowed%', 'An accountant cannot approve a VAT return');
select tests.login('admin2@test.local');
select ok(public.approve_vat_return((select id from vr where k = 'ret')) ~ '^[0-9a-f]{64}$', 'Approved by the second Firm Admin; the snapshot gets a SHA-256');
select is((select (status, (select count(*) from public.vat_return_boxes b where b.vat_return_id = r.id), snapshot ->> 'config_version', snapshot -> 'adjustments' -> 0 ->> 'reason')::text
           from public.vat_returns r where id = (select id from vr where k = 'ret')),
  '(approved,20,uae-2026.09,"Bad debt relief — invoice INV-2026-04-0007")', 'Every box written (D-12), tax-rule version and the adjustment reason recorded');
select is((select string_agg(to_char(start_date, 'Mon') || ' ' || status, ', ' order by start_date) from public.accounting_periods
           where organization_id = (select id from fx where k = 'orgA') and start_date between '2026-10-01' and '2026-12-31'), 'Oct locked, Nov locked, Dec locked',
  'VAT-13 · approval locks the quarter''s accounting periods');
select throws_like($$ select tests.sale('late', '2026-11-15', 100000, 'SR') $$, '%locked%', 'VAT-13 · a later posting into the quarter is rejected');
select throws_like($$ select public.add_vat_adjustment((select id from vr where k = 'ret'), '1a', 0, 0, 500, 'late') $$, '%only while the return is a draft%',
  'No adjustment after approval');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.vat_return_boxes set vat = 0 where vat_return_id = (select id from vr where k = 'ret') and box_code = '1a' $$, '42501', null,
  'The approved boxes cannot be changed, not even by the database owner');
select throws_ok($$ update public.vat_returns set fta_reference = 'X' where id = (select id from vr where k = 'ret') $$, '42501', null, 'The approved return is frozen');

-- D-44 · a Firm Admin reopens November; a late invoice is posted there and shows in the next return for review
select tests.login('admin2@test.local');
select public.reopen_period((select id from public.accounting_periods where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-11-01'),
  'Supplier invoice found after the return — Faizan to decide correction');
select tests.sale('late', '2026-11-20', 100000, 'SR');
select is((select string_agg((x ->> 'amount') || '/' || (x ->> 'vat') || ' ' || (x ->> 'period_end'), '; ')
           from jsonb_array_elements(public.vat_return_preview((select id from vr where k = 'q1')) -> 'prior_period_items') x),
  '100000/5000 2026-12-31', 'D-44 · the late invoice appears in the next return as a prior-period item');
select is(tests.boxes('q4', array['1a']), '1a 800000/40000/-10000', 'D-44 · the approved return stays exactly as approved');

-- Maker-checker on a return the Firm Admin prepared; filing reference
insert into vr values ('ret2', public.start_vat_return((select id from vr where k = 'q1')));
select public.submit_vat_return((select id from vr where k = 'ret2'));
select throws_like($$ select public.approve_vat_return((select id from vr where k = 'ret2')) $$, '%someone else must approve%', 'R1 · the preparer cannot approve the return');
select tests.login('acct@test.local');
select throws_like($$ select public.mark_vat_return_filed((select id from vr where k = 'ret'), 'FTA-123', '2027-01-20') $$, 'You are not allowed%',
  'Only a Firm Admin records the filing');
select tests.login('admin2@test.local');
select public.mark_vat_return_filed((select id from vr where k = 'ret'), '  230001234567  ', '2027-01-20');
select is((select (status, fta_reference, filed_on)::text from public.vat_returns where id = (select id from vr where k = 'ret')), '(filed,230001234567,2027-01-20)',
  'Filed on EmaraTax: reference and date recorded; the return stays frozen');

-- Tenant isolation
select tests.login('badmin@test.local');
select throws_like($$ select public.vat_return_preview((select id from vr where k = 'q4')) $$, 'You are not allowed%', 'Another firm cannot see client A''s return');
select is((select count(*) from public.vat_returns) + (select count(*) from public.vat_return_boxes), 0::bigint, 'Another firm sees no returns or boxes');

select * from finish();
rollback;
