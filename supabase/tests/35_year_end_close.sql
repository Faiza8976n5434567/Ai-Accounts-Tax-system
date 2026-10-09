-- P5-05 · Year-end close (D-75 → D-77, PLAN §6.6c YE-01 → YE-08). One client, FY 2025 (Jan–Dec). Amounts in fils.
begin;
\ir fixtures/setup.psql
select plan(21);

create temp table ye (k text primary key, id uuid) on commit drop;
grant all on ye to authenticated;
insert into ye values ('org', tests.new_client((select id from fx where k = 'tfs'), 'Year End LLC', 2025));
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values ((select id from ye where k = 'org'), 'ct', '2025-01-01', '2025-12-31', '2026-09-30');

-- Dr p_dr / Cr p_cr; prepared by one admin, posted by another (p_post = false leaves it waiting)
create function tests.ye_jv(p_key text, p_date date, p_dr text, p_cr text, p_amount bigint, p_post boolean default true) returns void language plpgsql as $$
declare v_org uuid := (select id from ye where k = 'org'); v_id uuid;
begin
  perform tests.login('admin2@test.local');
  insert into public.journals (organization_id, entry_date, memo) values (v_org, p_date, p_key) returning id into v_id;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
    (v_id, v_org, 1, tests.acct(v_org, p_dr), p_amount, 0), (v_id, v_org, 2, tests.acct(v_org, p_cr), 0, p_amount);
  insert into ye values (p_key, v_id);
  if p_post then perform tests.login('super@test.local'); perform public.post_journal(v_id); end if;
end $$;
create function tests.ye_lines(p_close text) returns text language sql security definer as $$
  select string_agg(a.code || ':' || l.debit || '/' || l.credit, ' ' order by l.line_no) from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = (select journal_id from public.year_closes where id = (select id from ye where k = p_close))
$$;
create function tests.ye_check(p_code text) returns text language sql as $$
  select (c ->> 'ok') from jsonb_array_elements(public.year_end_status((select id from ye where k = 'org'), '2025-12-31') -> 'checks') c where c ->> 'code' = p_code
$$;
grant execute on all functions in schema tests to authenticated;

select tests.ye_jv('sales', '2025-03-31', '1150', '4000', 100000000);   -- revenue 1,000,000
select tests.ye_jv('rent', '2025-06-30', '6100', '1150', 40000000);     -- expenses 400,000
select tests.ye_jv('next', '2026-02-28', '1150', '4000', 5000000);      -- next year's revenue 50,000
select tests.ye_jv('waiting', '2025-12-15', '6100', '1150', 10000000, false);

-- YE-01 · the checklist
select tests.login('admin2@test.local');
select is(tests.ye_check('journals'), 'false', 'YE-01 · a journal waiting in the year is flagged');
select is((public.year_end_status((select id from ye where k = 'org'), '2025-12-31') ->> 'ready'), 'false', 'YE-01 · …and blocks the close');
select throws_like($$ select public.close_year((select id from ye where k = 'org'), '2025-12-31') $$, '%cannot be closed yet%No journals waiting%', 'YE-01 · close_year refuses and says why');
select tests.login('super@test.local');
select public.post_journal((select id from ye where k = 'waiting'));
select tests.login('admin2@test.local');
select is(tests.ye_check('ct_return'), 'false', 'YE-01 · a missing CT return is a warning…');
select is((public.year_end_status((select id from ye where k = 'org'), '2025-12-31') ->> 'ready'), 'true', 'YE-01 · …that does not block');
select throws_like($$ select public.close_year((select id from ye where k = 'org'), '2026-12-31') $$, '%has not ended%', 'YE-02 · a year still running cannot be closed');
select throws_like($$ select public.close_year((select id from ye where k = 'org'), '2025-11-30') $$, '%not the end of a financial year%', 'YE-02 · only a real year end');

-- YE-03 · the closing journal: income and expenses to nil, profit 500,000 to retained earnings
insert into ye values ('c1', public.close_year((select id from ye where k = 'org'), '2025-12-31'));
select is(tests.ye_lines('c1'), '4000:100000000/0 6100:0/50000000 3200:0/50000000', 'YE-03 · Dr revenue 1,000,000 / Cr expenses 500,000 / Cr retained earnings 500,000');
select throws_like($$ select public.close_year((select id from ye where k = 'org'), '2025-12-31') $$, '%already waiting%', 'YE-03 · one closing journal at a time');
select throws_like($$ update public.journal_lines set credit = credit + 1 where journal_id = (select journal_id from public.year_closes where id = (select id from ye where k = 'c1')) and line_no = 3 $$,
          '%built by the app%', 'YE-03 · the closing journal cannot be edited by hand');
select throws_ok($$ select public.complete_year_close((select id from ye where k = 'c1')) $$, '42501', null, 'YE-04 · the preparer cannot approve the close (maker-checker)');
-- figures change while the close waits → refused; cancel and close again
select tests.ye_jv('late', '2025-12-20', '6100', '1150', 1000000);
select tests.login('super@test.local');
select throws_like($$ select public.complete_year_close((select id from ye where k = 'c1')) $$, '%figures changed%', 'YE-04 · a close prepared on old figures cannot be approved');
select tests.login('admin2@test.local');
select public.cancel_year_close((select id from ye where k = 'c1'));
insert into ye values ('c2', public.close_year((select id from ye where k = 'org'), '2025-12-31'));
select tests.login('super@test.local');
select ok(public.complete_year_close((select id from ye where k = 'c2')) like 'JV-2025-12-%', 'YE-04 · another Firm Admin approves: the closing journal is posted…');
select is((select count(*)::int from public.accounting_periods where organization_id = (select id from ye where k = 'org') and start_date between '2025-01-01' and '2025-12-31' and status = 'locked'), 12,
          'YE-04 · …and all 12 months of the year are locked');

-- YE-05 · reports still show the year
select is((select sum(case when type = 'revenue' then amount else -amount end)::bigint from public.profit_and_loss((select id from ye where k = 'org'), '2025-01-01', '2025-12-31')), 49000000::bigint,
          'YE-05 · the P&L for 2025 still shows profit 490,000 (closing journal ignored)');
select is((select amount from public.balance_sheet((select id from ye where k = 'org'), '2025-12-31') where row_kind = 'current_year_result'), 49000000::bigint,
          'YE-05 · balance sheet at 31 Dec 2025 shows profit for the year 490,000, not yet in retained earnings');
select is((select string_agg(coalesce(code, row_kind) || ':' || amount, ' ' order by coalesce(code, row_kind)) from public.balance_sheet((select id from ye where k = 'org'), '2026-06-30') where section = 'equity'),
          '3200:49000000 current_year_result:5000000', 'YE-06 · in 2026 the 2025 result sits in 3200 Retained earnings; no "earlier years not closed" line');
select is((select sum(case when section = 'assets' then amount else -amount end)::bigint from public.balance_sheet((select id from ye where k = 'org'), '2026-06-30')), 0::bigint,
          'RPT-01 · the balance sheet still balances after the close');
select is((public.ct_return_preview((select id from public.tax_periods where organization_id = (select id from ye where k = 'org') and kind = 'ct')) ->> 'accounting_profit'), '49000000',
          'YE-07 · the Corporate Tax computation ignores the closing journal');

-- YE-08 · reopened and changed → closing again posts only the difference
select tests.login('super@test.local');
select public.reopen_period((select id from public.accounting_periods where organization_id = (select id from ye where k = 'org') and start_date = '2025-12-01'), 'Audit adjustment');
select tests.ye_jv('audit', '2025-12-31', '6100', '1150', 500000);
select is((public.year_end_status((select id from ye where k = 'org'), '2025-12-31') ->> 'net_result'), '-500000', 'YE-08 · after the audit adjustment 5,000 is left to close');
select tests.login('admin2@test.local');
insert into ye values ('c3', public.close_year((select id from ye where k = 'org'), '2025-12-31'));
select is(tests.ye_lines('c3'), '6100:0/500000 3200:500000/0', 'YE-08 · the second closing journal moves only the 5,000 difference');

select * from finish();
rollback;
