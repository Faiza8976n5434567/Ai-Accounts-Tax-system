-- Receipts, supplier payments, refunds, Customer Credits and Supplier advances (P2-04). Worked examples from
-- PLAN §6: ARAP-01→05, ARAP-08→12, DM-05, DM-06, FX-02, FX-03, D-34, D-36, D-37. Amounts in fils / cents.
begin;
\ir fixtures/setup.psql
select plan(37);

create temp table rp (k text primary key, id uuid) on commit drop;
grant all on rp to authenticated;
do $$
declare v record;
begin
  for v in select * from (values ('c1', 'customer', 'Alpha Buyer LLC', 'AE'), ('c2', 'customer', 'Beta Buyer LLC', 'AE'), ('c3', 'customer', 'Gamma Buyer LLC', 'AE'),
                                 ('c4', 'customer', 'Delta Buyer LLC', 'AE'), ('c5', 'customer', 'Epsilon Buyer LLC', 'AE'), ('cu', 'customer', 'US Buyer Inc', 'US'),
                                 ('s1', 'supplier', 'Office Supplies LLC', 'AE')) x(k, kind, name, cc) loop
    insert into rp values (v.k, gen_random_uuid());
    insert into public.contacts (id, organization_id, kind, name, trn, country_code)
    values ((select id from rp where k = v.k), (select id from fx where k = 'orgA'), v.kind::public.contact_kind, v.name,
            case when v.kind = 'supplier' then '100300400500003' end, v.cc);
  end loop;
end $$;

-- Prepared by the accountant, approved by the second Firm Admin.
create function tests.invoice(p_key text, p_contact text, p_date date, p_net bigint, p_currency text default 'AED', p_credit_for text default null) returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into rp values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'doc_type', case when p_credit_for is null then 'invoice' else 'credit_note' end, 'original_invoice_id', (select id from rp where k = p_credit_for),
    'contact_id', (select id from rp where k = p_contact), 'issue_date', p_date, 'currency', p_currency,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Services',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from rp where k = p_key));
end $$;
create function tests.bill(p_key text, p_no text, p_date date, p_net bigint) returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into rp values (p_key, public.save_purchase_bill(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from rp where k = 's1'), 'supplier_invoice_no', p_no, 'bill_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Stationery',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '6180'))))));
  perform tests.login('admin2@test.local');
  perform public.post_purchase_bill((select id from rp where k = p_key));
end $$;
-- Saves a payment as the accountant (allocations: [[doc key, amount], …] or null = automatic).
create function tests.save_pay(p_key text, p_kind text, p_contact text, p_date date, p_amount bigint, p_charges bigint default 0,
  p_currency text default 'AED', p_alloc text[] default null) returns void
language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into rp values (p_key, public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'kind', p_kind, 'contact_id', (select id from rp where k = p_contact), 'payment_date', p_date, 'currency', p_currency,
    'amount', p_amount, 'bank_charges', p_charges, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'),
    'allocations', (select jsonb_agg(jsonb_build_object('document_id', (select id from rp where k = split_part(a, '|', 1)), 'amount', split_part(a, '|', 2)::bigint))
                    from unnest(p_alloc) a))));
end $$;
create function tests.post_pay(p_key text) returns text language plpgsql as $$
begin
  perform tests.login('admin2@test.local');
  return public.post_payment((select id from rp where k = p_key));
end $$;
create function tests.pj(p_key text) returns text language sql stable security definer as $$
  select string_agg(a.code || ' ' || l.debit || '/' || l.credit, '; ' order by l.line_no)
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = (select journal_id from public.payments where id = (select id from rp where k = p_key))
$$;
create function tests.open_inv(p_key text) returns text language sql stable security definer as $$
  select open_fcy || '/' || open_aed from app.sales_open((select id from rp where k = p_key))
$$;
create function tests.gl(p_code text) returns bigint language sql stable security definer as $$
  select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journals j on j.id = l.journal_id
  where j.status = 'posted' and l.account_id = tests.acct((select id from fx where k = 'orgA'), p_code)
$$;
grant execute on all functions in schema tests to authenticated;

-- ARAP-01 · invoice 10,000 + VAT 500, receipt 4,000 → open 6,500
select tests.invoice('a1', 'c1', '2026-10-01', 1000000);
select tests.save_pay('r1', 'customer_receipt', 'c1', '2026-10-06', 400000, 0, 'AED', array['a1|400000']);
select throws_like($$ select public.post_payment((select id from rp where k = 'r1')) $$, 'You are not allowed%', 'A Firm Accountant cannot approve receipts');
select is(tests.post_pay('r1'), 'RCPT-2026-10-0001', 'The first receipt is RCPT-2026-10-0001');
select is(tests.pj('r1'), '1010 400000/0; 1100 0/400000', 'ARAP-01 · Dr Bank 4,000 / Cr Receivables 4,000');
select is(tests.open_inv('a1'), '650000/650000', 'ARAP-01 · open balance 6,500');
select is((select (due_date, current_date - due_date)::text from public.open_documents where id = (select id from rp where k = 'a1')),
  ('(2026-10-31,' || (current_date - date '2026-10-31') || ')'), 'ARAP-01 · ageing is by due date');

-- ARAP-04 · credit note 2,000 + 100 against the same invoice → open 4,400
select tests.invoice('cn1', 'c1', '2026-10-07', 200000, 'AED', 'a1');
select is(tests.open_inv('a1'), '440000/440000', 'ARAP-04 · open balance 4,400 after the credit note');

-- ARAP-05 · invoice 10,500 (incl. VAT 500); customer pays 11,000 → settled, 500 Customer Credit, no VAT on it
select tests.invoice('a2', 'c2', '2026-10-02', 1000000);
select tests.save_pay('r2', 'customer_receipt', 'c2', '2026-10-06', 1100000);
select tests.post_pay('r2');
select is(tests.pj('r2'), '1010 1100000/0; 1100 0/1050000; 2150 0/50000', 'ARAP-05 · Dr Bank 11,000 / Cr Receivables 10,500 / Cr Customer Credits 500');
select is((select (left_fcy, left_aed)::text from public.credit_balances where payment_id = (select id from rp where k = 'r2')), '(50000,50000)', 'Customer credit of 500 is available');

-- ARAP-08 · the next invoice 2,100 for the same customer: the 500 credit is applied automatically
select tests.invoice('a3', 'c2', '2026-10-07', 200000);
select is(tests.open_inv('a3'), '160000/160000', 'ARAP-08 · invoice 2,100 open 1,600 after the credit is applied');
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit, '; ' order by l.line_no)
           from public.payment_allocations pa join public.journal_lines l on l.journal_id = pa.journal_id join public.accounts a on a.id = l.account_id
           where pa.sales_invoice_id = (select id from rp where k = 'a3')),
  '2150 50000/0; 1100 0/50000', 'ARAP-08 · Dr Customer Credits 500 / Cr Receivables 500');
select is((select count(*) from public.credit_balances where payment_id = (select id from rp where k = 'r2')), 0::bigint, 'The credit is used up');
select ok(exists (select 1 from public.audit_log where table_name = 'payment_allocations' and action = 'apply_credits' and reason like 'Customer credit applied automatically%'
                  and after ->> 'sales_invoice_id' = (select id::text from rp where k = 'a3')), 'ARAP-08 · the application is in the audit trail');

-- ARAP-09 · an automatic receipt settles the oldest invoice first, and never another customer's
select tests.invoice('b1', 'c3', '2026-10-02', 100000);
select tests.invoice('b2', 'c3', '2026-10-05', 200000);
select tests.save_pay('r3', 'customer_receipt', 'c3', '2026-10-07', 200000);
select tests.post_pay('r3');
select is(tests.open_inv('b1') || ' ' || tests.open_inv('b2'), '0/0 115000/115000', 'ARAP-09 · oldest invoice (1,050) settled first, 950 to the next');
select is(tests.open_inv('a1'), '440000/440000', 'ARAP-09 · another customer''s invoice is untouched');

-- ARAP-10 / 11 · refunds of a credit, with maker-checker
select tests.save_pay('r4', 'customer_receipt', 'c4', '2026-10-07', 50000);
select tests.post_pay('r4');
select throws_like($$ select tests.save_pay('f0', 'customer_refund', 'c4', '2026-10-07', 60000) $$, '%more than the customer credit available%',
  'ARAP-11 · a refund of 600 against a 500 credit is rejected');
select tests.save_pay('f1', 'customer_refund', 'c4', '2026-10-07', 50000);
select throws_like($$ select public.post_payment((select id from rp where k = 'f1')) $$, 'You are not allowed%', 'ARAP-10 · the preparer cannot approve the refund');
select is(tests.post_pay('f1'), 'PAY-2026-10-0001', 'A customer refund is a payment out (PAY-)');
select is(tests.pj('f1'), '1010 0/50000; 2150 50000/0', 'ARAP-10 · Dr Customer Credits 500 / Cr Bank 500');
select is((select count(*) from public.credit_balances where contact_id = (select id from rp where k = 'c4')), 0::bigint, 'Nothing left to refund');

-- ARAP-12 · Customer Credits are a separate liability, never netted against receivables
select is((select type::text || ' ' || code from public.accounts where organization_id = (select id from fx where k = 'orgA') and subtype = 'customer_credits'),
  'liability 2150', 'ARAP-12 · Customer Credits is its own liability account (2150)');

-- D-34 · bank charges deducted by the bank, and a small shortfall written off
select tests.invoice('e1', 'c5', '2026-10-03', 1000000);
select tests.save_pay('r5', 'customer_receipt', 'c5', '2026-10-07', 1050000, 5000);
select tests.post_pay('r5');
select is(tests.pj('r5'), '1010 1045000/0; 6400 5000/0; 1100 0/1050000', 'Bank charges 50: Dr Bank 10,450 / Dr Bank charges 50 / Cr Receivables 10,500');
select tests.invoice('e2', 'c5', '2026-10-04', 100000);
select tests.save_pay('r6', 'customer_receipt', 'c5', '2026-10-07', 104940);
select tests.post_pay('r6');
select is(tests.pj('r6') || ' | ' || tests.open_inv('e2'), '1010 104940/0; 6190 60/0; 1100 0/105000 | 0/0', 'D-34 · 0.60 short: written off, invoice closed');
select tests.invoice('e3', 'c5', '2026-10-05', 100000);
select tests.save_pay('r7', 'customer_receipt', 'c5', '2026-10-07', 104000, 0, 'AED', array['e3|105000']);
select throws_like($$ select tests.post_pay('r7') $$, '%more than the amount%', 'D-34 · a 10.00 shortfall is not written off');

-- DM-05 / DM-06
select throws_like($$ select tests.save_pay('x1', 'customer_receipt', 'c5', '2026-10-07', 200000, 0, 'AED', array['e3|105001']) $$,
  '%more than the open balance%', 'DM-05 · an allocation larger than the open balance is rejected');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, refund_id, amount_fcy, amount, applied_on)
  values ((select id from fx where k = 'orgA'), (select id from rp where k = 'r1'), (select id from rp where k = 'a1'), (select id from rp where k = 'r2'), 1, 1, current_date) $$,
  '23514', null, 'DM-06 · an allocation to two targets at once is rejected');
select throws_ok($$ update public.payments set reference = 'changed' where id = (select id from rp where k = 'r1') $$, '42501', null,
  'A posted receipt cannot be changed, not even by the database owner');

-- Maker-checker: the second Firm Admin cannot approve a receipt they prepared
select tests.login('admin2@test.local');
insert into rp values ('own', public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from rp where k = 'c5'), 'payment_date', '2026-10-07', 'amount', 1000, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select throws_like($$ select public.post_payment((select id from rp where k = 'own')) $$, '%someone else must approve%', 'R1 · the preparer cannot approve');

-- D-36 · supplier: pay 3,000 against a 2,625 bill → 375 Supplier advance, applied to the next bill, then refunded
select tests.bill('p1', 'OS-1', '2026-10-01', 250000);
select tests.save_pay('s1p', 'supplier_payment', 's1', '2026-10-06', 300000);
select tests.post_pay('s1p');
select is(tests.pj('s1p'), '1010 0/300000; 2000 262500/0; 1160 37500/0', 'D-36 · Dr Payables 2,625 / Dr Supplier advances 375 / Cr Bank 3,000');
select tests.bill('p2', 'OS-2', '2026-10-07', 30000);
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit, '; ' order by l.line_no)
           from public.payment_allocations pa join public.journal_lines l on l.journal_id = pa.journal_id join public.accounts a on a.id = l.account_id
           where pa.purchase_bill_id = (select id from rp where k = 'p2')),
  '2000 31500/0; 1160 0/31500', 'D-36 · the advance is applied to the next bill (315)');
select tests.save_pay('s1r', 'supplier_refund', 's1', '2026-10-07', 6000);
select tests.post_pay('s1r');
select is(tests.pj('s1r'), '1010 6000/0; 1160 0/6000', 'The supplier refunds the remaining 60: Dr Bank / Cr Supplier advances');

-- FX-02 · USD invoice 1,000 + 50 = AED 3,856.13; customer pays USD 1,050 → fully settled, no exchange line
select tests.invoice('u1', 'cu', '2026-10-02', 100000, 'USD');
select tests.save_pay('ru1', 'customer_receipt', 'cu', '2026-10-07', 105000, 0, 'USD');
select tests.post_pay('ru1');
select is(tests.pj('ru1') || ' | ' || tests.open_inv('u1'), '1010 385613/0; 1100 0/385613 | 0/0', 'FX-02 · USD 1,050 → AED 3,856.13 received; invoice settled');
-- FX-03 · paid in two parts (USD 500 + 550): the second part clears exactly what is left in AED
select tests.invoice('u2', 'cu', '2026-10-03', 100000, 'USD');
select tests.save_pay('ru2', 'customer_receipt', 'cu', '2026-10-07', 50000, 0, 'USD');
select tests.post_pay('ru2');
select tests.save_pay('ru3', 'customer_receipt', 'cu', '2026-10-07', 55000, 0, 'USD');
select tests.post_pay('ru3');
select is(tests.open_inv('u2') || ' ' || (select count(*) from public.journal_lines l join public.accounts a on a.id = l.account_id
           where a.subtype in ('fx_gain', 'fx_loss') and l.organization_id = (select id from fx where k = 'orgA')),
  '0/0 0', 'FX-03 · no 0.01 residue left open and no exchange difference');
select throws_like($$ select tests.save_pay('x2', 'customer_receipt', 'cu', '2026-10-07', 1000, 0, 'AED', array['u2|1000']) $$,
  '%can only settle AED documents%', 'A payment settles documents in its own currency only (D-37)');

-- ARAP-02 / ARAP-03 · sub-ledgers always equal the general ledger
select is((select coalesce(sum(open_aed), 0)::bigint from public.open_documents where doc_kind = 'sales_invoice' and organization_id = (select id from fx where k = 'orgA')),
  tests.gl('1100'), 'ARAP-02 · open invoices = GL 1100 Trade receivables');
select is((select coalesce(-sum(open_aed), 0)::bigint from public.open_documents where doc_kind = 'purchase_bill' and organization_id = (select id from fx where k = 'orgA')),
  tests.gl('2000'), 'ARAP-03 · open bills = GL 2000 Trade payables');
select is((select (-coalesce(sum(left_aed), 0))::bigint from public.credit_balances where kind = 'customer_receipt' and organization_id = (select id from fx where k = 'orgA')),
  tests.gl('2150'), 'Unused customer credits = GL 2150');

-- Tenant isolation
select tests.login('badmin@test.local');
select is((select count(*) from public.payments) + (select count(*) from public.payment_allocations) + (select count(*) from public.open_documents)
          + (select count(*) from public.credit_balances), 0::bigint, 'Another firm sees no payments, allocations, open items or credits');

select * from finish();
rollback;
