-- Journal workflow used by the screens (P1-14): drafts, submit, send back, opening balances,
-- cancelling a reversal request, and the permission list that drives the buttons.
begin;
\ir fixtures/setup.psql
select plan(18);

create temp table jj (k text primary key, id uuid) on commit drop;
grant all on jj to authenticated;
create function tests.lines(p_org text, variadic p text[]) returns jsonb language sql stable security definer as $$
  -- each item 'code:debit:credit' in fils
  select jsonb_agg(jsonb_build_object('account_id', tests.acct((select id from fx where k = p_org), split_part(x, ':', 1)),
                                      'debit', split_part(x, ':', 2)::bigint, 'credit', split_part(x, ':', 3)::bigint))
  from unnest(p) x
$$;
grant execute on function tests.lines(text, text[]) to authenticated;

-- Draft in one call; editing replaces the lines
select tests.login('acct@test.local');
insert into jj values ('d', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-05-10', 'Office supplies',
  'manual', tests.lines('orgA', '6180:25000:0', '2010:0:25000')));
select is((select (status::text, prepared_by = tests.uid('acct@test.local'))::text from public.journals where id = (select id from jj where k = 'd')),
  '(draft,t)', 'Draft saved with its preparer');
select is((select count(*)::int from public.journal_lines where journal_id = (select id from jj where k = 'd')), 2, 'Two lines saved');
select public.save_journal_draft((select id from jj where k = 'd'), (select id from fx where k = 'orgA'), '2026-05-11', 'Office supplies (corrected)',
  'manual', tests.lines('orgA', '6180:20000:0', '6110:5000:0', '2010:0:25000'));
select is((select string_agg(line_no || ':' || debit || '/' || credit, ' ' order by line_no) from public.journal_lines where journal_id = (select id from jj where k = 'd')),
  '1:20000/0 2:5000/0 3:0/25000', 'Editing replaces all lines in one step');
select throws_ok($$ select public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-05-10', 'x', 'manual',
  '[{"account_id":"00000000-0000-0000-0000-000000000000","debit":"1000.5","credit":0}]'::jsonb) $$, '22P02', null,
  'LED-06 · a fraction of a fils is refused');
select throws_like($$ select public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-05-10', 'x', 'sale', '[]'::jsonb) $$,
  'Only manual and opening journals%', 'Document journals (sales, purchases…) are not entered by hand');
select throws_ok($$ select public.save_journal_draft(null, (select id from fx where k = 'orgB'), '2026-05-10', 'x', 'manual', '[]'::jsonb) $$,
  '42501', null, 'Cannot create a journal for a client you are not assigned to');

-- Submit → send back with a reason → preparer unchanged
update public.journals set status = 'pending' where id = (select id from jj where k = 'd');
select tests.login('admin2@test.local');
select throws_like($$ select public.reject_journal((select id from jj where k = 'd'), ' ') $$,
  'A reason is required%', 'Sending back needs a reason');
select public.reject_journal((select id from jj where k = 'd'), 'Attach the supplier invoice');
select is((select (status::text, prepared_by = tests.uid('acct@test.local'))::text from public.journals where id = (select id from jj where k = 'd')),
  '(draft,t)', 'Sent back to draft; the accountant is still the preparer');
select ok(exists (select 1 from public.audit_log where action = 'reject_journal' and reason = 'Attach the supplier invoice'),
  'Sending back is audit-logged with the reason');
select tests.login('acct@test.local');
update public.journals set status = 'pending' where id = (select id from jj where k = 'd');
select throws_ok($$ select public.reject_journal((select id from jj where k = 'd'), 'no') $$, '42501', null,
  'A Firm Accountant cannot send journals back');
select tests.login('admin2@test.local');
select is(public.post_journal((select id from jj where k = 'd')), 'JV-2026-05-0002', 'The admin who sent it back can approve the corrected journal');

-- Editing a pending journal returns it to draft
select tests.login('acct@test.local');
insert into jj values ('p', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-05-12', 'Fuel', 'manual',
  tests.lines('orgA', '6060:3000:0', '2010:0:3000')));
update public.journals set status = 'pending' where id = (select id from jj where k = 'p');
select public.save_journal_draft((select id from jj where k = 'p'), (select id from fx where k = 'orgA'), '2026-05-12', 'Fuel', 'manual',
  tests.lines('orgA', '6060:3500:0', '2010:0:3500'));
select is((select status::text from public.journals where id = (select id from jj where k = 'p')), 'draft', 'Editing a pending journal returns it to draft');

-- Opening balances may use control accounts (bank, receivables, VAT); manual journals may not
insert into jj values ('o', public.save_journal_draft(null, (select id from fx where k = 'orgA'), '2026-01-01', 'Opening balances', 'opening',
  tests.lines('orgA', '1010:5000000:0', '1100:1200000:0', '2000:0:700000', '3000:0:5500000')));
update public.journals set status = 'pending' where id = (select id from jj where k = 'o');
select tests.login('admin2@test.local');
select lives_ok($$ select public.post_journal((select id from jj where k = 'o')) $$, 'Opening journal with bank, receivables and payables posts');
select is((select source::text from public.journals where id = (select id from jj where k = 'o')), 'opening', 'Recorded as an opening journal');

-- Rejecting a reversal request cancels it
select tests.login('admin2@test.local');
insert into jj values ('r', public.reverse_journal((select id from jj where k = 'd'), 'Wrong month', '2026-06-01'));
select tests.login('super@test.local');
select public.reject_journal((select id from jj where k = 'r'), 'Month is correct — keep it');
select ok(not exists (select 1 from public.journals where id = (select id from jj where k = 'r'))
          and (select status::text from public.journals where id = (select id from jj where k = 'd')) = 'posted',
  'Rejected reversal request is cancelled; the original stays posted');

-- Permissions that drive the buttons
select tests.login('admin2@test.local');
select ok(public.my_permissions((select id from fx where k = 'orgA')) @> array['post_journal', 'reverse_journal', 'lock_period', 'manage_coa'],
  'Firm Admin may post, reverse, lock and manage the chart');
select tests.login('acct@test.local');
select ok(not (public.my_permissions((select id from fx where k = 'orgA')) && array['post_journal', 'reverse_journal', 'lock_period']),
  'Firm Accountant may not post, reverse or lock');
select tests.login('admin2@test.local', 'aal1');
select is(public.my_permissions((select id from fx where k = 'orgA')), '{}'::text[], 'Without two-factor: no permissions');

select * from finish();
rollback;
