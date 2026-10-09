-- P2-08 · Nightly integrity checks (Spec 01 §4.12 integrity_runs/results · Spec 04 S-5.4).
-- Every night (02:00 UAE) each client is checked; anyone with access can also run the checks now.
-- The checks repeat, from the stored data, what the database rules already guarantee — if one ever fails,
-- something bypassed a rule and the firm must know. Results are append-only. The e-mail alert (Resend,
-- `integrity_alert_recipients`) is switched on with the deployment (OA-16).

create type public.integrity_status as enum ('ok', 'warning', 'error');

create table public.integrity_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  trigger text not null check (trigger in ('nightly', 'manual')),
  triggered_by uuid references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  status public.integrity_status not null,
  errors int not null default 0,
  warnings int not null default 0,
  unique (id, organization_id)
);
select app.setup_table('public.integrity_runs', false);
create index integrity_runs_org_idx on public.integrity_runs (organization_id, started_at desc);
create index integrity_runs_triggered_by_idx on public.integrity_runs (triggered_by);

create table public.integrity_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  organization_id uuid not null,
  check_code text not null,
  label text not null,
  status public.integrity_status not null,
  detail text,
  unique (run_id, check_code),
  foreign key (run_id, organization_id) references public.integrity_runs (id, organization_id) on delete restrict
);
select app.setup_table('public.integrity_results', false);
create index integrity_results_run_idx on public.integrity_results (run_id, organization_id);

do $$
declare t text;
begin
  foreach t in array array['integrity_runs', 'integrity_results'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
  end loop;
end $$;
grant select on public.integrity_runs, public.integrity_results to authenticated;

create or replace function app.integrity_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Integrity results are a permanent record and cannot be changed' using errcode = 'insufficient_privilege';
end $$;
create trigger append_only before update or delete on public.integrity_runs for each row execute function app.integrity_append_only();
create trigger append_only before update or delete on public.integrity_results for each row execute function app.integrity_append_only();

-- An AED amount in fils as text with 2 decimals, e.g. 2250100 → 22501.00.
create or replace function app.aed_text(p_fils bigint) returns text
language sql immutable set search_path = '' as $$ select to_char(p_fils / 100.0, 'FM999999999999990.00') $$;

-- GL balance (debit − credit) of the accounts with a subtype, up to today.
create or replace function app.gl_subtype_balance(p_org uuid, p_subtype text, p_as_of date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint
  from public.journal_lines l
  join public.journals j on j.id = l.journal_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.subtype = p_subtype and j.status in ('posted', 'reversed') and j.entry_date <= p_as_of
$$;

-- Unused credits by the ledger's rules: posted payments not reversed by today, minus what was used.
create or replace function app.credits_total(p_org uuid, p_kind public.payment_kind) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.credit_aed - coalesce((select sum(a.credit_amount) from public.payment_allocations a
                                                 where a.payment_id = p.id and a.credit_amount is not null
                                                   and (a.refund_id is null or app.payment_live(a.refund_id))), 0)), 0)::bigint
  from public.payments p join public.journals j on j.id = p.journal_id
  where p.organization_id = p_org and p.kind = p_kind and p.status = 'posted' and j.status = 'posted' and j.entry_date <= current_date
$$;

-- Gaps in a running document counter (D-22): the numbers used must be consecutive.
create or replace function app.number_gaps(p_numbers text[]) returns text
language sql immutable set search_path = '' as $$
  with n as (select distinct (regexp_match(x, '(\d+)$'))[1]::int as seq from unnest(p_numbers) x where x ~ '\d+$')
  select case when count(*) = 0 or max(seq) - min(seq) + 1 = count(*) then null
              else format('%s number(s) missing between %s and %s', max(seq) - min(seq) + 1 - count(*), min(seq), max(seq)) end
  from n
$$;

create or replace function app.integrity_check_org(p_org uuid, p_trigger text, p_by uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid;
  v_today date := current_date;
  v_dr bigint; v_cr bigint;
  v_n int; v_a bigint; v_b bigint; v_txt text;
  r record;
begin
  create temp table if not exists _ic (code text, label text, status public.integrity_status, detail text) on commit drop;
  truncate _ic;

  -- 1. Trial balance and every posted journal balance (Principle 2)
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0) into v_dr, v_cr
    from public.journal_lines l join public.journals j on j.id = l.journal_id
   where l.organization_id = p_org and j.status in ('posted', 'reversed');
  insert into _ic values ('tb_balanced', 'Trial balance: total debits = total credits', case when v_dr = v_cr then 'ok' else 'error' end::public.integrity_status,
    case when v_dr <> v_cr then format('Debits %s, credits %s', app.aed_text(v_dr), app.aed_text(v_cr)) end);
  select count(*) into v_n from (select j.id from public.journals j join public.journal_lines l on l.journal_id = j.id
     where j.organization_id = p_org and j.status in ('posted', 'reversed') group by j.id having sum(l.debit) <> sum(l.credit) or count(*) < 2) x;
  insert into _ic values ('journals_balanced', 'Every posted journal balances and has 2+ lines', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s journal(s) out of balance', v_n) end);

  -- 2. Sub-ledgers = control accounts (ARAP-02/03, D-11, D-36)
  select coalesce(sum(open_aed), 0) into v_a from public.ageing(p_org, 'customer', v_today);
  v_b := app.gl_subtype_balance(p_org, 'receivable', v_today);
  insert into _ic values ('ar_control', 'Open customer invoices = Trade receivables account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Open invoices %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  select coalesce(sum(open_aed), 0) into v_a from public.ageing(p_org, 'supplier', v_today);
  v_b := -app.gl_subtype_balance(p_org, 'payable', v_today);
  insert into _ic values ('ap_control', 'Open supplier bills = Trade payables account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Open bills %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  v_a := app.credits_total(p_org, 'customer_receipt');
  v_b := -app.gl_subtype_balance(p_org, 'customer_credits', v_today);
  insert into _ic values ('credits_control', 'Unused customer credits = Customer Credits account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Credits %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  v_a := app.credits_total(p_org, 'supplier_payment');
  v_b := app.gl_subtype_balance(p_org, 'supplier_advances', v_today);
  insert into _ic values ('advances_control', 'Unused supplier advances = Supplier advances account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Advances %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);

  -- 3. Every posted document has its posted journal, with the same total on the control account
  select count(*) into v_n from public.sales_invoices i
   where i.organization_id = p_org and i.status = 'posted'
     and coalesce((select sum(l.debit + l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
                    join public.accounts a on a.id = l.account_id
                   where l.journal_id = i.journal_id and a.subtype = 'receivable' and j.status in ('posted', 'reversed')), -1) <> i.gross_total;
  insert into _ic values ('sales_journals', 'Every posted sales invoice / credit note matches its journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s document(s) differ from their journal', v_n) end);
  select count(*) into v_n from public.purchase_bills b
   where b.organization_id = p_org and b.status = 'posted'
     and coalesce((select sum(l.debit + l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
                    join public.accounts a on a.id = l.account_id
                   where l.journal_id = b.journal_id and a.subtype = 'payable' and j.status in ('posted', 'reversed')), -1) <> b.payable_total;
  insert into _ic values ('purchase_journals', 'Every posted bill / debit note matches its journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s document(s) differ from their journal', v_n) end);
  select count(*) into v_n from public.payments p left join public.journals j on j.id = p.journal_id
   where p.organization_id = p_org and p.status = 'posted' and (j.id is null or j.status not in ('posted', 'reversed'));
  insert into _ic values ('payment_journals', 'Every posted receipt / payment has its posted journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s receipt(s)/payment(s) without a posted journal', v_n) end);

  -- 4. Sequential numbering without gaps (D-22 · FTA)
  v_txt := concat_ws('; ',
    'Invoices: ' || app.number_gaps(array(select invoice_no from public.sales_invoices where organization_id = p_org and doc_type = 'invoice' and invoice_no is not null)),
    'Credit notes: ' || app.number_gaps(array(select invoice_no from public.sales_invoices where organization_id = p_org and doc_type = 'credit_note' and invoice_no is not null)),
    'Journals: ' || app.number_gaps(array(select journal_no from public.journals where organization_id = p_org and journal_no is not null)),
    'Receipts: ' || app.number_gaps(array(select payment_no from public.payments where organization_id = p_org and payment_no like 'RCPT%')),
    'Payments: ' || app.number_gaps(array(select payment_no from public.payments where organization_id = p_org and payment_no like 'PAY%')));
  insert into _ic values ('numbering', 'Document numbers run without gaps', case when v_txt = '' then 'ok' else 'error' end::public.integrity_status, nullif(v_txt, ''));

  -- 5. Bank (warnings): lines waiting to be matched for over 30 days; last month-end not reconciled
  select count(*) into v_n from public.bank_transactions where organization_id = p_org and status = 'unmatched' and txn_date < v_today - 30;
  insert into _ic values ('bank_unmatched', 'No bank lines left unmatched for more than 30 days', case when v_n = 0 then 'ok' else 'warning' end::public.integrity_status,
    case when v_n > 0 then format('%s bank line(s) older than 30 days are not matched', v_n) end);
  v_txt := null;
  for r in select ba.name, (select max(period_end) from public.bank_reconciliations rc where rc.bank_account_id = ba.id and rc.status = 'posted') as rec_to
             from public.bank_accounts ba
            where ba.organization_id = p_org and ba.is_active
              and exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.txn_date <= (date_trunc('month', v_today) - interval '1 day')::date) loop
    if r.rec_to is null or r.rec_to < (date_trunc('month', v_today) - interval '1 day')::date then
      v_txt := concat_ws('; ', v_txt, format('%s: %s', r.name, coalesce('reconciled to ' || to_char(r.rec_to, 'DD Mon YYYY'), 'never reconciled')));
    end if;
  end loop;
  insert into _ic values ('bank_reconciled', 'Bank accounts reconciled to the last month-end', case when v_txt is null then 'ok' else 'warning' end::public.integrity_status, v_txt);

  insert into public.integrity_runs (organization_id, trigger, triggered_by, status, errors, warnings)
  select p_org, p_trigger, p_by,
         case when count(*) filter (where status = 'error') > 0 then 'error' when count(*) filter (where status = 'warning') > 0 then 'warning' else 'ok' end::public.integrity_status,
         count(*) filter (where status = 'error'), count(*) filter (where status = 'warning')
  from _ic
  returning id into v_run;
  insert into public.integrity_results (run_id, organization_id, check_code, label, status, detail)
  select v_run, p_org, code, label, status, detail from _ic;
  return v_run;
end $$;

-- "Run now" for one client (anyone who can see the client).
create or replace function app.run_integrity_checks(p_organization_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.require(p_organization_id, 'view');
begin
  return app.integrity_check_org(p_organization_id, 'manual', v_uid);
end $$;

-- The nightly job: every client that is not archived. One client's failure never stops the others.
create or replace function app.run_integrity_checks_all() returns int
language plpgsql security definer set search_path = '' as $$
declare o record; v_n int := 0;
begin
  for o in select id from public.organizations where status <> 'archived' order by id loop
    begin
      perform app.integrity_check_org(o.id, 'nightly', null);
      v_n := v_n + 1;
    exception when others then
      insert into public.integrity_runs (organization_id, trigger, status, errors) values (o.id, 'nightly', 'error', 1);
    end;
  end loop;
  return v_n;
end $$;

-- Latest run per client (for the Integrity page), through RLS.
create view public.integrity_latest with (security_invoker = true) as
  select distinct on (r.organization_id) r.* from public.integrity_runs r order by r.organization_id, r.started_at desc;
grant select on public.integrity_latest to authenticated;

grant execute on function app.run_integrity_checks(uuid) to authenticated;
create function public.run_integrity_checks(p_organization_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select app.run_integrity_checks(p_organization_id) $$;
revoke all on function public.run_integrity_checks(uuid) from public, anon;
grant execute on function public.run_integrity_checks(uuid) to authenticated;

-- Schedule: 22:00 UTC = 02:00 UAE, every night (pg_cron where available — Supabase; not in the local test engine).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('nightly-integrity-checks', '0 22 * * *', 'select app.run_integrity_checks_all()');
  end if;
end $$;
