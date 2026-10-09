-- P5-01 · Corporate Tax computation and return (F-08 → F-12, D-65 → D-67). From the posted books of a CT period (financial
-- year), with every rate and threshold read from the tax rules in force at the period end (Principle 6):
--   accounting profit before tax  = revenue − expenses (the CT expense account itself excluded)
--   + add-backs on CT-tagged expense accounts × add-back % (F-08: entertainment 50%, fines, non-qualifying donations,
--     non-deductible 100%)                                                     — automatic (D-66)
--   ± manual adjustment lines, each with a reason and a legal reference          — everything else (D-66)
--   = taxable income before losses
--   Small Business Relief (F-11): elected (client CT regime = SBR) and eligible (revenue ≤ limit in this and every earlier
--     period known to the app or recorded as prior-year revenue, period ends on or before the last SBR date) → taxable
--     income nil; a loss of an SBR period is not carried forward; earlier losses wait for the next standard period (D-67).
--   Standard: a loss is carried forward; otherwise loss relief = min(losses brought forward, cap% × taxable income) (F-10);
--     CT = rate × max(0, taxable income after relief − zero band), half-up to the fils (F-09).
--   Losses brought forward = losses carried forward in the latest approved earlier return, or the client's opening losses.
-- The return: draft (adjustments) → approved by someone else (frozen snapshot + SHA-256 + tax-rule version) → filed.
-- QFZP clients: not computed automatically yet — the computation says so.

insert into app.role_permissions (role, perm) values
  ('firm_admin', 'prepare_ct'), ('firm_accountant', 'prepare_ct'), ('firm_admin', 'approve_ct'), ('firm_admin', 'file_ct')
on conflict do nothing;

alter table public.organizations add column ct_losses_opening bigint not null default 0 check (ct_losses_opening >= 0);   -- from before the books
grant update (ct_losses_opening) on public.organizations to authenticated;

create type public.ct_return_status as enum ('draft', 'approved', 'filed');
create table public.ct_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tax_period_id uuid not null unique references public.tax_periods (id) on delete restrict,
  status public.ct_return_status not null default 'draft',
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  config_version_id uuid references public.config_versions (id) on delete restrict,
  snapshot jsonb,
  snapshot_sha256 text check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  filed_on date,
  fta_reference text,
  unique (id, organization_id),
  check (approved_by <> prepared_by),
  check ((status in ('approved', 'filed')) = (approved_at is not null and snapshot is not null and snapshot_sha256 is not null and config_version_id is not null)),
  check ((status = 'filed') = (filed_on is not null and fta_reference is not null))
);
select app.setup_table('public.ct_returns');
create index ct_returns_org_idx on public.ct_returns (organization_id);
create index ct_returns_prepared_by_idx on public.ct_returns (prepared_by);
create index ct_returns_approved_by_idx on public.ct_returns (approved_by);
create index ct_returns_config_idx on public.ct_returns (config_version_id);

create table public.ct_adjustments (
  id uuid primary key default gen_random_uuid(),
  ct_return_id uuid not null,
  organization_id uuid not null,
  direction text not null check (direction in ('add', 'deduct')),
  amount bigint not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  legal_reference text,
  foreign key (ct_return_id, organization_id) references public.ct_returns (id, organization_id) on delete restrict
);
select app.setup_table('public.ct_adjustments');
create index ct_adjustments_return_idx on public.ct_adjustments (ct_return_id, organization_id);

do $$
declare t text;
begin
  foreach t in array array['ct_returns', 'ct_adjustments'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Changed only through the functions below; an approved or filed return is frozen.
create or replace function app.ct_returns_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.ct_return_status;
begin
  if app.ctx() is distinct from 'ct_return' then raise exception 'Use the Corporate Tax screen' using errcode = 'insufficient_privilege'; end if;
  if tg_table_name = 'ct_adjustments' then
    select status into v_status from public.ct_returns where id = coalesce(new.ct_return_id, old.ct_return_id);
    if v_status <> 'draft' then raise exception 'Adjustments can be changed only while the CT return is a draft' using errcode = 'check_violation'; end if;
  elsif tg_op = 'DELETE' then
    raise exception 'CT returns are never deleted' using errcode = 'insufficient_privilege';
  elsif tg_op = 'UPDATE' and old.status = 'filed' then
    raise exception 'A filed CT return is frozen' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before insert or update or delete on public.ct_returns for each row execute function app.ct_returns_guard();
create trigger guard before insert or update or delete on public.ct_adjustments for each row execute function app.ct_returns_guard();

create or replace function app.ct_period(p_tax_period_id uuid) returns public.tax_periods
language plpgsql stable security definer set search_path = '' as $$
declare tp public.tax_periods;
begin
  select * into tp from public.tax_periods where id = p_tax_period_id;
  if tp.id is null or tp.kind <> 'ct' then raise exception 'Corporate Tax period not found' using errcode = 'no_data_found'; end if;
  return tp;
end $$;

-- Revenue of a period (all revenue accounts, credit − debit) — the SBR revenue test (F-11).
create or replace function app.period_revenue(p_org uuid, p_from date, p_to date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.credit - l.debit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_org and a.type = 'revenue' and j.status in ('posted', 'reversed') and j.entry_date between p_from and p_to
$$;

-- The full computation (explainable: every line names its source). Rates and limits from the tax rules at the period end.
create or replace function app.ct_computation(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.ct_period(p_tax_period_id);
  o public.organizations;
  r public.ct_returns;
  cfg jsonb;
  v_rate int; v_band bigint; v_cap int; v_sbr_limit bigint; v_sbr_last date;
  v_revenue bigint; v_expenses bigint; v_profit bigint; v_add bigint; v_adj bigint; v_ti bigint;
  v_lbf bigint; v_relief bigint := 0; v_loss bigint := 0; v_taxable bigint; v_ct bigint := 0; v_lcf bigint;
  v_sbr_elected boolean; v_sbr_ok boolean; v_sbr boolean; v_prev public.ct_returns; v_prev_period public.tax_periods;
  v_warn jsonb := '[]'; v_addbacks jsonb; v_adjs jsonb; v_failed text;
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
  where l.organization_id = o.id and j.status in ('posted', 'reversed') and j.entry_date between tp.start_date and tp.end_date
    and a.type in ('revenue', 'expense') and coalesce(a.subtype, '') <> 'ct_expense';
  v_profit := v_revenue - v_expenses;

  -- F-08 add-backs on CT-tagged expense accounts
  select coalesce(jsonb_agg(x order by x ->> 'account_code'), '[]'), coalesce(sum((x ->> 'add_back')::bigint), 0) into v_addbacks, v_add
  from (
    select jsonb_build_object('account_id', a.id, 'account_code', a.code, 'account_name', a.name, 'tag', t.code, 'tag_label', t.label, 'legal_reference', t.legal_reference,
             'expense', sum(l.debit - l.credit), 'percent_bp', (app.config_value(t.addback_key, tp.end_date) #>> '{}')::int,
             'add_back', app.round_half_up(sum(l.debit - l.credit) * (app.config_value(t.addback_key, tp.end_date) #>> '{}')::int / 10000.0)) x
    from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id join public.ct_tags t on t.code = a.ct_tag
    where l.organization_id = o.id and j.status in ('posted', 'reversed') and j.entry_date between tp.start_date and tp.end_date
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
    'revenue', v_revenue, 'expenses', v_expenses, 'accounting_profit', v_profit,
    'addbacks', v_addbacks, 'addbacks_total', v_add, 'adjustments', v_adjs, 'adjustments_total', v_adj,
    'taxable_income_before_losses', v_ti, 'sbr_elected', v_sbr_elected, 'sbr_eligible', v_sbr_ok, 'sbr_applied', v_sbr,
    'losses_bf', v_lbf, 'loss_relief', v_relief, 'loss_of_period', v_loss, 'taxable_income', v_taxable, 'ct_payable', v_ct, 'losses_cf', v_lcf,
    'warnings', v_warn, 'status', coalesce(r.status::text, 'none'));
end $$;

-- Workflow
create or replace function app.start_ct_return(p_tax_period_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tp public.tax_periods := app.ct_period(p_tax_period_id); v_uid uuid := app.require(tp.organization_id, 'prepare_ct'); v_id uuid;
begin
  select id into v_id from public.ct_returns where tax_period_id = tp.id;
  if v_id is not null then return v_id; end if;
  perform app.set_ctx('ct_return');
  insert into public.ct_returns (organization_id, tax_period_id, prepared_by) values (tp.organization_id, tp.id, v_uid) returning id into v_id;
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.add_ct_adjustment(p_return_id uuid, p_direction text, p_amount bigint, p_description text, p_legal_reference text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.ct_returns; v_uid uuid; v_id uuid;
begin
  select * into r from public.ct_returns where id = p_return_id for update;
  if r.id is null then raise exception 'CT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'prepare_ct');
  if nullif(btrim(p_description), '') is null then raise exception 'Describe the adjustment (D-66)' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_legal_reference), '') is null then raise exception 'Give the legal reference for the adjustment (D-66)' using errcode = 'check_violation'; end if;
  perform app.set_ctx('ct_return');
  perform set_config('app.reason', p_description, true);
  insert into public.ct_adjustments (ct_return_id, organization_id, direction, amount, description, legal_reference)
  values (r.id, r.organization_id, p_direction, p_amount, btrim(p_description), btrim(p_legal_reference)) returning id into v_id;
  update public.ct_returns set prepared_by = v_uid where id = r.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_id;
end $$;

create or replace function app.delete_ct_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.ct_adjustments; v_uid uuid;
begin
  select * into a from public.ct_adjustments where id = p_id;
  if a.id is null then raise exception 'Adjustment not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(a.organization_id, 'prepare_ct');
  perform app.set_ctx('ct_return');
  delete from public.ct_adjustments where id = a.id;
  update public.ct_returns set prepared_by = v_uid where id = a.ct_return_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.approve_ct_return(p_return_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.ct_returns; tp public.tax_periods; v_uid uuid; v_cfg public.config_versions; v_snap jsonb; v_hash text;
begin
  select * into r from public.ct_returns where id = p_return_id for update;
  if r.id is null then raise exception 'CT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'approve_ct');
  if r.status <> 'draft' then raise exception 'Only a draft CT return can be approved' using errcode = 'check_violation'; end if;
  if r.prepared_by = v_uid then raise exception 'You prepared this return, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege'; end if;
  select * into tp from public.tax_periods where id = r.tax_period_id;
  select * into v_cfg from public.config_versions where status = 'approved' and effective_from <= tp.end_date order by effective_from desc limit 1;
  if v_cfg.id is null then raise exception 'No approved tax-rule version covers this period' using errcode = 'check_violation'; end if;
  v_snap := app.ct_computation(tp.id) || jsonb_build_object('config_version', v_cfg.label, 'prepared_by', r.prepared_by, 'approved_by', v_uid, 'approved_at', now());
  v_hash := encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex');
  perform app.set_ctx('ct_return');
  update public.ct_returns set status = 'approved', approved_by = v_uid, approved_at = now(), config_version_id = v_cfg.id, snapshot = v_snap, snapshot_sha256 = v_hash
   where id = r.id;
  perform app.set_ctx(null);
  return v_hash;
end $$;

create or replace function app.file_ct_return(p_return_id uuid, p_filed_on date, p_fta_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.ct_returns;
begin
  select * into r from public.ct_returns where id = p_return_id for update;
  if r.id is null then raise exception 'CT return not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'file_ct');
  if r.status <> 'approved' then raise exception 'Only an approved CT return can be marked as filed' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_fta_reference), '') is null or p_filed_on is null then raise exception 'Enter the filing date and the FTA reference' using errcode = 'check_violation'; end if;
  perform app.set_ctx('ct_return');
  update public.ct_returns set status = 'filed', filed_on = p_filed_on, fta_reference = btrim(p_fta_reference) where id = r.id;
  perform app.set_ctx(null);
end $$;

-- What the screen shows: the approved snapshot once approved, otherwise the live computation.
create or replace function app.ct_return_preview(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tp public.tax_periods := app.ct_period(p_tax_period_id); r public.ct_returns;
begin
  perform app.require(tp.organization_id, 'view');
  select * into r from public.ct_returns where tax_period_id = tp.id;
  return case when r.status in ('approved', 'filed') then r.snapshot else app.ct_computation(tp.id) end
    || jsonb_build_object('return', case when r.id is null then null else jsonb_build_object('id', r.id, 'status', r.status, 'prepared_by', r.prepared_by,
         'approved_by', r.approved_by, 'approved_at', r.approved_at, 'snapshot_sha256', r.snapshot_sha256, 'filed_on', r.filed_on, 'fta_reference', r.fta_reference) end);
end $$;

grant execute on function app.ct_return_preview(uuid), app.start_ct_return(uuid), app.add_ct_adjustment(uuid, text, bigint, text, text),
  app.delete_ct_adjustment(uuid), app.approve_ct_return(uuid), app.file_ct_return(uuid, date, text) to authenticated;
create function public.ct_return_preview(p_tax_period_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select app.ct_return_preview(p_tax_period_id) $$;
create function public.start_ct_return(p_tax_period_id uuid) returns uuid language sql security invoker set search_path = '' as $$ select app.start_ct_return(p_tax_period_id) $$;
create function public.add_ct_adjustment(p_return_id uuid, p_direction text, p_amount bigint, p_description text, p_legal_reference text default null) returns uuid
  language sql security invoker set search_path = '' as $$ select app.add_ct_adjustment(p_return_id, p_direction, p_amount, p_description, p_legal_reference) $$;
create function public.delete_ct_adjustment(p_id uuid) returns void language sql security invoker set search_path = '' as $$ select app.delete_ct_adjustment(p_id) $$;
create function public.approve_ct_return(p_return_id uuid) returns text language sql security invoker set search_path = '' as $$ select app.approve_ct_return(p_return_id) $$;
create function public.file_ct_return(p_return_id uuid, p_filed_on date, p_fta_reference text) returns void
  language sql security invoker set search_path = '' as $$ select app.file_ct_return(p_return_id, p_filed_on, p_fta_reference) $$;
revoke all on function public.ct_return_preview(uuid), public.start_ct_return(uuid), public.add_ct_adjustment(uuid, text, bigint, text, text),
  public.delete_ct_adjustment(uuid), public.approve_ct_return(uuid), public.file_ct_return(uuid, date, text) from public, anon;
grant execute on function public.ct_return_preview(uuid), public.start_ct_return(uuid), public.add_ct_adjustment(uuid, text, bigint, text, text),
  public.delete_ct_adjustment(uuid), public.approve_ct_return(uuid), public.file_ct_return(uuid, date, text) to authenticated;
