-- P1-12 · Client onboarding (Spec 03 §3.1 · F-05, F-06, F-12 · CFG-06). One database call
-- creates a client with everything it needs: chart of accounts (copied from the template),
-- monthly accounting periods, VAT periods from the FTA stagger, Corporate Tax periods, document
-- number counters and the assigned Firm Accountants. Opening balances are entered afterwards
-- as an `opening` journal, which goes through normal approval.

-- Last day of the month that is n months after the month containing d.
create or replace function app.month_end(d date, n int default 0) returns date
language sql immutable set search_path = '' as $$
  select (date_trunc('month', d) + make_interval(months => n + 1) - interval '1 day')::date
$$;

-- The financial year (start, end) containing d, for a year starting in fy_start_month.
create or replace function app.fy_bounds(d date, fy_start_month int, out fy_start date, out fy_end date)
language sql immutable set search_path = '' as $$
  select s, (s + interval '1 year - 1 day')::date
  from (select make_date(extract(year from d)::int - case when extract(month from d)::int < fy_start_month then 1 else 0 end,
                         fy_start_month, 1) as s) x
$$;

create or replace function app.create_client(
  p_legal_name text,
  p_emirate_code text,
  p_books_start date,
  p_fy_start_month int default 1,
  p_trade_name text default null,
  p_trn text default null,
  p_ct_trn text default null,
  p_licence_no text default null,
  p_licence_authority text default null,
  p_licence_expiry date default null,
  p_industry text default null,
  p_vat_registered boolean default false,
  p_vat_period public.vat_period default null,
  p_vat_first_period_end date default null,
  p_ct_regime public.ct_regime default 'standard',
  p_prior_year_revenue bigint default 0,
  p_accountant_ids uuid[] default '{}',
  p_manager_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_firm uuid;
  v_org uuid;
  v_start date := date_trunc('month', p_books_start)::date;
  v_horizon date;
  v_months int;
  v_end date;
  v_fy record;
  v_template uuid;
  v_user uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in' using errcode = 'insufficient_privilege'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor sign-in is required' using errcode = 'insufficient_privilege'; end if;
  v_firm := app.inviter_firm();
  if v_firm is null then raise exception 'Only a Firm Admin can add clients' using errcode = 'insufficient_privilege'; end if;
  if nullif(btrim(p_legal_name), '') is null then raise exception 'Enter the client''s legal name' using errcode = 'check_violation'; end if;
  if p_books_start is null then raise exception 'Enter the date the books start' using errcode = 'check_violation'; end if;
  if p_vat_registered then
    if p_vat_period is null or p_vat_first_period_end is null then
      raise exception 'A VAT-registered client needs its VAT period (quarterly/monthly) and first period end date' using errcode = 'check_violation';
    end if;
    if p_vat_first_period_end <> app.month_end(p_vat_first_period_end) then
      raise exception 'The first VAT period must end on the last day of a month (see the VAT registration certificate)' using errcode = 'check_violation';
    end if;
  end if;
  if p_manager_id is not null and not exists (select 1 from public.firm_members where firm_id = v_firm and user_id = p_manager_id and active) then
    raise exception 'The manager must be active staff of the firm' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('create_client');
  insert into public.organizations (firm_id, legal_name, trade_name, trn, ct_trn, licence_no, licence_authority, licence_expiry,
         emirate_code, industry, fy_start_month, vat_registered, vat_period, vat_first_period_end, ct_regime,
         prior_year_revenue, manager_id, status)
  values (v_firm, btrim(p_legal_name), nullif(btrim(p_trade_name), ''), nullif(btrim(p_trn), ''), nullif(btrim(p_ct_trn), ''),
          nullif(btrim(p_licence_no), ''), nullif(btrim(p_licence_authority), ''), p_licence_expiry, p_emirate_code,
          nullif(btrim(p_industry), ''), p_fy_start_month, p_vat_registered,
          case when p_vat_registered then p_vat_period end, case when p_vat_registered then p_vat_first_period_end end,
          p_ct_regime, p_prior_year_revenue, p_manager_id, 'active')
  returning id into v_org;

  -- Chart of accounts: the firm's default template (firm setting), else the platform default.
  select id into v_template from public.coa_templates where code = app.firm_setting(v_firm, 'default_coa_template') #>> '{}';
  if v_template is null then select id into v_template from public.coa_templates where is_default; end if;
  insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
  select v_org, a.code, a.name, a.type, a.subtype, a.report_group, a.ct_tag, a.is_control
  from public.coa_template_accounts a where a.template_id = v_template;

  -- Periods run from the books' start to the end of the next financial year.
  v_horizon := (app.fy_bounds(greatest(current_date, v_start), p_fy_start_month)).fy_end;
  v_horizon := (v_horizon + interval '1 year')::date;
  insert into public.accounting_periods (organization_id, start_date, end_date)
  select v_org, m::date, app.month_end(m::date)
  from generate_series(v_start, v_horizon, interval '1 month') m;

  -- VAT periods follow the stagger on the registration certificate (F-06); due = end + N days (F-05).
  if p_vat_registered then
    v_months := case p_vat_period when 'quarterly' then 3 else 1 end;
    v_end := p_vat_first_period_end;
    while v_end <= v_horizon loop
      if v_end >= v_start then
        insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
        values (v_org, 'vat', (v_end + 1 - make_interval(months => v_months))::date, v_end,
                v_end + coalesce((app.config_value('vat.return_due_days', v_end) #>> '{}')::int, 28));
      end if;
      v_end := app.month_end(v_end, v_months);
    end loop;
  end if;

  -- Corporate Tax periods = financial years; due on the last day of the Nth month after year end (F-12).
  for v_fy in
    select (app.fy_bounds(d::date, p_fy_start_month)).*
    from generate_series((app.fy_bounds(v_start, p_fy_start_month)).fy_start, v_horizon, interval '1 year') d
  loop
    insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
    values (v_org, 'ct', v_fy.fy_start, v_fy.fy_end,
            app.month_end(v_fy.fy_end, coalesce((app.config_value('ct.return_due_months', v_fy.fy_end) #>> '{}')::int, 9)));
  end loop;

  insert into public.number_sequences (organization_id, doc_type)
  select v_org, t from unnest(enum_range(null::public.doc_type)) t;

  foreach v_user in array coalesce(p_accountant_ids, '{}') loop
    insert into public.org_memberships (organization_id, user_id, role) values (v_org, v_user, 'firm_accountant');
  end loop;

  perform app.set_ctx(null);
  return v_org;
end $$;

grant execute on function app.create_client(text, text, date, int, text, text, text, text, text, date, text, boolean,
  public.vat_period, date, public.ct_regime, bigint, uuid[], uuid) to authenticated;

create function public.create_client(
  p_legal_name text, p_emirate_code text, p_books_start date, p_fy_start_month int default 1,
  p_trade_name text default null, p_trn text default null, p_ct_trn text default null, p_licence_no text default null,
  p_licence_authority text default null, p_licence_expiry date default null, p_industry text default null,
  p_vat_registered boolean default false, p_vat_period public.vat_period default null, p_vat_first_period_end date default null,
  p_ct_regime public.ct_regime default 'standard', p_prior_year_revenue bigint default 0,
  p_accountant_ids uuid[] default '{}', p_manager_id uuid default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select app.create_client(p_legal_name, p_emirate_code, p_books_start, p_fy_start_month, p_trade_name, p_trn, p_ct_trn,
    p_licence_no, p_licence_authority, p_licence_expiry, p_industry, p_vat_registered, p_vat_period, p_vat_first_period_end,
    p_ct_regime, p_prior_year_revenue, p_accountant_ids, p_manager_id)
$$;
revoke all on function public.create_client(text, text, date, int, text, text, text, text, text, date, text, boolean,
  public.vat_period, date, public.ct_regime, bigint, uuid[], uuid) from public, anon;
grant execute on function public.create_client(text, text, date, int, text, text, text, text, text, date, text, boolean,
  public.vat_period, date, public.ct_regime, bigint, uuid[], uuid) to authenticated;
