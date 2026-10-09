-- P5-05 · Year-end close (D-75 → D-77).
--   • Checklist for a financial year: blocking — no journals, invoices, bills or payments waiting; depreciation run and
--     approved to the year end. Warnings — bank reconciled to the year end, VAT returns approved, CT return approved,
--     CT expense booked (the accountant posts the CT journal, D-76). Accruals / prepayments are plain journals (D-77).
--   • Closing journal (D-75, Faizan: traditional close): dated the year end, every income and expense account to nil and
--     the result to 3200 Retained earnings; prepared by one person, approved by a Firm Admin other than the preparer,
--     which also locks every month of the year. If the year is reopened and changed, closing again posts the difference.
--     It may post into a month already locked by a VAT approval (it touches only income, expenses and equity).
--   • Reports keep showing the year: profit & loss and the Corporate Tax computation ignore closing journals; the balance
--     sheet ignores a closing journal of the current year (so "profit for the year" stays visible) and includes earlier
--     years' (so their results sit in retained earnings). The trial balance and ledgers include it (post-closing).

-- ── Year-end close ───────────────────────────────────────────────────────────────────────
alter type public.journal_source add value if not exists 'closing';

create table public.year_closes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  fy_start date not null,
  fy_end date not null check (fy_end > fy_start),
  journal_id uuid not null unique references public.journals (id) on delete restrict,
  net_result bigint not null,                                       -- profit (+) / loss (−) moved to retained earnings
  unique (id, organization_id)
);
select app.setup_table('public.year_closes');
create index year_closes_org_idx on public.year_closes (organization_id, fy_end);
create policy mfa on public.year_closes as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.year_closes for select to authenticated using (organization_id in (select app.orgs_with('view')));
grant select on public.year_closes to authenticated;
create or replace function app.year_closes_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.ctx() is distinct from 'year_close' then raise exception 'Use the Year-end screen' using errcode = 'insufficient_privilege'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before insert or update or delete on public.year_closes for each row execute function app.year_closes_guard();

-- The financial year ending on p_fy_end (start = the day after the previous year end, from the client's FY start month).
create or replace function app.fy_bounds(p_org uuid, p_fy_end date) returns daterange
language plpgsql stable security definer set search_path = '' as $$
declare v_month int; v_start date;
begin
  select fy_start_month into v_month from public.organizations where id = p_org;
  v_start := public.fy_start_of(p_fy_end, v_month);
  if (v_start + interval '1 year - 1 day')::date <> p_fy_end then
    raise exception '% is not the end of a financial year of this client', p_fy_end using errcode = 'check_violation';
  end if;
  return daterange(v_start, p_fy_end, '[]');
end $$;

-- Each income and expense account's balance for the year as the ledger holds it (earlier closing journals included),
-- i.e. what a closing journal has to clear. Debit − credit.
create or replace function app.year_pl_balances(p_org uuid, p_from date, p_to date)
returns table (account_id uuid, code text, name text, dc bigint)
language sql stable security definer set search_path = '' as $$
  select a.id, a.code, a.name, sum(l.debit - l.credit)::bigint
  from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and j.status in ('posted', 'reversed') and j.entry_date between p_from and p_to and a.type in ('revenue', 'expense')
  group by a.id, a.code, a.name having sum(l.debit - l.credit) <> 0
$$;

-- The checklist (D-75): blocking items stop the close; warnings are shown for the reviewer.
create or replace function app.year_end_status(p_org uuid, p_fy_end date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r daterange := app.fy_bounds(p_org, p_fy_end); v_from date := lower(r); v_to date := upper(r) - 1;
  v_checks jsonb := '[]'; v_n int; v_txt text; v_lines jsonb; v_net bigint; v_ct public.ct_returns; v_ct_exp bigint;
begin
  perform app.require(p_org, 'view');
  -- B1 journals waiting
  select count(*), string_agg(coalesce(memo, 'journal') || ' (' || to_char(entry_date, 'DD Mon') || ')', '; ' order by entry_date) into v_n, v_txt
  from (select memo, entry_date from public.journals where organization_id = p_org and status in ('draft', 'pending') and entry_date between v_from and v_to
          and source::text <> 'closing' limit 20) x;
  v_checks := v_checks || jsonb_build_object('code', 'journals', 'label', 'No journals waiting (drafts or for approval) in the year', 'blocking', true, 'ok', v_n = 0,
    'detail', case when v_n > 0 then v_n || ' waiting: ' || v_txt end);
  -- B2 documents waiting
  select (select count(*) from public.sales_invoices where organization_id = p_org and status <> 'posted' and issue_date between v_from and v_to)
       + (select count(*) from public.purchase_bills where organization_id = p_org and status <> 'posted' and bill_date between v_from and v_to)
       + (select count(*) from public.payments where organization_id = p_org and status <> 'posted' and payment_date between v_from and v_to) into v_n;
  v_checks := v_checks || jsonb_build_object('code', 'documents', 'label', 'No invoices, bills or payments waiting in the year', 'blocking', true, 'ok', v_n = 0,
    'detail', case when v_n > 0 then v_n || ' document(s) still draft or waiting for approval' end);
  -- B3 depreciation charged to the year end
  select count(*), string_agg(a.asset_no, ', ') into v_n, v_txt from public.fixed_assets a
   where a.organization_id = p_org and a.purchase_date <= v_to and app.asset_accum_due(a.id, v_to) > app.asset_accum_charged(a.id);
  v_checks := v_checks || jsonb_build_object('code', 'depreciation', 'label', 'Depreciation run and approved up to the year end', 'blocking', true, 'ok', v_n = 0,
    'detail', case when v_n > 0 then 'Not yet charged to ' || to_char(v_to, 'Mon YYYY') || ': ' || v_txt end);
  -- W1 bank reconciliations
  select count(*), string_agg(b.name, ', ') into v_n, v_txt from public.bank_accounts b
   where b.organization_id = p_org and b.is_active
     and not exists (select 1 from public.bank_reconciliations x where x.bank_account_id = b.id and x.status = 'posted' and x.period_end >= v_to);
  v_checks := v_checks || jsonb_build_object('code', 'bank', 'label', 'Bank accounts reconciled to the year end', 'blocking', false, 'ok', v_n = 0,
    'detail', case when v_n > 0 then 'Not reconciled to ' || to_char(v_to, 'DD Mon YYYY') || ': ' || v_txt end);
  -- W2 VAT returns
  select count(*), string_agg(to_char(t.start_date, 'Mon') || '–' || to_char(t.end_date, 'Mon YYYY'), ', ' order by t.start_date) into v_n, v_txt
  from public.tax_periods t where t.organization_id = p_org and t.kind = 'vat' and t.end_date between v_from and v_to
    and not exists (select 1 from public.vat_returns v where v.tax_period_id = t.id and v.status in ('approved', 'filed'));
  v_checks := v_checks || jsonb_build_object('code', 'vat', 'label', 'VAT returns of the year approved', 'blocking', false, 'ok', v_n = 0,
    'detail', case when v_n > 0 then 'Not approved: ' || v_txt end);
  -- W3 Corporate Tax return and its journal (D-76: posted by the accountant)
  select c.* into v_ct from public.ct_returns c join public.tax_periods t on t.id = c.tax_period_id
   where c.organization_id = p_org and t.kind = 'ct' and t.end_date = v_to;
  v_checks := v_checks || jsonb_build_object('code', 'ct_return', 'label', 'Corporate Tax return approved', 'blocking', false,
    'ok', coalesce(v_ct.status in ('approved', 'filed'), false), 'detail', case when v_ct.id is null then 'Not started' when v_ct.status = 'draft' then 'Still a draft' end);
  select coalesce(sum(dc), 0) into v_ct_exp from app.year_pl_balances(p_org, v_from, v_to) b join public.accounts a on a.id = b.account_id where a.subtype = 'ct_expense';
  v_checks := v_checks || jsonb_build_object('code', 'ct_journal', 'label', 'Corporate Tax expense booked (Dr 7000 / Cr 2200, by journal)', 'blocking', false,
    'ok', coalesce((v_ct.snapshot ->> 'ct_payable')::bigint, 0) = 0 or v_ct_exp <> 0,
    'detail', case when coalesce((v_ct.snapshot ->> 'ct_payable')::bigint, 0) > 0 and v_ct_exp = 0
                   then 'The approved return shows CT payable of AED ' || to_char((v_ct.snapshot ->> 'ct_payable')::bigint / 100.0, 'FM999,999,999,990.00') || ' — post its journal before closing' end);

  select coalesce(jsonb_agg(jsonb_build_object('account_id', account_id, 'code', code, 'name', name, 'dc', dc) order by code), '[]'), coalesce(-sum(dc), 0)
    into v_lines, v_net from app.year_pl_balances(p_org, v_from, v_to);
  return jsonb_build_object('fy_start', v_from, 'fy_end', v_to, 'ended', v_to < current_date, 'checks', v_checks,
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where (c ->> 'blocking')::boolean and not (c ->> 'ok')::boolean),
    'to_close', v_lines, 'net_result', v_net,
    'closes', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'journal_id', y.journal_id, 'journal_no', j.journal_no, 'status', j.status, 'net_result', y.net_result,
                         'created_at', y.created_at, 'prepared_by', j.prepared_by) order by y.created_at)
                        from public.year_closes y join public.journals j on j.id = y.journal_id where y.organization_id = p_org and y.fy_end = v_to), '[]'),
    'periods', (select jsonb_build_object('total', count(*), 'locked', count(*) filter (where status = 'locked'))
                from public.accounting_periods where organization_id = p_org and start_date >= v_from and end_date <= v_to));
end $$;

-- Step 1 (preparer): the closing journal — every income and expense account to nil, the result to retained earnings.
create or replace function app.close_year(p_org uuid, p_fy_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_org, 'prepare'); r daterange := app.fy_bounds(p_org, p_fy_end); v_to date := upper(r) - 1;
  v_status jsonb; v_j uuid; v_net bigint; v_n int := 0; b record; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('year_close:' || p_org::text));
  if v_to >= current_date then raise exception 'The financial year has not ended yet' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.year_closes y join public.journals j on j.id = y.journal_id
             where y.organization_id = p_org and y.fy_end = v_to and j.status in ('draft', 'pending')) then
    raise exception 'A closing journal for this year is already waiting for approval' using errcode = 'check_violation';
  end if;
  v_status := app.year_end_status(p_org, v_to);
  if not (v_status ->> 'ready')::boolean then
    raise exception 'The year cannot be closed yet: %', (select string_agg(c ->> 'label', '; ') from jsonb_array_elements(v_status -> 'checks') c
                                                          where (c ->> 'blocking')::boolean and not (c ->> 'ok')::boolean) using errcode = 'check_violation';
  end if;
  if jsonb_array_length(v_status -> 'to_close') = 0 then raise exception 'Nothing to close — every income and expense account is already nil for the year' using errcode = 'check_violation'; end if;
  v_net := (v_status ->> 'net_result')::bigint;
  perform app.set_ctx('year_close');
  insert into public.journals (organization_id, entry_date, memo, source, status, prepared_by)
  values (p_org, v_to, 'Year-end closing ' || to_char(lower(r), 'DD Mon YYYY') || ' – ' || to_char(v_to, 'DD Mon YYYY'), 'closing', 'pending', v_uid) returning id into v_j;
  for b in select * from app.year_pl_balances(p_org, lower(r), v_to) order by code loop
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, description)
    values (v_j, p_org, v_n, b.account_id, greatest(-b.dc, 0), greatest(b.dc, 0), 'Close ' || b.code || ' ' || b.name);
  end loop;
  if v_net <> 0 then
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, description)
    values (v_j, p_org, v_n + 1, app.subtype_account(p_org, 'retained_earnings'), greatest(-v_net, 0), greatest(v_net, 0),
            case when v_net >= 0 then 'Profit for the year to retained earnings' else 'Loss for the year to retained earnings' end);
  end if;
  insert into public.year_closes (organization_id, fy_start, fy_end, journal_id, net_result) values (p_org, lower(r), v_to, v_j, v_net) returning id into v_id;
  perform app.set_ctx(null);
  return v_id;
end $$;

-- Step 2 (a Firm Admin other than the preparer): approve the closing journal and lock every month of the year.
create or replace function app.complete_year_close(p_close uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare y public.year_closes; v_uid uuid; v_no text; v_now bigint; p record;
begin
  select * into y from public.year_closes where id = p_close for update;
  if y.id is null then raise exception 'Year close not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(y.organization_id, 'lock_period');
  select coalesce(-sum(dc), 0) into v_now from app.year_pl_balances(y.organization_id, y.fy_start, y.fy_end);
  if v_now <> y.net_result then
    raise exception 'The year''s figures changed after the closing journal was prepared — cancel it and close again' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.journals where organization_id = y.organization_id and status in ('draft', 'pending') and entry_date between y.fy_start and y.fy_end and id <> y.journal_id) then
    raise exception 'Journals of the year are waiting — finish them first' using errcode = 'check_violation';
  end if;
  v_no := app.post_journal(y.journal_id);                                    -- maker-checker and permissions as for any journal
  perform set_config('app.reason', 'Year-end close', true);
  for p in select id from public.accounting_periods where organization_id = y.organization_id and start_date >= y.fy_start and end_date <= y.fy_end and status = 'open' loop
    perform app.lock_period(p.id, 'Year-end close');
  end loop;
  return v_no;
end $$;

create or replace function app.cancel_year_close(p_close uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare y public.year_closes; v_status public.journal_status;
begin
  select * into y from public.year_closes where id = p_close for update;
  if y.id is null then raise exception 'Year close not found' using errcode = 'no_data_found'; end if;
  perform app.require(y.organization_id, 'prepare');
  select status into v_status from public.journals where id = y.journal_id;
  if v_status in ('posted', 'reversed') then raise exception 'The closing journal is posted — reopen the periods and reverse it instead' using errcode = 'check_violation'; end if;
  perform app.set_ctx('year_close');
  delete from public.year_closes where id = y.id;
  delete from public.journals where id = y.journal_id;
  perform app.set_ctx(null);
end $$;

grant execute on function app.year_end_status(uuid, date), app.close_year(uuid, date), app.complete_year_close(uuid), app.cancel_year_close(uuid) to authenticated;
create function public.year_end_status(p_organization_id uuid, p_fy_end date) returns jsonb language sql security invoker set search_path = '' as $$ select app.year_end_status(p_organization_id, p_fy_end) $$;
create function public.close_year(p_organization_id uuid, p_fy_end date) returns uuid language sql security invoker set search_path = '' as $$ select app.close_year(p_organization_id, p_fy_end) $$;
create function public.complete_year_close(p_close_id uuid) returns text language sql security invoker set search_path = '' as $$ select app.complete_year_close(p_close_id) $$;
create function public.cancel_year_close(p_close_id uuid) returns void language sql security invoker set search_path = '' as $$ select app.cancel_year_close(p_close_id) $$;
revoke all on function public.year_end_status(uuid, date), public.close_year(uuid, date), public.complete_year_close(uuid), public.cancel_year_close(uuid) from public, anon;
grant execute on function public.year_end_status(uuid, date), public.close_year(uuid, date), public.complete_year_close(uuid), public.cancel_year_close(uuid) to authenticated;


-- Closing journals may post into a locked month (as in …20261007100300, plus the D-75 exception)
create or replace function app.assert_postable(p_journal public.journals) returns void
language plpgsql set search_path = '' as $$
declare
  v_lines int; v_dr bigint; v_cr bigint; v_bad text; v_period public.period_status;
begin
  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_lines, v_dr, v_cr
  from public.journal_lines where journal_id = p_journal.id;
  if v_lines < 2 then
    raise exception 'A journal needs at least two lines' using errcode = 'check_violation';          -- LED-05
  end if;
  if v_dr <> v_cr then
    raise exception 'Journal does not balance: debits % ≠ credits % (fils)', v_dr, v_cr
      using errcode = 'check_violation';                                                              -- LED-02
  end if;
  select string_agg(a.code, ', ') into v_bad
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = p_journal.id and not a.is_active;
  if v_bad is not null then
    raise exception 'Inactive account(s): %', v_bad using errcode = 'check_violation';               -- LED-12
  end if;
  if p_journal.source = 'manual' then
    select string_agg(a.code, ', ') into v_bad
    from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.journal_id = p_journal.id and a.is_control;
    if v_bad is not null then
      raise exception 'Control account(s) % cannot be used in a manual journal', v_bad using errcode = 'check_violation';
    end if;
  end if;
  select status into v_period from public.accounting_periods
  where organization_id = p_journal.organization_id
    and p_journal.entry_date between start_date and end_date;
  if v_period is null then
    raise exception 'No accounting period covers %', p_journal.entry_date using errcode = 'check_violation';
  elsif v_period = 'locked' and p_journal.source::text <> 'closing' then   -- D-75: closing comes last, after VAT approvals locked their quarters
    raise exception 'The period containing % is locked', p_journal.entry_date using errcode = 'check_violation'; -- LED-10
  end if;
end $$;

-- Reports ignore closing journals as described above (as in …20261008100100)
create or replace function public.profit_and_loss(p_organization_id uuid, p_from date, p_to date)
returns table (account_id uuid, code text, name text, type public.account_type, report_group text, amount bigint)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.code, a.name, a.type, a.report_group,
         (case when a.type = 'revenue' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end)::bigint
  from public.journal_lines l
  join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_organization_id and j.status in ('posted', 'reversed') and j.source::text <> 'closing'   -- D-75
    and j.entry_date between p_from and p_to and a.type in ('revenue', 'expense')
  group by a.id, a.code, a.name, a.type, a.report_group
  having sum(l.debit - l.credit) <> 0
  order by a.code
$$;

create or replace function public.balance_sheet(p_organization_id uuid, p_as_of date)
returns table (section text, row_kind text, account_id uuid, code text, name text, report_group text, amount bigint)
language sql stable security invoker set search_path = '' as $$
  with org as (
    select public.fy_start_of(p_as_of, o.fy_start_month) as fy_start from public.organizations o where o.id = p_organization_id
  ), bal as (
    select a.id, a.code, a.name, a.type, a.report_group, j.entry_date, l.debit - l.credit as dc
    from public.journal_lines l
    join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
    join public.accounts a on a.id = l.account_id
    where l.organization_id = p_organization_id and j.status in ('posted', 'reversed') and j.entry_date <= p_as_of
      and not (j.source::text = 'closing' and j.entry_date >= (select fy_start from org))   -- D-75: this year's result stays visible
  )
  select case b.type when 'asset' then 'assets' when 'liability' then 'liabilities' else 'equity' end, 'account', b.id, b.code, b.name, b.report_group,
         (case when b.type = 'asset' then sum(b.dc) else -sum(b.dc) end)::bigint
  from bal b where b.type in ('asset', 'liability', 'equity')
  group by b.type, b.id, b.code, b.name, b.report_group
  having sum(b.dc) <> 0
  union all
  select 'equity', 'earlier_years_result', null, null, 'Earlier years'' results (not yet closed, D-28 / D-75)', 'Equity', (-sum(b.dc))::bigint
  from bal b, org where b.type in ('revenue', 'expense') and b.entry_date < org.fy_start
  having sum(b.dc) <> 0
  union all
  select 'equity', 'current_year_result', null, null, 'Profit / (loss) for the year to date', 'Equity', coalesce(-sum(b.dc), 0)::bigint
  from org left join bal b on b.type in ('revenue', 'expense') and b.entry_date >= org.fy_start
  group by org.fy_start
  order by 1, 2, 4
$$;

-- Corporate Tax ignores closing journals (as in …20261009100600)
create or replace function app.period_revenue(p_org uuid, p_from date, p_to date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.credit - l.debit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.type = 'revenue' and j.status in ('posted', 'reversed') and j.source::text <> 'closing' and j.entry_date between p_from and p_to
$$;

create or replace function app.ct_computation(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.ct_period(p_tax_period_id);
  o public.organizations;
  r public.ct_returns;
  v_rate int; v_band bigint; v_cap int; v_sbr_limit bigint; v_sbr_last date;
  v_revenue bigint; v_expenses bigint; v_profit bigint; v_add bigint; v_adj bigint; v_ti bigint;
  v_lbf bigint; v_relief bigint := 0; v_loss bigint := 0; v_taxable bigint; v_ct bigint := 0; v_lcf bigint;
  v_sbr_elected boolean; v_sbr_ok boolean; v_sbr boolean; v_prev public.ct_returns;
  v_warn jsonb := '[]'; v_addbacks jsonb; v_adjs jsonb; v_failed text; v_lines jsonb;
begin
  select * into o from public.organizations where id = tp.organization_id;
  select * into r from public.ct_returns where tax_period_id = tp.id;
  v_rate := (app.config_value('ct.rate_bp', tp.end_date) #>> '{}')::int;
  v_band := (app.config_value('ct.zero_band', tp.end_date) #>> '{}')::bigint;
  v_cap := (app.config_value('ct.loss_cap_bp', tp.end_date) #>> '{}')::int;
  v_sbr_limit := (app.config_value('ct.sbr_limit', tp.end_date) #>> '{}')::bigint;
  v_sbr_last := (app.config_value('ct.sbr_last_period_end', tp.end_date) #>> '{}')::date;

  -- Accounting profit before tax (the CT expense account excluded)
  select coalesce(sum(l.credit - l.debit) filter (where a.type = 'revenue'), 0), coalesce(sum(l.debit - l.credit) filter (where a.type = 'expense'), 0)
    into v_revenue, v_expenses
  from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
  where l.organization_id = o.id and j.status in ('posted', 'reversed') and j.source::text <> 'closing' and j.entry_date between tp.start_date and tp.end_date
    and a.type in ('revenue', 'expense') and coalesce(a.subtype, '') <> 'ct_expense';
  v_profit := v_revenue - v_expenses;
  select coalesce(jsonb_agg(jsonb_build_object('account_id', id, 'account_code', code, 'account_name', name, 'type', type, 'amount', amount) order by code), '[]') into v_lines
  from (select a.id, a.code, a.name, a.type::text, sum(case when a.type = 'revenue' then l.credit - l.debit else l.debit - l.credit end) amount
        from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
        where l.organization_id = o.id and j.status in ('posted', 'reversed') and j.source::text <> 'closing' and j.entry_date between tp.start_date and tp.end_date
          and a.type in ('revenue', 'expense') and coalesce(a.subtype, '') <> 'ct_expense'
        group by a.id, a.code, a.name, a.type having sum(l.debit - l.credit) <> 0) x;

  -- F-08 add-backs on CT-tagged expense accounts
  select coalesce(jsonb_agg(x order by x ->> 'account_code'), '[]'), coalesce(sum((x ->> 'add_back')::bigint), 0) into v_addbacks, v_add
  from (
    select jsonb_build_object('account_id', a.id, 'account_code', a.code, 'account_name', a.name, 'tag', t.code, 'tag_label', t.label, 'legal_reference', t.legal_reference,
             'expense', sum(l.debit - l.credit), 'percent_bp', (app.config_value(t.addback_key, tp.end_date) #>> '{}')::int,
             'add_back', app.round_half_up(sum(l.debit - l.credit) * (app.config_value(t.addback_key, tp.end_date) #>> '{}')::int / 10000.0)) x
    from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id join public.ct_tags t on t.code = a.ct_tag
    where l.organization_id = o.id and j.status in ('posted', 'reversed') and j.source::text <> 'closing' and j.entry_date between tp.start_date and tp.end_date
      and a.type = 'expense' and t.addback_key is not null
    group by a.id, a.code, a.name, t.code, t.label, t.legal_reference, t.addback_key
    having sum(l.debit - l.credit) <> 0
  ) s;

  -- D-66 manual adjustments
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'direction', direction, 'amount', amount, 'description', description, 'legal_reference', legal_reference)
           order by created_at), '[]'),
         coalesce(sum(case when direction = 'add' then amount else -amount end), 0)
    into v_adjs, v_adj
  from public.ct_adjustments where ct_return_id = r.id;
  v_ti := v_profit + v_add + v_adj;

  -- Losses brought forward
  select rr.* into v_prev from public.ct_returns rr join public.tax_periods p on p.id = rr.tax_period_id
   where rr.organization_id = o.id and rr.status in ('approved', 'filed') and p.end_date < tp.start_date order by p.end_date desc limit 1;
  v_lbf := coalesce((v_prev.snapshot ->> 'losses_cf')::bigint, o.ct_losses_opening);

  -- F-11 Small Business Relief
  v_sbr_elected := o.ct_regime = 'sbr';
  select string_agg(to_char(p.start_date, 'YYYY') || '/' || to_char(p.end_date, 'YYYY'), ', ') into v_failed
  from public.tax_periods p where p.organization_id = o.id and p.kind = 'ct' and p.end_date < tp.start_date
    and app.period_revenue(o.id, p.start_date, p.end_date) > v_sbr_limit;
  v_sbr_ok := v_revenue <= v_sbr_limit and coalesce(o.prior_year_revenue, 0) <= v_sbr_limit and v_failed is null and tp.end_date <= v_sbr_last;
  v_sbr := v_sbr_elected and v_sbr_ok;
  if v_sbr_elected and not v_sbr_ok then
    v_warn := v_warn || to_jsonb('Small Business Relief is elected but not available for this period ('
      || concat_ws('; ', case when v_revenue > v_sbr_limit then 'revenue above the limit' end, case when coalesce(o.prior_year_revenue, 0) > v_sbr_limit then 'prior-year revenue above the limit' end,
                   case when v_failed is not null then 'revenue above the limit in ' || v_failed end, case when tp.end_date > v_sbr_last then 'period ends after the last SBR date' end)
      || ') — the standard computation is used.'::text);
  end if;
  if o.ct_regime = 'qfzp' then v_warn := v_warn || to_jsonb('Qualifying Free Zone Person: qualifying / non-qualifying income is not computed automatically yet — use manual adjustments and review.'::text); end if;

  if v_sbr then
    v_taxable := 0; v_lcf := v_lbf;                                           -- D-67: no loss of an SBR period; earlier losses wait
  elsif v_ti < 0 then
    v_loss := -v_ti; v_taxable := 0; v_lcf := v_lbf + v_loss;
  else
    v_relief := least(v_lbf, app.round_half_up(v_ti * v_cap / 10000.0));      -- F-10
    v_taxable := v_ti - v_relief; v_lcf := v_lbf - v_relief;
    v_ct := app.round_half_up(greatest(0, v_taxable - v_band) * v_rate / 10000.0);   -- F-09
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('id', tp.id, 'start_date', tp.start_date, 'end_date', tp.end_date, 'due_date', tp.due_date),
    'organization', jsonb_build_object('legal_name', o.legal_name, 'ct_trn', o.ct_trn, 'regime', o.ct_regime),
    'rules', jsonb_build_object('rate_bp', v_rate, 'zero_band', v_band, 'loss_cap_bp', v_cap, 'sbr_limit', v_sbr_limit, 'sbr_last_period_end', v_sbr_last),
    'revenue', v_revenue, 'expenses', v_expenses, 'accounting_profit', v_profit, 'profit_lines', v_lines,
    'addbacks', v_addbacks, 'addbacks_total', v_add, 'adjustments', v_adjs, 'adjustments_total', v_adj,
    'taxable_income_before_losses', v_ti, 'sbr_elected', v_sbr_elected, 'sbr_eligible', v_sbr_ok, 'sbr_applied', v_sbr,
    'losses_bf', v_lbf, 'loss_relief', v_relief, 'loss_of_period', v_loss, 'taxable_income', v_taxable, 'ct_payable', v_ct, 'losses_cf', v_lcf,
    'warnings', v_warn, 'status', coalesce(r.status::text, 'none'));
end $$;

-- Closing journals are built by the app, like depreciation and disposals (as in …20261009100700)
create or replace function app.system_journal_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_source public.journal_source;
begin
  if app.ctx() <> '' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_table_name = 'journals' then
    if old.source::text in ('depreciation', 'disposal', 'closing') and (new.entry_date <> old.entry_date or new.memo is distinct from old.memo) then
      raise exception 'A % journal is built by the app — cancel it on its screen and prepare it again', old.source using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  select source into v_source from public.journals where id = case when tg_op = 'DELETE' then old.journal_id else new.journal_id end;
  if v_source::text in ('depreciation', 'disposal', 'closing') then
    raise exception 'A % journal is built by the app — cancel it on its screen and prepare it again', v_source using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
