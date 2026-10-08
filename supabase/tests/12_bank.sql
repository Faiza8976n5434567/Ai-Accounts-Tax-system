-- Bank accounts, statement upload, matching, bank-line journals, receipt reversal and reconciliation (P2-05).
-- PLAN §6: BANK-01, BANK-02, BANK-03, DM-07 · D-38, D-39, D-40, D-41. Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(31);

create temp table bk (k text primary key, id uuid) on commit drop;
grant all on bk to authenticated;
do $$
declare v record;
begin
  for v in select * from (values ('c1', 'Alpha Buyer LLC'), ('c2', 'Beta Buyer LLC'), ('c3', 'Gamma Buyer LLC')) x(k, name) loop
    insert into bk values (v.k, gen_random_uuid());
    insert into public.contacts (id, organization_id, kind, name) values ((select id from bk where k = v.k), (select id from fx where k = 'orgA'), 'customer', v.name);
  end loop;
end $$;

create function tests.invoice(p_key text, p_contact text, p_date date, p_net bigint) returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into bk values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from bk where k = p_contact), 'issue_date', p_date,
    'lines', jsonb_build_array(jsonb_build_object('quantity', 1, 'unit_price', p_net, 'tax_code', 'SR', 'description', 'Services',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010'))))));
  perform tests.login('admin2@test.local');
  perform public.post_sales_invoice((select id from bk where k = p_key));
end $$;
create function tests.receipt(p_key text, p_contact text, p_date date, p_amount bigint, p_post boolean default true) returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into bk values (p_key, public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'kind', 'customer_receipt', 'contact_id', (select id from bk where k = p_contact), 'payment_date', p_date, 'amount', p_amount,
    'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
  if p_post then
    perform tests.login('admin2@test.local');
    perform public.post_payment((select id from bk where k = p_key));
  end if;
end $$;
-- Statement rows 'date|amount|description|balance' (balance may be empty).
create function tests.rows(p text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('date', split_part(x, '|', 1), 'amount', split_part(x, '|', 2)::bigint, 'description', split_part(x, '|', 3),
                   'balance', nullif(split_part(x, '|', 4), '')::bigint) order by o)
  from unnest(p) with ordinality u(x, o)
$$;
create function tests.txn(p_desc text, p_n int default 1) returns uuid language sql stable security definer as $$
  select id from public.bank_transactions where description = p_desc order by created_at, txn_date, id offset p_n - 1 limit 1
$$;
create function tests.status(p_desc text, p_n int default 1) returns text language sql stable security definer as $$
  select status::text from public.bank_transactions where id = tests.txn(p_desc, p_n)
$$;
grant execute on all functions in schema tests to authenticated;

-- D-38 · the bank account is the GL 1010 account plus its remembered column layout
select tests.login('admin2@test.local');
insert into bk values ('ba', public.save_bank_account(null, (select id from fx where k = 'orgA'),
  jsonb_build_object('name', 'Current account', 'bank_name', 'Emirates NBD', 'iban_last4', '4321', 'account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select tests.login('acct@test.local');
select public.save_bank_mapping((select id from bk where k = 'ba'), '{"date":"Value Date","description":"Narration","in":"Credit","out":"Debit","date_format":"dd/mm/yyyy"}');
select is((select column_mapping ->> 'date' from public.bank_accounts where id = (select id from bk where k = 'ba')), 'Value Date', 'D-38 · the column mapping is remembered per bank account');
select throws_like($$ select public.save_bank_account(null, (select id from fx where k = 'orgA'), '{"name":"Another"}') $$, 'You are not allowed%',
  'Only a Firm Admin sets up bank accounts');

-- Books: invoice 10,500, receipt 10,500 on 5 Oct
select tests.invoice('a1', 'c1', '2026-10-01', 1000000);
select tests.receipt('r1', 'c1', '2026-10-05', 1050000);

-- Statement 1: four lines, two identical bank charges without a balance (both are real)
select tests.login('acct@test.local');
select is(public.import_bank_statement((select id from bk where k = 'ba'), 'oct-part1.csv', repeat('a', 64), tests.rows(array[
  '2026-10-06|1050000|TRANSFER FROM ALPHA BUYER|1050000', '2026-10-07|-5250|BANK CHARGE|', '2026-10-07|-5250|BANK CHARGE|', '2026-10-08|-300000|SALARY OCT|'])) - 'statement_id',
  '{"lines": 4, "imported": 4, "duplicates": 0}'::jsonb, 'Four lines imported; two identical charges on the same day are both kept');
select throws_like($$ select public.import_bank_statement((select id from bk where k = 'ba'), 'oct-part1 (copy).csv', repeat('a', 64), tests.rows(array['2026-10-06|1|x|'])) $$,
  'This statement file was already uploaded%', 'BANK-01 · the same statement file twice is refused');
select is(public.import_bank_statement((select id from bk where k = 'ba'), 'oct-part2.csv', repeat('b', 64), tests.rows(array[
  '2026-10-07|-5250|Bank   charge|', '2026-10-07|-5250|BANK CHARGE|', '2026-10-08|-300000|SALARY OCT|', '2026-10-09|20000|CHEQUE DEPOSIT 0012|'])) - 'statement_id',
  '{"lines": 4, "imported": 1, "duplicates": 3}'::jsonb, 'DM-07 · an overlapping statement imports only the new line');
select is((select count(*) from public.bank_transactions), 5::bigint, 'Five bank lines in total');

-- BANK-02 · auto-match: same amount within ± 5 days, one-to-one
select is(public.auto_match_bank((select id from bk where k = 'ba')), 1, 'BANK-02 · the 10,500 transfer matches the receipt (1 day apart)');
select is((select l.journal_id = (select journal_id from public.payments where id = (select id from bk where k = 'r1'))
           from public.bank_transactions t join public.journal_lines l on l.id = t.journal_line_id where t.id = tests.txn('TRANSFER FROM ALPHA BUYER')),
  true, 'It is matched to the receipt''s bank line');
select throws_like($$ select public.match_bank_transaction(tests.txn('SALARY OCT'),
  (select l.id from public.journal_lines l join public.payments p on p.journal_id = l.journal_id where p.id = (select id from bk where k = 'r1')
   and l.account_id = tests.acct((select id from fx where k = 'orgA'), '1010'))) $$,
  '%not an unmatched line%', 'BANK-02 · a ledger line already matched cannot be matched to a second bank line');

-- D-39 · a bank charge posted to 6400 from the bank line: journal, no VAT, approved by someone else, then matched
select throws_like($$ select public.post_bank_line(tests.txn('BANK CHARGE'), tests.acct((select id from fx where k = 'orgA'), '1100')) $$,
  '%receipts and payments%', 'D-39 · a bank line cannot be posted to Receivables');
insert into bk values ('bj', public.post_bank_line(tests.txn('BANK CHARGE'), tests.acct((select id from fx where k = 'orgA'), '6400'), 'Monthly charge'));
select is((select string_agg(a.code || ' ' || l.debit || '/' || l.credit || coalesce(' ' || l.tax_code, ''), '; ' order by l.line_no)
           from public.journal_lines l join public.accounts a on a.id = l.account_id where l.journal_id = (select id from bk where k = 'bj')),
  '1010 0/5250; 6400 5250/0', 'D-39 · Cr Bank 52.50 / Dr Bank charges 52.50, no tax code');
select throws_like($$ select public.post_journal((select id from bk where k = 'bj')) $$, 'You are not allowed%', 'An accountant cannot approve it');
select tests.login('admin2@test.local');
select public.post_journal((select id from bk where k = 'bj'));
select is(tests.status('BANK CHARGE', 1) || ' ' || tests.status('BANK CHARGE', 2), 'matched unmatched', 'Approved: the first charge is matched, the second is not');
select is(public.auto_match_bank((select id from bk where k = 'ba')), 0, 'BANK-02 · the second identical charge is not matched to the same journal');

-- A receipt created from a bank line is matched when it is approved
select tests.receipt('r5', 'c3', '2026-10-09', 20000, false);
select public.set_payment_bank_line((select id from bk where k = 'r5'), tests.txn('CHEQUE DEPOSIT 0012'));
select tests.login('admin2@test.local');
select public.post_payment((select id from bk where k = 'r5'));
select is(tests.status('CHEQUE DEPOSIT 0012'), 'matched', 'The receipt is matched to its bank line on approval');
select throws_like($$ select public.match_bank_transaction(tests.txn('SALARY OCT'), (select l.id from public.journal_lines l
  where l.journal_id = (select id from bk where k = 'bj') and l.debit > 0)) $$, '%not an unmatched line%', 'Only bank-account lines can be matched');

-- D-40 · reversing a receipt: unmatch first, two people, and the invoice reopens
select throws_like($$ select public.reverse_journal((select journal_id from public.payments where id = (select id from bk where k = 'r1')), 'Wrong customer', '2026-10-07') $$,
  '%unmatch it first%', 'D-40 · a receipt matched to the bank cannot be reversed');
select tests.login('acct@test.local');
select public.unmatch_bank_transaction(tests.txn('TRANSFER FROM ALPHA BUYER'));
select tests.login('admin2@test.local');
insert into bk values ('rev', public.reverse_journal((select journal_id from public.payments where id = (select id from bk where k = 'r1')), 'Wrong customer', '2026-10-07'));
select is((select (open_fcy, open_aed)::text from app.sales_open((select id from bk where k = 'a1'))), '(0,0)', 'While only requested, the invoice stays settled');
select throws_like($$ select public.post_journal((select id from bk where k = 'rev')) $$, '%someone else must approve%', 'D-40 · the requester cannot approve the reversal');
select tests.login('super@test.local');
select public.post_journal((select id from bk where k = 'rev'));
select is((select (open_fcy, open_aed)::text from app.sales_open((select id from bk where k = 'a1'))), '(1050000,1050000)', 'D-40 · after approval the invoice is open again');

-- A receipt whose credit has been used cannot be reversed
select tests.receipt('r2', 'c2', '2026-10-06', 50000);
select tests.invoice('a2', 'c2', '2026-10-07', 100000);
select tests.login('admin2@test.local');
select throws_like($$ select public.reverse_journal((select journal_id from public.payments where id = (select id from bk where k = 'r2')), 'Mistake') $$,
  '%already been used or refunded%', 'D-40 · a receipt whose credit was applied cannot be reversed');
select throws_like($$ select public.reverse_journal((select journal_id from public.sales_invoices where id = (select id from bk where k = 'a2')), 'x') $$,
  '%correct the document instead%', 'Invoice journals are still corrected only by credit notes');

-- BANK-03 · month-end reconciliation: book balance + reconciling items = statement balance
select tests.login('acct@test.local');
select is((select (p ->> 'book_balance')::bigint + (p ->> 'unreconciled_bank')::bigint - (p ->> 'unreconciled_book')::bigint
           from public.bank_reconciliation_preview((select id from bk where k = 'ba'), '2026-10-31') p), 759500::bigint,
  'BANK-03 · book 647.50 + bank items − book items = statement 7,595.00');
select throws_like($$ select public.save_bank_reconciliation((select id from bk where k = 'ba'), '2026-10-31', 759000) $$, '%difference of -5.00%',
  'A reconciliation that does not agree cannot be saved');
insert into bk values ('rec', public.save_bank_reconciliation((select id from bk where k = 'ba'), '2026-10-31', 759500));
select throws_like($$ select public.approve_bank_reconciliation((select id from bk where k = 'rec')) $$, 'You are not allowed%', 'An accountant cannot approve it');
select tests.login('admin2@test.local');
select public.approve_bank_reconciliation((select id from bk where k = 'rec'));
select is((select status::text || ' ' || statement_balance from public.bank_reconciliations where id = (select id from bk where k = 'rec')), 'posted 759500',
  'D-41 · approved by a second person and frozen');

-- D-41 · after approval the month is closed for the bank
select throws_like($$ select public.unmatch_bank_transaction(tests.txn('BANK CHARGE')) $$, '%reconciliation approved to 2026-10-31%',
  'A match inside an approved reconciliation cannot be undone');
select throws_like($$ select public.import_bank_statement((select id from bk where k = 'ba'), 'late.csv', repeat('c', 64), tests.rows(array['2026-10-20|100|LATE LINE|'])) $$,
  '%that month is closed%', 'New lines dated in a reconciled month are refused');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.bank_reconciliations set statement_balance = 0 where id = (select id from bk where k = 'rec') $$, '42501', null,
  'An approved reconciliation cannot be changed, not even by the database owner');
select throws_ok($$ delete from public.bank_transactions where id = tests.txn('SALARY OCT') $$, '42501', null, 'Bank statement lines cannot be deleted');

-- Tenant isolation
select tests.login('badmin@test.local');
select is((select count(*) from public.bank_accounts) + (select count(*) from public.bank_transactions) + (select count(*) from public.bank_statements)
          + (select count(*) from public.bank_reconciliations) + (select count(*) from public.bank_book_lines), 0::bigint,
  'Another firm sees no bank accounts, statements, lines, reconciliations or book lines');

select * from finish();
rollback;
