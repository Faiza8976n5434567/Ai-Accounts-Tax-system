-- Purchase bills, debit notes, compliance checks and attachments (P2-03). Worked examples from PLAN §6:
-- VAT-05, VAT-06, VAT-07, VAT-08, ARAP-06, DM-08, D-31, D-32, D-33. Amounts in fils (AED 25,000.00 = 2500000).
begin;
\ir fixtures/setup.psql
select plan(37);

create temp table pb (k text primary key, id uuid) on commit drop;
grant all on pb to authenticated;
with x as (insert into public.contacts (organization_id, kind, name, trn) values ((select id from fx where k = 'orgA'), 'supplier', 'Desert Consultants LLC', '100300400500003') returning id)
insert into pb select 'sup', id from x;
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'supplier', 'No TRN Trading') returning id)
insert into pb select 'notrn', id from x;
with x as (insert into public.contacts (organization_id, kind, name, country_code) values ((select id from fx where k = 'orgA'), 'supplier', 'Cloud Software Inc', 'US') returning id)
insert into pb select 'foreign', id from x;
with x as (insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'customer', 'Buyer Only LLC') returning id)
insert into pb select 'cust', id from x;

-- p_doc JSON. Each line 'qty|unit_price|account_code|tax_code|description'.
create function tests.bill(p_contact text, p_no text, p_date date, p_lines text[], p_extra jsonb default '{}') returns jsonb
language sql stable security definer as $$
  select jsonb_build_object('contact_id', (select id from pb where k = p_contact), 'supplier_invoice_no', p_no, 'bill_date', p_date,
    'lines', (select jsonb_agg(jsonb_build_object('quantity', split_part(x, '|', 1), 'unit_price', split_part(x, '|', 2),
              'account_id', tests.acct((select id from fx where k = 'orgA'), split_part(x, '|', 3)), 'tax_code', split_part(x, '|', 4),
              'description', split_part(x, '|', 5))) from unnest(p_lines) x)) || p_extra
$$;
-- The posted journal of a bill as 'code debit/credit [tax_code vat n]; …'
create function tests.bill_journal(p_key text) returns text language sql stable security definer as $$
  select string_agg(a.code || ' ' || l.debit || '/' || l.credit || coalesce(' ' || l.tax_code || ' vat ' || l.vat_amount, ''), '; ' order by l.line_no)
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = (select journal_id from public.purchase_bills where id = (select id from pb where k = p_key))
$$;
create function tests.failed_checks(p_key text) returns text language sql stable security definer as $$
  select coalesce(string_agg(check_code, ',' order by check_code), '') from public.bill_checks
  where purchase_bill_id = (select id from pb where k = p_key) and not passed
$$;
grant execute on function tests.bill(text, text, date, text[], jsonb), tests.bill_journal(text), tests.failed_checks(text) to authenticated;
create function tests.save_bill(p_key text, p_doc jsonb) returns void language sql as $$
  insert into pb values (p_key, public.save_purchase_bill(null, (select id from fx where k = 'orgA'), p_doc))
$$;
grant execute on function tests.save_bill(text, jsonb) to authenticated;

-- VAT-06 · professional fees 25,000 + VAT 1,250 from a registered supplier: all checks pass, VAT recoverable
select tests.login('acct@test.local');
select tests.save_bill('b1', tests.bill('sup', 'DC-100', '2026-10-05', array['1|2500000|6130|SR|Audit support'], '{"shows_recipient_details": true}'));
select is((select (net_total, vat_total, recoverable_vat, payable_total, due_date, risk_score, risk_level::text, status::text)::text
           from public.purchase_bills where id = (select id from pb where k = 'b1')),
  '(2500000,125000,125000,2625000,2026-11-04,10,low,draft)', 'VAT-06 · net 25,000, VAT 1,250 recoverable, payable 26,250, due +30 days; round-sum warning only → risk low');
select is(tests.failed_checks('b1'), 'round_sum', 'Only the round-sum warning (25,000) — the Art 59 checks pass');
select throws_like($$ select public.post_purchase_bill((select id from pb where k = 'b1')) $$, 'You are not allowed%', 'A Firm Accountant cannot approve bills');
select public.submit_purchase_bill((select id from pb where k = 'b1'));
select tests.login('admin2@test.local');
select is(public.post_purchase_bill((select id from pb where k = 'b1')), 'JV-2026-10-0002', 'Approved and posted as the next journal');
select is(tests.bill_journal('b1'), '6130 2500000/0 SR vat 125000; 1300 125000/0; 2000 0/2625000',
  'VAT-06 · Dr Professional fees 25,000 (SR, box 9) / Dr VAT input 1,250 / Cr Payables 26,250');
select is((select (j.entry_date, j.source::text, j.prepared_by = tests.uid('acct@test.local'), j.approved_by = tests.uid('admin2@test.local'))::text
           from public.journals j where j.id = (select journal_id from public.purchase_bills where id = (select id from pb where k = 'b1'))),
  '(2026-10-05,purchase,t,t)', 'D-31 · journal dated on the supplier''s invoice date; preparer and approver kept');
select is((select (a.code, c.default_tax_code)::text from public.contacts c join public.accounts a on a.id = c.default_account_id where c.id = (select id from pb where k = 'sup')),
  '(6130,SR)', 'The account and tax code used become the supplier''s default for the next bill');

-- Posted bills are frozen (R2)
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.purchase_bills set notes = 'changed' where id = (select id from pb where k = 'b1') $$, '42501', null,
  'A posted bill cannot be changed, not even by the database owner');
select throws_ok($$ delete from public.purchase_bill_lines where purchase_bill_id = (select id from pb where k = 'b1') $$, '42501', null, 'Its lines cannot be deleted');

-- ARAP-06 · the same supplier invoice number twice is refused (ignoring case and spaces)
select tests.login('acct@test.local');
select throws_ok($$ select tests.save_bill('dup', tests.bill('sup', ' dc-100 ', '2026-10-06', array['1|1000|6130|SR|Again'])) $$, '23505', null,
  'ARAP-06 · DC-100 cannot be entered again for the same supplier');
-- …and the same supplier, date and amount under another number is flagged as a possible duplicate (weight 45 → high)
select tests.save_bill('dup2', tests.bill('sup', 'DC-100A', '2026-10-05', array['1|2500000|6130|SR|Audit support'], '{"shows_recipient_details": true}'));
select is((select tests.failed_checks('dup2') || ' ' || risk_score || ' ' || risk_level from public.purchase_bills where id = (select id from pb where k = 'dup2')),
  'duplicate,round_sum 55 high', 'Possible duplicate: failed check, risk high');

-- D-46 · above AED 10,000 the full tax invoice must show our name, address and TRN: a warning, VAT still recovered
select tests.save_bill('b46', tests.bill('sup', 'DC-146', '2026-10-06', array['1|1123400|6130|SR|Consulting']));
select is((select tests.failed_checks('b46') || ' ' || recoverable_vat || ' ' || risk_score || ' ' || risk_level from public.purchase_bills where id = (select id from pb where k = 'b46')),
  'recipient 56170 10 low', 'D-46 · 11,795.70 bill without the tick: warning only (risk +10), input VAT 561.70 still recovered');
select tests.save_bill('b46b', tests.bill('sup', 'DC-146B', '2026-10-06', array['1|900000|6130|SR|Small consulting']));
select is(tests.failed_checks('b46b'), '', 'D-46 · 9,450 (under the threshold): no full-invoice check needed');

-- VAT-07 · client entertainment 3,800 + 190: input VAT blocked, the whole 3,990 is expense
select tests.save_bill('b7', tests.bill('sup', 'DC-107', '2026-10-06', array['1|380000|6140|BLK|Client dinner']));
select public.submit_purchase_bill((select id from pb where k = 'b7'));
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'b7'));
select is(tests.bill_journal('b7'), '6140 399000/0 BLK vat 19000; 2000 0/399000', 'VAT-07 · Dr Entertainment 3,990 (blocked) / Cr Payables 3,990 — nothing to VAT input');

-- VAT-08 · supplier without a TRN charges VAT: not recoverable automatically (D-32), risk high
select tests.login('acct@test.local');
select tests.save_bill('b8', tests.bill('notrn', 'NT-1', '2026-10-06', array['1|100000|6180|SR|Printer paper']));
select is((select (tests.failed_checks('b8'), recoverable_vat, vat_recoverable_by_checks, risk_level::text)::text from public.purchase_bills where id = (select id from pb where k = 'b8')),
  '(unregistered,0,f,high)', 'VAT-08 · no TRN: input VAT 0 recoverable, risk high');
select public.submit_purchase_bill((select id from pb where k = 'b8'));
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'b8'));
select is(tests.bill_journal('b8'), '6180 105000/0 BLK vat 5000; 2000 0/105000', 'VAT-08 · posted without recovery: the VAT 50 is part of the expense, not in box 9');

-- D-32 · the approver may recover VAT anyway, with a written reason
select tests.login('acct@test.local');
select tests.save_bill('b9', tests.bill('notrn', 'NT-2', '2026-10-06', array['1|200000|6180|SR|Laptop bag']));
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'b9'), 'TRN confirmed on the FTA portal, supplier record to be updated');
select is((select (recoverable_vat, vat_override_reason is not null)::text from public.purchase_bills where id = (select id from pb where k = 'b9')),
  '(10000,t)', 'D-32 · override with reason: VAT 100 recovered and the reason kept');
select is(tests.bill_journal('b9'), '6180 200000/0 SR vat 10000; 1300 10000/0; 2000 0/210000', 'Override posting goes to VAT input');

-- Missing 'Tax Invoice' heading: error (22 → medium), VAT not recovered
select tests.login('acct@test.local');
select tests.save_bill('b10', tests.bill('sup', 'DC-110', '2026-10-07', array['1|50000|6180|SR|Toner'], '{"has_tax_invoice_heading": false}'));
select is((select (tests.failed_checks('b10'), recoverable_vat, risk_score, risk_level::text)::text from public.purchase_bills where id = (select id from pb where k = 'b10')),
  '(heading,0,22,medium)', 'No ''Tax Invoice'' heading: VAT not recoverable, risk medium');

-- Weekend date and a TRN on the invoice different from the supplier record are warnings (10 each)
select tests.save_bill('b11', tests.bill('sup', 'DC-111', '2026-10-03', array['1|12345|6180|SR|Saturday purchase'], '{"supplier_trn_on_invoice": "100999888777003"}'));
select is((select tests.failed_checks('b11') || ' ' || recoverable_vat || ' ' || risk_score || ' ' || risk_level from public.purchase_bills where id = (select id from pb where k = 'b11')),
  'trn_match,weekend 617 20 medium', 'Weekend and TRN mismatch are warnings: VAT still recoverable, risk 20 medium');

-- VAT-05 · imported service 6,000 under reverse charge: VAT 300 self-assessed, supplier is owed 6,000
select tests.save_bill('b5', tests.bill('foreign', 'CS-2026-88', '2026-10-07', array['1|600000|6130|RCS|Software subscription']));
select is((select (net_total, vat_total, recoverable_vat, payable_total, tests.failed_checks('b5'))::text from public.purchase_bills where id = (select id from pb where k = 'b5')),
  '(600000,30000,30000,600000,"")', 'VAT-05 · net 6,000, VAT 300 (reverse charge), payable 6,000; no TRN or heading needed');
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'b5'));
select is(tests.bill_journal('b5'), '6130 600000/0 RCS vat 30000; 1310 30000/0; 2110 0/30000; 2000 0/600000',
  'VAT-05 · Dr Fees 6,000 (RCS: boxes 3 & 10) / Dr RC input 300 / Cr RC output 300 / Cr Payables 6,000');

-- A foreign supplier billed as standard-rated gets a warning to use reverse charge
select tests.login('acct@test.local');
select tests.save_bill('b12', tests.bill('foreign', 'CS-2026-89', '2026-10-07', array['1|100000|6130|SR|Support']));
select is(tests.failed_checks('b12'), 'reverse_charge', 'Foreign supplier with SR: reverse-charge warning');

-- USD bill (FX-01 rate 3.6725): USD 1,000 → AED 3,672.50, VAT 183.63 (half-up on the AED line)
select tests.save_bill('usd', tests.bill('sup', 'DC-USD-1', '2026-10-07', array['1|100000|6130|SR|USD advisory'], '{"currency": "USD"}'));
select is((select (net_total, vat_total, payable_total, payable_total_fcy)::text from public.purchase_bills where id = (select id from pb where k = 'usd')),
  '(367250,18363,385613,105000)', 'USD 1,000 + 50 → AED 3,672.50 + 183.63 = 3,856.13');

-- Validation
select throws_like($$ select tests.save_bill('x1', tests.bill('cust', 'X-1', '2026-10-07', array['1|1000|6130|SR|x'])) $$,
  '%customer only%', 'A customer-only contact cannot be a supplier on a bill');
select throws_like($$ select tests.save_bill('x2', tests.bill('sup', 'X-2', '2026-10-07', array['1|1000|4010|SR|x'])) $$,
  '%expense or asset account%', 'A bill line cannot go to an income account');
select throws_like($$ select tests.save_bill('x3', tests.bill('sup', 'X-3', '2026-10-07', array['1|1000|2000|SR|x'])) $$,
  '%expense or asset account%', 'A bill line cannot go to the payables control account');

-- Maker-checker: a Firm Admin cannot approve their own bill
select tests.login('admin2@test.local');
select tests.save_bill('own', tests.bill('sup', 'DC-OWN', '2026-10-07', array['1|10000|6180|SR|Pens']));
select throws_like($$ select public.post_purchase_bill((select id from pb where k = 'own')) $$, '%someone else must approve%', 'R1 · the preparer cannot approve');
select throws_like($$ select public.reject_purchase_bill((select id from pb where k = 'own'), ' ') $$, '%reason is required%', 'Sending back needs a reason');

-- Debit notes post the other way, are capped at what is left, and follow the bill's VAT treatment
select tests.login('acct@test.local');
select tests.save_bill('dn1', tests.bill('sup', 'DC-100-CN1', '2026-10-07', array['1|500000|6130|SR|Fee reduction'],
  jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from pb where k = 'b1'))));
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'dn1'));
select is(tests.bill_journal('dn1'), '6130 0/500000 SR vat 25000; 1300 0/25000; 2000 525000/0', 'Debit note: Dr Payables 5,250 / Cr Fees 5,000 / Cr VAT input 250');
select tests.login('acct@test.local');
select tests.save_bill('dn2', tests.bill('sup', 'DC-100-CN2', '2026-10-07', array['1|2000001|6130|SR|Too much'],
  jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from pb where k = 'b1'))));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_purchase_bill((select id from pb where k = 'dn2')) $$, '%more than what is left%', 'A debit note cannot exceed what is left on the bill');
select tests.login('acct@test.local');
select tests.save_bill('dn3', tests.bill('notrn', 'NT-1-CN', '2026-10-07', array['1|100000|6180|SR|Returned'],
  jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from pb where k = 'b8'))));
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from pb where k = 'dn3'));
select is(tests.bill_journal('dn3'), '6180 0/105000 BLK vat 5000; 2000 105000/0', 'A debit note on a non-recovered bill does not touch VAT input');

-- DM-08 · attachments: private path per client, the same file only once per client
select tests.login('acct@test.local');
insert into public.attachments (organization_id, storage_path, file_name, mime_type, size_bytes, sha256, purchase_bill_id)
values ((select id from fx where k = 'orgA'), (select id from fx where k = 'orgA') || '/bills/dup2.pdf', 'DC-100A.pdf', 'application/pdf', 52000,
        repeat('ab', 32), (select id from pb where k = 'dup2'));
select is((select uploaded_by = tests.uid('acct@test.local') from public.attachments where sha256 = repeat('ab', 32)), true, 'The uploader is recorded');
select throws_ok($$ insert into public.attachments (organization_id, storage_path, file_name, mime_type, size_bytes, sha256, purchase_bill_id)
  values ((select id from fx where k = 'orgA'), (select id from fx where k = 'orgA') || '/bills/again.pdf', 'copy.pdf', 'application/pdf', 52000,
          repeat('ab', 32), (select id from pb where k = 'b10')) $$, '23505', null, 'DM-08 · the same file (same SHA-256) cannot be attached twice');
select throws_like($$ select public.delete_purchase_bill((select id from pb where k = 'dup2')) $$, '%kept as evidence%', 'A draft with a document attached is kept');
select lives_ok($$ select public.delete_purchase_bill((select id from pb where k = 'b12')) $$, 'A draft without attachments can be deleted');

-- Tenant isolation: another firm sees none of client A's bills, lines or checks
select tests.login('badmin@test.local');
select is((select count(*) from public.purchase_bills) + (select count(*) from public.purchase_bill_lines) + (select count(*) from public.bill_checks)
          + (select count(*) from public.attachments), 0::bigint, 'Another firm sees no bills, lines, checks or attachments');

select * from finish();
rollback;
