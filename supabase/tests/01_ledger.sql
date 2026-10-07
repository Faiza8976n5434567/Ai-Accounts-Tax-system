-- Ledger rules enforced by the database: PLAN §6.1 LED-01 → LED-14, Spec 01 DM-01/03,
-- Spec 02 RBAC-04 → 09, PLAN §6.10 NUM-*. Amounts in fils (AED 1,000.00 = 100000).
begin;
\ir fixtures/setup.psql
select plan(57);

-- Helper: a draft journal in client A prepared by the accountant, with the given lines.
create function tests.draft(p_memo text, p_date date, p_lines jsonb, p_org text default 'orgA') returns uuid
language plpgsql as $$
declare v_id uuid; v_org uuid := (select id from fx where k = p_org);
begin
  insert into public.journals (organization_id, entry_date, memo) values (v_org, p_date, p_memo) returning id into v_id;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  select v_id, v_org, (l ->> 'n')::smallint, tests.acct(v_org, l ->> 'acct'), (l ->> 'dr')::bigint, (l ->> 'cr')::bigint
  from jsonb_array_elements(p_lines) l;
  return v_id;
end $$;
grant execute on function tests.draft(text, date, jsonb, text) to authenticated;
create temp table j (k text primary key, id uuid) on commit drop;
grant all on j to authenticated;

-- LED-01 · Dr Rent 1,000 / Cr Accruals 1,000 posts (prepared by accountant, approved by Firm Admin)
select tests.login('acct@test.local');
insert into j values ('led01', tests.draft('LED-01', '2026-02-10',
  '[{"n":1,"acct":"6100","dr":100000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":100000}]'));
select throws_ok($$ select public.post_journal((select id from j where k = 'led01')) $$, '42501', null,
  'RBAC-04 · Firm Accountant cannot post a journal');
select tests.login('admin2@test.local');
select is(public.post_journal((select id from j where k = 'led01')), 'JV-2026-02-0002',
  'LED-01 · balanced journal posts and gets the next running number (NUM-01/02 pattern)');
select is((select status::text from public.journals where id = (select id from j where k = 'led01')), 'posted',
  'LED-01 · status is posted');
select is((select approved_by from public.journals where id = (select id from j where k = 'led01')),
  tests.uid('admin2@test.local'), 'LED-01 · approver recorded');

-- LED-02 · Dr 1,000.00 / Cr 999.99 is rejected — by the function and by direct SQL
select tests.login('acct@test.local');
insert into j values ('led02', tests.draft('LED-02', '2026-02-11',
  '[{"n":1,"acct":"6100","dr":100000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":99999}]'));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_journal((select id from j where k = 'led02')) $$,
  'Journal does not balance%', 'LED-02 · unbalanced journal rejected by post_journal()');
reset role;
select throws_ok($$ update public.journals set status = 'posted', journal_no = 'JV-X', posted_at = now()
  where id = (select id from j where k = 'led02') $$, '42501', null,
  'LED-02 · direct SQL cannot flip a journal to posted');
select app.set_ctx('post_journal');
select throws_like($$ update public.journals set status = 'posted', journal_no = 'JV-X', posted_at = now(),
  approved_by = tests.uid('super@test.local') where id = (select id from j where k = 'led02') $$,
  'Journal does not balance%', 'LED-02 · even a sanctioned post re-checks the balance');
select app.set_ctx(null);

-- LED-03 / LED-04 · line rules
select tests.login('acct@test.local');
select throws_ok($$ insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  values ((select id from j where k = 'led02'), (select id from fx where k = 'orgA'), 9,
          tests.acct((select id from fx where k = 'orgA'), '6100'), 500, 500) $$, '23514', null,
  'LED-03 · a line with both debit and credit is rejected');
select throws_ok($$ insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  values ((select id from j where k = 'led02'), (select id from fx where k = 'orgA'), 9,
          tests.acct((select id from fx where k = 'orgA'), '6100'), -500, 0) $$, '23514', null,
  'LED-04 · a negative amount is rejected');
select throws_ok($$ insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  values ((select id from j where k = 'led02'), (select id from fx where k = 'orgA'), 9,
          tests.acct((select id from fx where k = 'orgA'), '6100'), 0, 0) $$, '23514', null,
  'LED-03 · a zero line is rejected');

-- LED-05 · single-line journal
insert into j values ('led05', tests.draft('LED-05', '2026-02-12', '[{"n":1,"acct":"6100","dr":100000,"cr":0}]'));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_journal((select id from j where k = 'led05')) $$,
  'A journal needs at least two lines%', 'LED-05 · single-line journal rejected');

-- LED-06 · a fraction of a fils cannot be stored (the API sends JSON; 10.005 AED = 1000.5 fils)
select throws_ok($$ select * from jsonb_populate_record(null::public.journal_lines, '{"debit": 1000.5}') $$,
  '22P02', null, 'LED-06 · 1000.5 fils is not a valid amount');

-- LED-07 / LED-08 / RBAC-07 · posted journals and lines are immutable, for everyone
select throws_ok($$ update public.journals set memo = 'changed' where id = (select id from j where k = 'led01') $$,
  '42501', null, 'LED-07 · Firm Admin cannot edit a posted journal');
select throws_ok($$ update public.journal_lines set debit = 1 where journal_id = (select id from j where k = 'led01') and line_no = 1 $$,
  '42501', null, 'RBAC-07 · Firm Admin cannot edit a posted journal line');
select throws_ok($$ delete from public.journals where id = (select id from j where k = 'led01') $$,
  '42501', null, 'LED-08 · Firm Admin cannot delete a posted journal');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.journals set memo = 'changed' where id = (select id from j where k = 'led01') $$,
  '42501', null, 'LED-07 · not even the database owner can edit a posted journal');
select throws_ok($$ delete from public.journal_lines where journal_id = (select id from j where k = 'led01') $$,
  '42501', null, 'LED-08 · not even the database owner can delete posted lines');

-- Maker-checker (R1)
select tests.login('admin2@test.local');
insert into j values ('own', tests.draft('Own draft', '2026-02-13',
  '[{"n":1,"acct":"6100","dr":5000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":5000}]'));
select throws_like($$ select public.post_journal((select id from j where k = 'own')) $$,
  'You prepared this journal%', 'RBAC-05 · Firm Admin cannot approve own draft');
select tests.login('super@test.local');
insert into j values ('super_own', tests.draft('Super draft', '2026-02-13',
  '[{"n":1,"acct":"6100","dr":5000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":5000}]'));
select throws_like($$ select public.post_journal((select id from j where k = 'super_own')) $$,
  'You prepared this journal%', 'RBAC-06 · Super Admin cannot approve own draft either');
-- Editing someone else's draft makes you its preparer, so you can't then approve it.
select tests.login('acct@test.local');
insert into j values ('edited', tests.draft('Edited later', '2026-02-14',
  '[{"n":1,"acct":"6100","dr":7000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":7000}]'));
select tests.login('admin2@test.local');
update public.journal_lines set debit = 8000 where journal_id = (select id from j where k = 'edited') and line_no = 1;
update public.journal_lines set credit = 8000 where journal_id = (select id from j where k = 'edited') and line_no = 2;
select throws_like($$ select public.post_journal((select id from j where k = 'edited')) $$,
  'You prepared this journal%', 'R1 · whoever last edits a draft becomes its preparer');
select tests.login('super@test.local');
select lives_ok($$ select public.post_journal((select id from j where k = 'edited')) $$,
  'R1 · a different Firm Admin can approve it');

-- Control accounts cannot be used in manual journals
select tests.login('acct@test.local');
insert into j values ('ctl', tests.draft('Control account', '2026-02-15',
  '[{"n":1,"acct":"1100","dr":5000,"cr":0},{"n":2,"acct":"4010","dr":0,"cr":5000}]'));
select tests.login('admin2@test.local');
select throws_like($$ select public.post_journal((select id from j where k = 'ctl')) $$,
  'Control account(s) 1100%', 'Manual journal to Trade receivables (control) rejected');

-- LED-09 · reversal — requested by one Firm Admin, approved by another (D-26)
select throws_like($$ select public.reverse_journal((select id from j where k = 'led01'), '  ') $$,
  'A reason is required%', 'LED-09 · reversal needs a reason');
insert into j values ('rev', public.reverse_journal((select id from j where k = 'led01'), 'Booked twice', '2026-03-05'));
select is((select (status::text, journal_no) from public.journals where id = (select id from j where k = 'rev'))::text,
  '(pending,)', 'D-26 · a reversal request waits for approval, unnumbered');
select is((select status::text from public.journals where id = (select id from j where k = 'led01')), 'posted',
  'D-26 · the original stays posted until the reversal is approved');
select throws_like($$ select public.post_journal((select id from j where k = 'rev')) $$,
  'You prepared this journal%', 'D-26 · the requester cannot approve their own reversal');
select throws_like($$ select public.reverse_journal((select id from j where k = 'led01'), 'twice') $$,
  'A reversal of this journal is already waiting%', 'D-26 · only one reversal request at a time');
select throws_ok($$ update public.journal_lines set debit = debit + 1 where journal_id = (select id from j where k = 'rev') and line_no = 2 $$,
  '42501', null, 'D-26 · nobody can edit a reversal request');
select tests.login('super@test.local');
select is(public.post_journal((select id from j where k = 'rev')), 'JV-2026-03-0004',
  'LED-09 · a second Firm Admin approves; reversal takes the next running number');
select is((select status::text from public.journals where id = (select id from j where k = 'led01')), 'reversed',
  'LED-09 · original marked reversed on approval');
select is((select (entry_date, source::text, reversal_of)::text from public.journals where id = (select id from j where k = 'rev')),
  ('2026-03-05'::date, 'reversal', (select id from j where k = 'led01'))::text,
  'LED-09 · mirror journal dated as requested, linked to the original');
select is((select sum(debit - credit) from public.journal_lines l join public.accounts a on a.id = l.account_id
            where l.journal_id in ((select id from j where k = 'led01'), (select id from j where k = 'rev')) and a.code = '6100'),
  0::numeric, 'LED-09 · net effect on Rent is zero');
select throws_like($$ select public.reverse_journal((select id from j where k = 'led01'), 'again') $$,
  'Only posted journals can be reversed%', 'LED-09 · a journal can only be reversed once');
select throws_like($$ select public.reverse_journal((select id from j where k = 'rev'), 'undo') $$,
  'A reversal cannot itself be reversed%', 'LED-09 · a reversal cannot be reversed');
select tests.login('acct@test.local');
select throws_ok($$ select public.reverse_journal((select id from j where k = 'rev'), 'x') $$, '42501', null,
  'Firm Accountant cannot reverse a journal');

-- LED-10 / LED-11 / RBAC-08 / RBAC-09 · period lock and reopen
select tests.login('acct@test.local');
select throws_ok($$ select public.lock_period((select id from public.accounting_periods
  where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-04-01')) $$, '42501', null,
  'Firm Accountant cannot lock a period');
insert into j values ('apr', tests.draft('April', '2026-04-20',
  '[{"n":1,"acct":"6100","dr":2000,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":2000}]'));
select tests.login('admin2@test.local');
select public.lock_period((select id from public.accounting_periods
  where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-04-01'), 'April closed');
select throws_like($$ select public.post_journal((select id from j where k = 'apr')) $$,
  'The period containing 2026-04-20 is locked%', 'LED-10 / RBAC-08 · posting into a locked period rejected');
select throws_like($$ select public.reopen_period((select id from public.accounting_periods
  where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-04-01'), '') $$,
  'A reason is required%', 'RBAC-09 · reopening without a reason rejected');
select throws_ok($$ update public.accounting_periods set status = 'open'
  where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-04-01' $$, '42501', null,
  'A period cannot be reopened by a direct update');
select public.reopen_period((select id from public.accounting_periods
  where organization_id = (select id from fx where k = 'orgA') and start_date = '2026-04-01'), 'Late supplier invoice');
select is((select reason from public.audit_log where table_name = 'accounting_periods' and action = 'reopen_period'
            order by id desc limit 1), 'Late supplier invoice', 'LED-11 · reopen audit-logged with the reason');
select tests.login('super@test.local');
select lives_ok($$ select public.post_journal((select id from j where k = 'apr')) $$,
  'LED-11 · posting works again after reopening');

-- LED-12 · unknown or inactive account
update public.accounts set is_active = false
 where organization_id = (select id from fx where k = 'orgA') and code = '6150';
select tests.login('acct@test.local');
select throws_like($$ select tests.draft('Inactive', '2026-05-01',
  '[{"n":1,"acct":"6150","dr":100,"cr":0},{"n":2,"acct":"2010","dr":0,"cr":100}]') $$,
  'Account is inactive%', 'LED-12 · inactive account rejected');
select throws_ok($$ insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  values ((select id from j where k = 'led02'), (select id from fx where k = 'orgA'), 9, gen_random_uuid(), 1, 0) $$,
  '23503', null, 'LED-12 · unknown account rejected');

-- DM-01 · an account of another client
select throws_ok($$ insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
  values ((select id from j where k = 'led02'), (select id from fx where k = 'orgA'), 9,
          tests.acct((select id from fx where k = 'orgB'), '6100'), 1, 0) $$,
  '23503', null, 'DM-01 · line using another client''s account rejected');

-- LED-14 / SEC-17 · audit trail written and append-only
reset role;
select set_config('request.jwt.claims', '', true);
select ok((select count(*) from public.audit_log where action = 'post_journal' and table_name = 'journals') >= 3,
  'LED-14 · posting is audit-logged');
select ok(exists (select 1 from public.audit_log where action = 'reverse_journal' and reason = 'Booked twice'),
  'LED-14 · reversal audit-logged with the reason');
select ok(exists (select 1 from public.audit_log where action = 'lock_period' and actor_id = tests.uid('admin2@test.local')),
  'LED-14 · lock audit-logged with the actor');
select throws_ok($$ update public.audit_log set reason = 'tampered' $$, '42501', null,
  'SEC-17 · audit rows cannot be edited, even by the database owner');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'SEC-17 · audit rows cannot be deleted');

-- NUM-* · document numbering (D-22): one running counter per client and type
select is(app.next_document_number((select id from fx where k = 'orgB'), 'sales_invoice', '2026-10-03'),
  'INV-2026-10-0001', 'NUM-01 · first October invoice');
select is(app.next_document_number((select id from fx where k = 'orgB'), 'sales_invoice', '2026-10-09'),
  'INV-2026-10-0002', 'NUM-02 · second October invoice');
select is(app.next_document_number((select id from fx where k = 'orgB'), 'sales_invoice', '2026-11-01'),
  'INV-2026-11-0003', 'NUM-03 · November continues the counter');
select is(app.next_document_number((select id from fx where k = 'orgB'), 'sales_invoice', '2026-10-31'),
  'INV-2026-10-0004', 'NUM-04 · back-dated October document takes the next counter, its own month');
select is(app.next_document_number((select id from fx where k = 'orgB'), 'sales_invoice', '2027-01-02'),
  'INV-2027-01-0005', 'NUM-08 · counter continues into a new year');
select is(app.next_document_number((select id from fx where k = 'orgC'), 'sales_invoice', '2026-10-03'),
  'INV-2026-10-0001', 'NUM-07 / DM-03 · another client has its own counter');
select is(app.format_doc_number('{PREFIX}-{YYYY}-{MM}-{SEQ:4}', 'INV', '2026-01-31', 10000),
  'INV-2026-01-10000', 'Counter grows past four digits instead of being cut');
-- NUM-06: a deleted draft never consumed a number (journals numbered 0001…0004 above, no gaps)
select is((select string_agg(journal_no, ',' order by journal_no) from public.journals
            where organization_id = (select id from fx where k = 'orgA') and journal_no is not null),
  'JV-2026-01-0001,JV-2026-02-0002,JV-2026-02-0003,JV-2026-03-0004,JV-2026-04-0005',
  'NUM-06 · posted journals are numbered without gaps despite rejected and draft journals');

select * from finish();
rollback;
