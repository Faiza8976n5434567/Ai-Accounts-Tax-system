-- Trial balance and general ledger (P1-15 · LED-13 · Spec 01 §5). Amounts in fils.
-- Fixture: client A already has JV-2026-01-0001 (15 Jan): Dr 6100 Rent 1,000 / Cr 2010 Accruals 1,000.
begin;
\ir fixtures/setup.psql
select plan(14);

create temp table rj (k text primary key, id uuid) on commit drop;
grant all on rj to authenticated;
create function tests.lines7(variadic p text[]) returns jsonb language sql stable security definer as $$
  select jsonb_agg(jsonb_build_object('account_id', tests.acct((select id from fx where k = 'orgA'), split_part(x, ':', 1)),
                                      'debit', split_part(x, ':', 2)::bigint, 'credit', split_part(x, ':', 3)::bigint))
  from unnest(p) x
$$;
grant execute on function tests.lines7(text[]) to authenticated;

-- Opening balances (1 Jan), a February accrual, its reversal in March, and a draft that must not count
select tests.login('acct@test.local');
insert into rj values ('open', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-01-01', 'Opening', 'opening',
  tests.lines7('1010:5000000:0', '3000:0:5000000')));
insert into rj values ('feb', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-02-10', 'Feb rent', 'manual',
  tests.lines7('6100:50000:0', '2010:0:50000')));
insert into rj values ('draft', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-03-20', 'Not posted', 'manual',
  tests.lines7('6100:999900:0', '2010:0:999900')));
update public.journals set status = 'pending' where id in ((select id from rj where k = 'open'), (select id from rj where k = 'feb'));
select tests.login('admin2@test.local');
select public.post_journal((select id from rj where k = 'open'));
select public.post_journal((select id from rj where k = 'feb'));
insert into rj values ('rev', public.reverse_journal((select id from rj where k = 'feb'), 'Duplicate', '2026-03-05'));
select tests.login('super@test.local');
select public.post_journal((select id from rj where k = 'rev'));

create temp table tb on commit drop as
  select * from public.trial_balance((select id from fx where k = 'orgA'), '2026-02-01', '2026-03-31');
grant select on tb to authenticated;

select is((select string_agg(code || ' ' || opening || '/' || debit || '/' || credit || '/' || closing, '; ' order by code) from tb),
  '1010 5000000/0/0/5000000; 2010 -100000/50000/50000/-100000; 3000 -5000000/0/0/-5000000; 6100 100000/50000/50000/100000',
  'Trial balance Feb–Mar: openings from January, movements in the range, closings (drafts excluded)');
select is((select sum(opening) from tb), 0::numeric, 'Openings balance');
select is((select (sum(debit) = sum(credit))::text from tb), 'true', 'Debits equal credits in the period');
select is((select sum(closing) from tb), 0::numeric, 'Closing balances net to zero');
select is((select closing from tb where code = '6100'), 100000::bigint,
  'LED-09 · a reversed journal and its reversal cancel out (only January rent remains)');
select is((select count(*)::int from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31') where code = '6100' and debit = 1149900),
  0, 'The draft journal (9,999.00) is never counted');

-- General ledger with running balance and drill-down to the journal
create temp table gl on commit drop as
  select * from public.general_ledger((select id from fx where k = 'orgA'), tests.acct((select id from fx where k = 'orgA'), '6100'), '2026-02-01', '2026-03-31');
select is((select string_agg(row_kind || ' ' || coalesce(journal_no, '-') || ' ' || coalesce(debit, 0) || '/' || coalesce(credit, 0) || ' = ' || balance, '; ' order by row_kind desc, entry_date, journal_no) from gl),
  'opening - 0/0 = 100000; line JV-2026-02-0003 50000/0 = 150000; line JV-2026-03-0004 0/50000 = 100000',
  'General ledger: balance brought forward, then each posting with a running balance');
select ok((select bool_and(journal_id is not null) from gl where row_kind = 'line'), 'Every ledger line links to its journal (drill-down)');
select is((select balance from gl order by row_kind desc, entry_date desc, journal_no desc limit 1),
  (select closing from tb where code = '6100'), 'Ledger closing balance equals the trial balance');

-- Access: reports follow RLS
select tests.login('acct2@test.local');
select is((select count(*)::int from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')), 0,
  'An unassigned accountant gets an empty trial balance');
select tests.login('staff@test.local');
select ok((select count(*) from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31')) > 0,
  'Client staff can see their own company''s trial balance');
select tests.anon();
select throws_ok($$ select * from public.trial_balance((select id from fx where k = 'orgA'), '2026-01-01', '2026-12-31') $$, '42501', null,
  'Anonymous users cannot run reports');

-- LED-13 · 200 random balanced journals: the trial balance always balances
reset role;
select set_config('request.jwt.claims', '', true);
select setseed(0.42);
do $$
declare
  v_org uuid := (select id from fx where k = 'orgB');
  v_acc uuid[] := array(select id from public.accounts where organization_id = v_org and not is_control and is_active);
  v_j uuid; v_n int; v_total bigint; v_amt bigint;
begin
  for i in 1..200 loop
    insert into public.journals (organization_id, entry_date, memo) values (v_org, date '2026-01-01' + (random() * 360)::int, 'random ' || i)
    returning id into v_j;
    v_n := 2 + (random() * 3)::int; v_total := 0;
    for k in 1..v_n - 1 loop
      v_amt := 1 + (random() * 9999999)::bigint;
      v_total := v_total + v_amt;
      insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
      values (v_j, v_org, k, v_acc[1 + (random() * (array_length(v_acc, 1) - 1))::int], v_amt, 0);
    end loop;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit)
    values (v_j, v_org, v_n, v_acc[1 + (random() * (array_length(v_acc, 1) - 1))::int], 0, v_total);
    perform app.set_ctx('post_journal');
    update public.journals set status = 'posted', journal_no = app.next_document_number(v_org, 'journal', entry_date),
           posted_at = now(), approved_by = tests.uid('admin2@test.local') where id = v_j;
    perform app.set_ctx(null);
  end loop;
end $$;
create temp table tb2 on commit drop as select * from public.trial_balance((select id from fx where k = 'orgB'), '2026-01-01', '2026-12-31');
select ok((select sum(debit) = sum(credit) and sum(closing) = 0 and count(*) > 10 from tb2),
  'LED-13 · after 200 random journals, total debits = total credits and balances net to zero');
select is((select count(*)::int from public.journals where organization_id = (select id from fx where k = 'orgB') and status = 'posted'), 200,
  'All 200 random journals were posted through the balance check');

select * from finish();
rollback;
