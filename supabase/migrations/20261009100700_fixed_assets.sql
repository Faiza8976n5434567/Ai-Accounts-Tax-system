-- P5-04 · Fixed asset register and depreciation (F-21 · D-68, D-70 → D-74) + D-69 (CT approval only after the year end).
--   • Assets enter the register from a posted bill line on a fixed-asset account (cost = net + irrecoverable VAT, as the
--     bill posted it) or by hand — e.g. assets owned before the app, with accumulated depreciation as at a date (D-70).
--     Registering posts nothing: the bill or the opening balances already put the cost in the ledger.
--   • Methods (D-73): straight line, reducing balance (annual % on the book value at the start of each asset-year, spread
--     over its 12 months), sum-of-years' digits (asset-years), units of production (units entered per month).
--     Asset-years start in the month of purchase (D-68: full month in the month of purchase); for an asset with history
--     before the app, reducing-balance years start in its first month in the app.
--   • Rounding (D-72): each month half-up to the fils; the last month of each year (reducing balance, SYD) and the last
--     month of the life absorb the difference so the asset ends exactly at its residual value. Never below residual.
--   • Monthly run (D-71): one journal for the month (Dr depreciation expense / Cr accumulated depreciation, one pair of
--     lines per asset), waiting for approval by someone else. Each run charges what the schedule says is due up to that
--     month minus what was already charged — so an asset registered late catches up. Months run in order; a run waits
--     until the previous run's journal is posted.
--   • Disposal (D-74): no charge in the month of disposal. Sold → the sale is a normal sales invoice (VAT as usual) whose
--     line goes to 1520 "Asset disposals clearing"; the disposal journal empties cost and accumulated depreciation and
--     books the gain (4320) or loss (6210). Scrapped → the book value is a loss.

-- D-69 · a Corporate Tax return is approved only after its financial year has ended
create or replace function app.ct_year_ended_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status = 'draft'
     and (select end_date from public.tax_periods where id = new.tax_period_id) >= current_date then
    raise exception 'The financial year has not ended yet — a CT return is approved after the year end (D-69)' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger year_ended before update on public.ct_returns for each row execute function app.ct_year_ended_guard();

-- ── Accounts ─────────────────────────────────────────────────────────────────────────────
update public.coa_template_accounts set subtype = 'depreciation' where code = '6200' and subtype is null;
update public.accounts set subtype = 'depreciation' where code = '6200' and subtype is null and type = 'expense';
insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, a.code, a.name, a.type::public.account_type, a.subtype, a.grp, null, false
from public.coa_templates t, (values
  ('1520', 'Asset disposals clearing',     'asset',   'disposal_clearing', 'Non-current assets'),
  ('4320', 'Gain on disposal of assets',   'revenue', 'disposal_gain',     'Other income'),
  ('6210', 'Loss on disposal of assets',   'expense', 'disposal_loss',     'Depreciation')) a(code, name, type, subtype, grp)
where t.code = 'uae-sme'
on conflict (template_id, code) do nothing;
insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
select o.id, a.code, a.name, a.type::public.account_type, a.subtype, a.grp, null, false
from public.organizations o, (values
  ('1520', 'Asset disposals clearing',     'asset',   'disposal_clearing', 'Non-current assets'),
  ('4320', 'Gain on disposal of assets',   'revenue', 'disposal_gain',     'Other income'),
  ('6210', 'Loss on disposal of assets',   'expense', 'disposal_loss',     'Depreciation')) a(code, name, type, subtype, grp)
where not exists (select 1 from public.accounts x where x.organization_id = o.id and (x.code = a.code or x.subtype = a.subtype));

alter type public.journal_source add value if not exists 'depreciation';
alter type public.journal_source add value if not exists 'disposal';

-- D-74 · a sales invoice line may go to the asset disposals clearing account (the sale of a fixed asset, VAT as usual)
-- (save_sales_invoice as in …20261009100400, only the account check widened)
create or replace function app.save_sales_invoice(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'prepare');
  v_type public.sales_doc_type := coalesce(p_doc ->> 'doc_type', 'invoice')::public.sales_doc_type;
  v_contact public.contacts;
  v_orig public.sales_invoices;
  v_issue date := (p_doc ->> 'issue_date')::date;
  v_currency text := coalesce(nullif(p_doc ->> 'currency', ''), 'AED');
  v_emirate text;
  v_due date;
  v_id uuid := p_id;
  v_line jsonb;
  v_acc public.accounts;
  v_n int := 0;
  v_incl boolean;
  v_item public.items;
  v_tt text := coalesce(nullif(p_doc ->> 'transaction_type', ''), '00000000');
begin
  if v_issue is null then raise exception 'Enter the invoice date' using errcode = 'check_violation'; end if;
  select * into v_contact from public.contacts where id = (p_doc ->> 'contact_id')::uuid and organization_id = p_organization_id;
  if v_contact.id is null then raise exception 'Choose a customer of this client' using errcode = 'check_violation'; end if;
  if v_contact.kind = 'supplier' then raise exception '% is set up as a supplier only — make it a customer first', v_contact.name using errcode = 'check_violation'; end if;
  if not v_contact.is_active then raise exception '% is inactive', v_contact.name using errcode = 'check_violation'; end if;
  if v_type = 'credit_note' then
    select * into v_orig from public.sales_invoices
     where id = (p_doc ->> 'original_invoice_id')::uuid and organization_id = p_organization_id;
    if v_orig.id is null or v_orig.doc_type <> 'invoice' or v_orig.status <> 'posted' then
      raise exception 'A credit note must refer to a posted invoice of this client' using errcode = 'check_violation';
    end if;
    if v_orig.contact_id <> v_contact.id or v_orig.currency <> v_currency then
      raise exception 'A credit note must be for the same customer and currency as its invoice' using errcode = 'check_violation';
    end if;
  end if;
  v_emirate := coalesce(nullif(p_doc ->> 'supply_emirate', ''), v_orig.supply_emirate,
                        (select emirate_code from public.organizations where id = p_organization_id));      -- D-10
  v_incl := coalesce((p_doc ->> 'prices_include_vat')::boolean, v_orig.prices_include_vat, false);   -- D-54
  v_due := coalesce((p_doc ->> 'due_date')::date, v_issue + v_contact.payment_terms_days);                   -- F-13
  if jsonb_typeof(p_doc -> 'lines') is distinct from 'array' or jsonb_array_length(p_doc -> 'lines') = 0 then
    raise exception 'Add at least one line' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('save_sales_invoice');
  if v_id is null then
    insert into public.sales_invoices (organization_id, doc_type, original_invoice_id, contact_id, issue_date, due_date, supply_date,
           supply_emirate, currency, fx_rate, customer_reference, notes, prepared_by, prices_include_vat,
           transaction_type, payment_means_code, credit_reason_code, incoterms)
    values (p_organization_id, v_type, v_orig.id, v_contact.id, v_issue, v_due, (p_doc ->> 'supply_date')::date,
            v_emirate, v_currency, app.fx_rate(v_currency, v_issue), nullif(btrim(p_doc ->> 'customer_reference'), ''),
            nullif(btrim(p_doc ->> 'notes'), ''), v_uid, v_incl,
            v_tt, nullif(p_doc ->> 'payment_means_code', ''), nullif(p_doc ->> 'credit_reason_code', ''), nullif(upper(btrim(p_doc ->> 'incoterms')), ''))
    returning id into v_id;
  else
    update public.sales_invoices set doc_type = v_type, original_invoice_id = v_orig.id, contact_id = v_contact.id, issue_date = v_issue,
           due_date = v_due, supply_date = (p_doc ->> 'supply_date')::date, supply_emirate = v_emirate, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_issue), customer_reference = nullif(btrim(p_doc ->> 'customer_reference'), ''),
           notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid,
           prices_include_vat = v_incl, transaction_type = v_tt, payment_means_code = nullif(p_doc ->> 'payment_means_code', ''),
           credit_reason_code = nullif(p_doc ->> 'credit_reason_code', ''), incoterms = nullif(upper(btrim(p_doc ->> 'incoterms')), '')
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Invoice not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.sales_invoice_lines where sales_invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_doc -> 'lines') loop
    v_n := v_n + 1;
    v_item := null;
    if nullif(v_line ->> 'item_id', '') is not null then                                         -- P4-04: codes from the item
      select * into v_item from public.items where id = (v_line ->> 'item_id')::uuid and organization_id = p_organization_id;
      if v_item.id is null or not v_item.is_active then
        raise exception 'Line %: choose an active item of this client', v_n using errcode = 'check_violation';
      end if;
    end if;
    select * into v_acc from public.accounts where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id;
    if v_acc.id is null or (v_acc.type <> 'revenue' and v_acc.subtype is distinct from 'disposal_clearing') or v_acc.is_control or not v_acc.is_active then
      raise exception 'Line %: choose an active income account (or 1520 for the sale of a fixed asset)', v_n using errcode = 'check_violation';
    end if;
    insert into public.sales_invoice_lines (sales_invoice_id, organization_id, line_no, description, quantity, unit_price, account_id, tax_code,
           item_id, unit_code, item_type, hs_code, sac_code, exemption_reason)
    values (v_id, p_organization_id, v_n, btrim(v_line ->> 'description'), (v_line ->> 'quantity')::numeric,
            (v_line ->> 'unit_price')::bigint, v_acc.id, v_line ->> 'tax_code',
            v_item.id, coalesce(nullif(v_line ->> 'unit_code', ''), v_item.unit_code),                      -- D-64: the line may set or change
            coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type),
            case when coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type) = 'S' then null else coalesce(nullif(btrim(v_line ->> 'hs_code'), ''), v_item.hs_code) end,
            case when coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type) = 'G' then null else coalesce(nullif(btrim(v_line ->> 'sac_code'), ''), v_item.sac_code) end,
            coalesce(nullif(v_line ->> 'exemption_reason', ''), case when v_line ->> 'tax_code' = 'EX' then v_item.exemption_reason end));                          -- "100.5" fils is refused
  end loop;
  perform app.recalc_sales_invoice(v_id);
  perform app.set_ctx(null);
  return v_id;
end $$;

-- ── Categories (suggested defaults; each asset can override) ─────────────────────────────
create type public.depreciation_method as enum ('straight_line', 'reducing_balance', 'sum_of_years', 'units');
create table public.asset_categories (
  code text primary key,
  name text not null unique,
  default_method public.depreciation_method not null default 'straight_line',
  default_life_months int check (default_life_months > 0),
  default_rate_bp int check (default_rate_bp between 1 and 10000),
  sort int not null default 0
);
select app.setup_table('public.asset_categories');
create policy mfa on public.asset_categories as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.asset_categories for select to authenticated using (true);
create policy ins on public.asset_categories for insert to authenticated with check ((select app.is_super_admin()));
create policy upd on public.asset_categories for update to authenticated using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
grant select, insert, update on public.asset_categories to authenticated;
insert into public.asset_categories (code, name, default_life_months, sort) values
  ('BUILDINGS',   'Buildings',                         300, 1),
  ('LEASEHOLD',   'Leasehold improvements',             60, 2),
  ('FURNITURE',   'Furniture and fixtures',             60, 3),
  ('OFFICE_EQ',   'Office equipment',                   60, 4),
  ('IT',          'Computers and IT equipment',         36, 5),
  ('VEHICLES',    'Motor vehicles',                     60, 6),
  ('MACHINERY',   'Plant and machinery',               120, 7),
  ('OTHER',       'Other',                              60, 9);

-- ── Register ─────────────────────────────────────────────────────────────────────────────
create type public.asset_status as enum ('active', 'disposed');
create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  asset_no text not null,
  name text not null check (btrim(name) <> ''),
  description text,
  category_code text references public.asset_categories (code) on delete restrict,
  location text,
  tag_no text,
  purchase_date date not null,
  cost bigint not null check (cost > 0),
  residual bigint not null default 0 check (residual >= 0),
  method public.depreciation_method not null default 'straight_line',
  life_months int check (life_months > 0),
  rate_bp int check (rate_bp between 1 and 10000),
  units_total bigint check (units_total > 0),
  units_name text,
  opening_accum bigint not null default 0 check (opening_accum >= 0),
  opening_units bigint not null default 0 check (opening_units >= 0),
  opening_as_at date,
  asset_account_id uuid not null,
  accum_account_id uuid not null,
  expense_account_id uuid not null,
  source_bill_line_id uuid unique references public.purchase_bill_lines (id) on delete restrict,
  status public.asset_status not null default 'active',
  disposed_on date,
  disposal_kind text check (disposal_kind in ('sold', 'scrapped')),
  disposal_invoice_line_id uuid unique references public.sales_invoice_lines (id) on delete restrict,
  disposal_proceeds bigint,
  disposal_journal_id uuid references public.journals (id) on delete restrict,
  unique (organization_id, asset_no),
  unique (id, organization_id),
  foreign key (asset_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (accum_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (expense_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  check (residual < cost),
  check (opening_accum <= cost - residual),
  check ((opening_as_at is null) = (opening_accum = 0 and opening_units = 0)),
  check (opening_as_at is null or opening_as_at >= purchase_date),
  check (method <> 'straight_line' or life_months is not null),
  check (method <> 'sum_of_years' or (life_months is not null and life_months % 12 = 0)),
  check (method <> 'reducing_balance' or rate_bp is not null),
  check (method <> 'units' or (units_total is not null and nullif(btrim(units_name), '') is not null and opening_units < units_total)),
  check ((status = 'disposed') = (disposed_on is not null and disposal_kind is not null and disposal_journal_id is not null)),
  check (disposed_on is null or disposed_on >= purchase_date),
  check ((disposal_kind = 'sold') = (disposal_invoice_line_id is not null))
);
select app.setup_table('public.fixed_assets');
create index fixed_assets_category_idx on public.fixed_assets (category_code);
create index fixed_assets_asset_acct_idx on public.fixed_assets (asset_account_id, organization_id);
create index fixed_assets_accum_acct_idx on public.fixed_assets (accum_account_id, organization_id);
create index fixed_assets_expense_acct_idx on public.fixed_assets (expense_account_id, organization_id);
create index fixed_assets_disposal_journal_idx on public.fixed_assets (disposal_journal_id);

create table public.asset_usage (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  organization_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  units bigint not null check (units >= 0),
  unique (asset_id, month),
  foreign key (asset_id, organization_id) references public.fixed_assets (id, organization_id) on delete restrict
);
select app.setup_table('public.asset_usage');
create index asset_usage_org_idx on public.asset_usage (organization_id);

create table public.depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  month date not null check (month = date_trunc('month', month)::date),
  journal_id uuid not null unique references public.journals (id) on delete restrict,
  unique (organization_id, month),
  unique (id, organization_id)
);
select app.setup_table('public.depreciation_runs');

create table public.depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  asset_id uuid not null,
  organization_id uuid not null,
  amount bigint not null check (amount > 0),
  catch_up boolean not null default false,
  unique (run_id, asset_id),
  foreign key (run_id, organization_id) references public.depreciation_runs (id, organization_id) on delete restrict,
  foreign key (asset_id, organization_id) references public.fixed_assets (id, organization_id) on delete restrict
);
select app.setup_table('public.depreciation_entries');
create index depreciation_entries_asset_idx on public.depreciation_entries (asset_id, organization_id);
create index depreciation_entries_run_idx on public.depreciation_entries (run_id, organization_id);

-- Changed only through the functions below.
create or replace function app.fixed_assets_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.ctx() is distinct from 'fixed_asset' then raise exception 'Use the Fixed assets screen' using errcode = 'insufficient_privilege'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['fixed_assets', 'asset_usage', 'depreciation_runs', 'depreciation_entries'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger guard before insert or update or delete on public.%I for each row execute function app.fixed_assets_guard()', t);
  end loop;
end $$;


-- Depreciation and disposal journals are built by the system: their lines, date and memo are not edited by hand.
create or replace function app.system_journal_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_source public.journal_source;
begin
  if app.ctx() <> '' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_table_name = 'journals' then
    if old.source::text in ('depreciation', 'disposal') and (new.entry_date <> old.entry_date or new.memo is distinct from old.memo) then
      raise exception 'A % journal is built by the Fixed assets screen — cancel it there and run it again', old.source using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  select source into v_source from public.journals where id = case when tg_op = 'DELETE' then old.journal_id else new.journal_id end;
  if v_source::text in ('depreciation', 'disposal') then
    raise exception 'A % journal is built by the Fixed assets screen — cancel it there and run it again', v_source using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger system_journal before update on public.journals for each row execute function app.system_journal_guard();
create trigger system_journal before insert or update or delete on public.journal_lines for each row execute function app.system_journal_guard();

-- ── The schedule (D-68, D-72, D-73) ──────────────────────────────────────────────────────
-- Month-by-month charges from the first month not covered by the opening figures up to p_upto (inclusive), stopping
-- before the month of disposal. Pure function of the asset's data and (units method) its recorded usage.
create or replace function app.asset_schedule(p_asset uuid, p_upto date) returns table (month date, charge bigint, nbv bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.fixed_assets; m date; v_first date; v_stop date; v_origin date; k int; ko int; mi int; n int; yr int;
  v_dep bigint; v_nbv bigint; v_c bigint; v_year bigint; v_year_nbv bigint; v_units bigint; v_cum bigint; v_guard int := 0;
begin
  select * into a from public.fixed_assets where id = p_asset;
  if a.id is null then return; end if;
  v_dep := a.cost - a.residual;
  v_first := date_trunc('month', a.purchase_date)::date;
  m := case when a.opening_as_at is null then v_first else (date_trunc('month', a.opening_as_at) + interval '1 month')::date end;
  v_origin := case when a.method = 'reducing_balance' then m else v_first end;
  v_stop := date_trunc('month', p_upto)::date;
  if a.disposed_on is not null then v_stop := least(v_stop, (date_trunc('month', a.disposed_on) - interval '1 month')::date); end if;   -- D-74
  v_nbv := a.cost - a.opening_accum;
  v_cum := a.opening_units;
  while m <= v_stop and v_guard < 1200 loop
    v_guard := v_guard + 1;
    k := ((extract(year from m) - extract(year from v_first)) * 12 + extract(month from m) - extract(month from v_first))::int;
    ko := ((extract(year from m) - extract(year from v_origin)) * 12 + extract(month from m) - extract(month from v_origin))::int;
    v_c := 0;
    if v_nbv > a.residual then
      if a.method = 'straight_line' then
        v_c := case when k >= a.life_months - 1 then v_nbv - a.residual
                    else least(app.round_half_up(v_dep::numeric / a.life_months), v_nbv - a.residual) end;
      elsif a.method = 'sum_of_years' then
        n := a.life_months / 12; yr := k / 12 + 1; mi := k % 12 + 1;
        if k >= a.life_months - 1 then v_c := v_nbv - a.residual;
        else
          v_year := app.round_half_up(v_dep::numeric * (n - yr + 1) / (n * (n + 1) / 2));
          v_c := least(greatest(0, case when mi = 12 then v_year - 11 * app.round_half_up(v_year / 12.0) else app.round_half_up(v_year / 12.0) end), v_nbv - a.residual);
        end if;
      elsif a.method = 'reducing_balance' then
        mi := ko % 12 + 1;
        if mi = 1 or v_year_nbv is null then v_year_nbv := v_nbv; end if;
        v_year := least(app.round_half_up(v_year_nbv::numeric * a.rate_bp / 10000), v_year_nbv - a.residual);
        if a.life_months is not null and k >= a.life_months - 1 then v_c := v_nbv - a.residual;
        else v_c := least(greatest(0, case when mi = 12 then v_year - 11 * app.round_half_up(v_year / 12.0) else app.round_half_up(v_year / 12.0) end), v_nbv - a.residual);
        end if;
      else  -- units of production
        select u.units into v_units from public.asset_usage u where u.asset_id = a.id and u.month = m;
        if coalesce(v_units, 0) > 0 then
          v_cum := v_cum + v_units;
          v_c := case when v_cum >= a.units_total then v_nbv - a.residual
                      else least(app.round_half_up(v_dep::numeric * v_units / a.units_total), v_nbv - a.residual) end;
        end if;
        v_units := null;
      end if;
    end if;
    v_nbv := v_nbv - v_c;
    month := m; charge := v_c; nbv := v_nbv;
    return next;
    m := (m + interval '1 month')::date;
  end loop;
end $$;

-- Accumulated depreciation the schedule says is due by the end of a month (opening figure included).
create or replace function app.asset_accum_due(p_asset uuid, p_upto date) returns bigint
language sql stable security definer set search_path = '' as $$
  select a.opening_accum + coalesce((select sum(s.charge) from app.asset_schedule(a.id, p_upto) s), 0)::bigint
  from public.fixed_assets a where a.id = p_asset
$$;
-- Charged so far by runs (pending or posted), opening figure included.
create or replace function app.asset_accum_charged(p_asset uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select a.opening_accum + coalesce((select sum(e.amount) from public.depreciation_entries e where e.asset_id = a.id), 0)::bigint
  from public.fixed_assets a where a.id = p_asset
$$;

-- ── Saving an asset (D-70) ───────────────────────────────────────────────────────────────
-- p: {name, description, category_code, location, tag_no, purchase_date, cost, residual, method, life_months, rate_bp,
--     units_total, units_name, opening_accum, opening_units, opening_as_at, asset_account_id, accum_account_id,
--     expense_account_id, source_bill_line_id}. From a bill line, cost / date / asset account come from the bill.
-- Once depreciation has been charged, only the descriptive fields can change.
create or replace function app.save_fixed_asset(p_id uuid, p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_org, 'prepare'); a public.fixed_assets; v_id uuid := p_id; v_no text;
  v_line public.purchase_bill_lines; v_bill public.purchase_bills; v_cost bigint; v_date date; v_acct uuid; v_accum uuid; v_exp uuid;
  v_charged boolean;
begin
  if p_id is not null then
    select * into a from public.fixed_assets where id = p_id and organization_id = p_org for update;
    if a.id is null then raise exception 'Asset not found' using errcode = 'no_data_found'; end if;
    v_charged := exists (select 1 from public.depreciation_entries where asset_id = a.id) or a.status = 'disposed';
  end if;
  perform app.set_ctx('fixed_asset');
  if v_charged then
    update public.fixed_assets set name = btrim(p ->> 'name'), description = nullif(btrim(p ->> 'description'), ''), category_code = nullif(p ->> 'category_code', ''),
           location = nullif(btrim(p ->> 'location'), ''), tag_no = nullif(btrim(p ->> 'tag_no'), '')
     where id = a.id;
    perform app.set_ctx(null);
    return a.id;
  end if;

  if nullif(p ->> 'source_bill_line_id', '') is not null then
    select * into v_line from public.purchase_bill_lines where id = (p ->> 'source_bill_line_id')::uuid and organization_id = p_org;
    select * into v_bill from public.purchase_bills where id = v_line.purchase_bill_id;
    if v_line.id is null or v_bill.status <> 'posted' or v_bill.doc_type <> 'bill' then
      raise exception 'The bill line must belong to a posted purchase bill of this client' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.accounts where id = v_line.account_id and subtype = 'fixed_asset') then
      raise exception 'The bill line is not on a fixed-asset account' using errcode = 'check_violation';
    end if;
    v_cost := v_line.net + case when v_line.tax_code in ('SR', 'BLK') then v_line.vat - v_line.recoverable_vat else 0 end;   -- as the bill posted it
    v_date := v_bill.bill_date; v_acct := v_line.account_id;
  else
    v_cost := (p ->> 'cost')::bigint; v_date := (p ->> 'purchase_date')::date;
    v_acct := coalesce(nullif(p ->> 'asset_account_id', '')::uuid, app.subtype_account(p_org, 'fixed_asset'));
  end if;
  v_accum := coalesce(nullif(p ->> 'accum_account_id', '')::uuid, app.subtype_account(p_org, 'accum_depreciation'));
  v_exp := coalesce(nullif(p ->> 'expense_account_id', '')::uuid, app.subtype_account(p_org, 'depreciation'));
  if (select type from public.accounts where id = v_acct and organization_id = p_org) is distinct from 'asset'
     or (select type from public.accounts where id = v_accum and organization_id = p_org) is distinct from 'asset'
     or (select type from public.accounts where id = v_exp and organization_id = p_org) is distinct from 'expense' then
    raise exception 'Choose an asset account, an accumulated-depreciation account and an expense account of this client' using errcode = 'check_violation';
  end if;

  if p_id is null then
    perform pg_advisory_xact_lock(hashtext('fixed_asset_no:' || p_org::text));
    select 'FA-' || lpad((coalesce(max(substr(asset_no, 4)::int), 0) + 1)::text, 4, '0') into v_no from public.fixed_assets where organization_id = p_org and asset_no ~ '^FA-\d+$';
    insert into public.fixed_assets (organization_id, asset_no, name, description, category_code, location, tag_no, purchase_date, cost, residual, method,
      life_months, rate_bp, units_total, units_name, opening_accum, opening_units, opening_as_at, asset_account_id, accum_account_id, expense_account_id, source_bill_line_id)
    values (p_org, coalesce(v_no, 'FA-0001'), btrim(p ->> 'name'), nullif(btrim(p ->> 'description'), ''), nullif(p ->> 'category_code', ''), nullif(btrim(p ->> 'location'), ''),
      nullif(btrim(p ->> 'tag_no'), ''), v_date, v_cost, coalesce((p ->> 'residual')::bigint, 0), coalesce(nullif(p ->> 'method', ''), 'straight_line')::public.depreciation_method,
      nullif(p ->> 'life_months', '')::int, nullif(p ->> 'rate_bp', '')::int, nullif(p ->> 'units_total', '')::bigint, nullif(btrim(p ->> 'units_name'), ''),
      coalesce((p ->> 'opening_accum')::bigint, 0), coalesce((p ->> 'opening_units')::bigint, 0), nullif(p ->> 'opening_as_at', '')::date,
      v_acct, v_accum, v_exp, nullif(p ->> 'source_bill_line_id', '')::uuid)
    returning id into v_id;
  else
    update public.fixed_assets set name = btrim(p ->> 'name'), description = nullif(btrim(p ->> 'description'), ''), category_code = nullif(p ->> 'category_code', ''),
      location = nullif(btrim(p ->> 'location'), ''), tag_no = nullif(btrim(p ->> 'tag_no'), ''), purchase_date = v_date, cost = v_cost,
      residual = coalesce((p ->> 'residual')::bigint, 0), method = coalesce(nullif(p ->> 'method', ''), 'straight_line')::public.depreciation_method,
      life_months = nullif(p ->> 'life_months', '')::int, rate_bp = nullif(p ->> 'rate_bp', '')::int, units_total = nullif(p ->> 'units_total', '')::bigint,
      units_name = nullif(btrim(p ->> 'units_name'), ''), opening_accum = coalesce((p ->> 'opening_accum')::bigint, 0), opening_units = coalesce((p ->> 'opening_units')::bigint, 0),
      opening_as_at = nullif(p ->> 'opening_as_at', '')::date, asset_account_id = v_acct, accum_account_id = v_accum, expense_account_id = v_exp,
      source_bill_line_id = nullif(p ->> 'source_bill_line_id', '')::uuid
     where id = a.id;
  end if;
  perform app.set_ctx(null);
  return v_id;
end $$;

-- Units used in a month (units-of-production assets), only for months not yet run.
create or replace function app.set_asset_usage(p_asset uuid, p_month date, p_units bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.fixed_assets; v_m date := date_trunc('month', p_month)::date;
begin
  select * into a from public.fixed_assets where id = p_asset;
  if a.id is null then raise exception 'Asset not found' using errcode = 'no_data_found'; end if;
  perform app.require(a.organization_id, 'prepare');
  if a.method <> 'units' then raise exception 'Usage is recorded only for units-of-production assets' using errcode = 'check_violation'; end if;
  if p_units is null or p_units < 0 then raise exception 'Enter the units used (0 or more)' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.depreciation_runs where organization_id = a.organization_id and month >= v_m) then
    raise exception 'Depreciation for % has already been run — usage can no longer change', to_char(v_m, 'Mon YYYY') using errcode = 'check_violation';
  end if;
  perform app.set_ctx('fixed_asset');
  insert into public.asset_usage (asset_id, organization_id, month, units) values (a.id, a.organization_id, v_m, p_units)
  on conflict (asset_id, month) do update set units = excluded.units;
  perform app.set_ctx(null);
end $$;

-- ── Monthly run (D-71) ───────────────────────────────────────────────────────────────────
create or replace function app.run_depreciation(p_org uuid, p_month date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_org, 'prepare'); v_m date := date_trunc('month', p_month)::date; v_end date;
  v_last public.depreciation_runs; v_jstatus public.journal_status; v_j uuid; v_run uuid; v_n int := 0; v_period public.period_status;
  a record; v_due bigint;
begin
  v_end := (v_m + interval '1 month - 1 day')::date;
  perform pg_advisory_xact_lock(hashtext('depreciation:' || p_org::text));
  select * into v_last from public.depreciation_runs where organization_id = p_org order by month desc limit 1;
  if v_last.id is not null then
    if v_last.month >= v_m then raise exception 'Depreciation has already been run for % — months run in order', to_char(v_last.month, 'Mon YYYY') using errcode = 'check_violation'; end if;
    select status into v_jstatus from public.journals where id = v_last.journal_id;
    if v_jstatus not in ('posted', 'reversed') then
      raise exception 'Approve (or cancel) the % depreciation journal first', to_char(v_last.month, 'Mon YYYY') using errcode = 'check_violation';
    end if;
  end if;
  select status into v_period from public.accounting_periods where organization_id = p_org and v_end between start_date and end_date;
  if v_period is null then raise exception 'No accounting period covers %', v_end using errcode = 'check_violation'; end if;
  if v_period = 'locked' then raise exception 'The period containing % is locked', v_end using errcode = 'check_violation'; end if;

  perform app.set_ctx('fixed_asset');
  insert into public.journals (organization_id, entry_date, memo, source, status, prepared_by)
  values (p_org, v_end, 'Depreciation ' || to_char(v_m, 'FMMonth YYYY'), 'depreciation', 'pending', v_uid) returning id into v_j;
  insert into public.depreciation_runs (organization_id, month, journal_id) values (p_org, v_m, v_j) returning id into v_run;
  for a in select * from public.fixed_assets where organization_id = p_org and purchase_date <= v_end order by asset_no loop
    v_due := app.asset_accum_due(a.id, v_m) - app.asset_accum_charged(a.id);
    if v_due < 0 then raise exception 'Asset % has been charged more than its schedule — tell the platform team', a.asset_no using errcode = 'check_violation'; end if;
    continue when v_due = 0;
    insert into public.depreciation_entries (run_id, asset_id, organization_id, amount, catch_up)
    values (v_run, a.id, p_org, v_due, v_due <> coalesce((select s.charge from app.asset_schedule(a.id, v_m) s where s.month = v_m), 0));
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, description) values
      (v_j, p_org, v_n + 1, a.expense_account_id, v_due, 0, a.asset_no || ' ' || a.name),
      (v_j, p_org, v_n + 2, a.accum_account_id, 0, v_due, a.asset_no || ' ' || a.name);
    v_n := v_n + 2;
  end loop;
  if v_n = 0 then raise exception 'Nothing to depreciate for %', to_char(v_m, 'Mon YYYY') using errcode = 'no_data_found'; end if;
  perform app.set_ctx(null);
  return v_run;
end $$;

-- The latest run can be cancelled while its journal is not yet posted (e.g. after it was sent back).
create or replace function app.cancel_depreciation_run(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.depreciation_runs; v_status public.journal_status;
begin
  select * into r from public.depreciation_runs where id = p_run;
  if r.id is null then raise exception 'Depreciation run not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'prepare');
  select status into v_status from public.journals where id = r.journal_id;
  if v_status in ('posted', 'reversed') then raise exception 'The journal is posted — reverse it instead' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.depreciation_runs where organization_id = r.organization_id and month > r.month) then
    raise exception 'Only the latest run can be cancelled' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('fixed_asset');
  delete from public.depreciation_entries where run_id = r.id;
  delete from public.depreciation_runs where id = r.id;
  delete from public.journals where id = r.journal_id;
  perform app.set_ctx(null);
end $$;

-- ── Disposal (D-74) ──────────────────────────────────────────────────────────────────────
create or replace function app.dispose_asset(p_asset uuid, p_date date, p_kind text, p_invoice_line uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.fixed_assets; v_uid uuid; v_prev date; v_accum bigint; v_proceeds bigint := 0; v_diff bigint; v_j uuid; v_n int := 0;
  v_line public.sales_invoice_lines; v_inv public.sales_invoices; v_period public.period_status;
begin
  select * into a from public.fixed_assets where id = p_asset for update;
  if a.id is null then raise exception 'Asset not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(a.organization_id, 'prepare');
  if a.status <> 'active' then raise exception 'Asset % is already disposed of', a.asset_no using errcode = 'check_violation'; end if;
  if p_kind not in ('sold', 'scrapped') then raise exception 'Choose sold or scrapped' using errcode = 'check_violation'; end if;
  if p_date is null or p_date < a.purchase_date then raise exception 'The disposal date must be on or after the purchase date' using errcode = 'check_violation'; end if;
  if a.opening_as_at is not null and p_date <= a.opening_as_at then raise exception 'The disposal date must be after the opening figures date' using errcode = 'check_violation'; end if;
  select status into v_period from public.accounting_periods where organization_id = a.organization_id and p_date between start_date and end_date;
  if v_period is null or v_period = 'locked' then raise exception 'The period containing % is not open', p_date using errcode = 'check_violation'; end if;
  if exists (select 1 from public.depreciation_entries e join public.depreciation_runs r on r.id = e.run_id join public.journals j on j.id = r.journal_id
             where e.asset_id = a.id and j.status not in ('posted', 'reversed')) then
    raise exception 'Approve (or cancel) the pending depreciation journal first' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.depreciation_entries e join public.depreciation_runs r on r.id = e.run_id where e.asset_id = a.id and r.month >= date_trunc('month', p_date)) then
    raise exception 'Depreciation has already been charged for the month of disposal or later — cancel or reverse that run first' using errcode = 'check_violation';
  end if;
  v_prev := (date_trunc('month', p_date) - interval '1 day')::date;
  v_accum := app.asset_accum_charged(a.id);
  if v_accum < app.asset_accum_due(a.id, v_prev) then
    raise exception 'Run depreciation up to % first', to_char(v_prev, 'Mon YYYY') using errcode = 'check_violation';
  end if;
  if p_kind = 'sold' then
    select * into v_line from public.sales_invoice_lines where id = p_invoice_line and organization_id = a.organization_id;
    select * into v_inv from public.sales_invoices where id = v_line.sales_invoice_id;
    if v_line.id is null or v_inv.status <> 'posted' or v_inv.doc_type <> 'invoice' then
      raise exception 'Choose the posted sales invoice line for the sale' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.accounts where id = v_line.account_id and subtype = 'disposal_clearing') then
      raise exception 'The sales invoice line must be on the asset disposals clearing account (1520)' using errcode = 'check_violation';
    end if;
    v_proceeds := v_line.net;
  elsif p_invoice_line is not null then
    raise exception 'A scrapped asset has no sales invoice' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('fixed_asset');
  insert into public.journals (organization_id, entry_date, memo, source, status, prepared_by)
  values (a.organization_id, p_date, 'Disposal of ' || a.asset_no || ' ' || a.name || ' (' || p_kind || ')', 'disposal', 'pending', v_uid) returning id into v_j;
  v_diff := a.cost - v_accum - v_proceeds;                                     -- > 0 loss, < 0 gain
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, description)
  select v_j, a.organization_id, row_number() over (order by x.o), x.acct, x.dr, x.cr, a.asset_no || ' ' || x.d from (values
    (a.accum_account_id, v_accum, 0::bigint, 'accumulated depreciation removed', 1),
    (app.subtype_account(a.organization_id, 'disposal_clearing'), v_proceeds, 0::bigint, 'sale proceeds', 2),
    (case when v_diff > 0 then app.subtype_account(a.organization_id, 'disposal_loss') else app.subtype_account(a.organization_id, 'disposal_gain') end,
       greatest(v_diff, 0), greatest(-v_diff, 0), case when v_diff > 0 then 'loss on disposal' else 'gain on disposal' end, 3),
    (a.asset_account_id, 0::bigint, a.cost, 'cost removed', 4)) x(acct, dr, cr, d, o)
  where x.dr + x.cr > 0;
  update public.fixed_assets set status = 'disposed', disposed_on = p_date, disposal_kind = p_kind, disposal_invoice_line_id = v_line.id,
         disposal_proceeds = case when p_kind = 'sold' then v_proceeds end, disposal_journal_id = v_j
   where id = a.id;
  perform app.set_ctx(null);
  return v_j;
end $$;

create or replace function app.cancel_disposal(p_asset uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.fixed_assets; v_status public.journal_status;
begin
  select * into a from public.fixed_assets where id = p_asset for update;
  if a.id is null or a.status <> 'disposed' then raise exception 'The asset is not disposed of' using errcode = 'check_violation'; end if;
  perform app.require(a.organization_id, 'prepare');
  select status into v_status from public.journals where id = a.disposal_journal_id;
  if v_status in ('posted', 'reversed') then raise exception 'The disposal journal is posted — reverse it instead' using errcode = 'check_violation'; end if;
  perform app.set_ctx('fixed_asset');
  update public.fixed_assets set status = 'active', disposed_on = null, disposal_kind = null, disposal_invoice_line_id = null, disposal_proceeds = null, disposal_journal_id = null
   where id = a.id;
  delete from public.journals where id = a.disposal_journal_id;
  perform app.set_ctx(null);
end $$;

-- ── What the screen shows ────────────────────────────────────────────────────────────────
-- The register at a date: each asset with cost, accumulated depreciation (posted), book value; the ledger check per
-- account; bill lines on fixed-asset accounts not yet in the register; the runs; the next month to run.
create or replace function app.asset_register(p_org uuid, p_as_at date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app.require(p_org, 'view');
  with posted as (
    select e.asset_id, sum(e.amount) amt from public.depreciation_entries e join public.depreciation_runs r on r.id = e.run_id
    join public.journals j on j.id = r.journal_id
    where e.organization_id = p_org and j.status in ('posted', 'reversed') and j.entry_date <= p_as_at group by e.asset_id),
  pending as (
    select e.asset_id, sum(e.amount) amt from public.depreciation_entries e join public.depreciation_runs r on r.id = e.run_id
    join public.journals j on j.id = r.journal_id where e.organization_id = p_org and j.status not in ('posted', 'reversed') group by e.asset_id),
  assets as (
    select a.*, coalesce(p.amt, 0) + a.opening_accum accum, coalesce(q.amt, 0) pending_amt,
           (a.status = 'disposed' and a.disposed_on <= p_as_at and dj.status in ('posted', 'reversed')) gone,
           dj.status::text disposal_journal_status, c.name category_name
    from public.fixed_assets a left join posted p on p.asset_id = a.id left join pending q on q.asset_id = a.id
    left join public.journals dj on dj.id = a.disposal_journal_id left join public.asset_categories c on c.code = a.category_code
    where a.organization_id = p_org)
  select jsonb_build_object(
    'as_at', p_as_at,
    'assets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'asset_no', asset_no, 'name', name, 'description', description, 'category_code', category_code,
        'category_name', category_name, 'location', location, 'tag_no', tag_no, 'purchase_date', purchase_date, 'cost', cost, 'residual', residual, 'method', method,
        'life_months', life_months, 'rate_bp', rate_bp, 'units_total', units_total, 'units_name', units_name, 'opening_accum', opening_accum, 'opening_units', opening_units,
        'opening_as_at', opening_as_at, 'asset_account_id', asset_account_id, 'accum_account_id', accum_account_id, 'expense_account_id', expense_account_id,
        'source_bill_line_id', source_bill_line_id, 'status', status, 'disposed_on', disposed_on, 'disposal_kind', disposal_kind, 'disposal_proceeds', disposal_proceeds,
        'disposal_journal_id', disposal_journal_id, 'disposal_journal_status', disposal_journal_status,
        'accum', accum, 'pending', pending_amt, 'nbv', cost - accum, 'in_books', purchase_date <= p_as_at and not gone,
        'charged', exists (select 1 from public.depreciation_entries e where e.asset_id = x.id)) order by asset_no) from assets x), '[]'),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('account_id', acc.id, 'code', acc.code, 'name', acc.name, 'kind', g.kind,
        'register', g.amt, 'ledger', case when g.kind = 'cost' then app.account_balance(acc.id, p_as_at) else -app.account_balance(acc.id, p_as_at) end) order by acc.code)
      from (select asset_account_id acct, 'cost' kind, sum(cost) filter (where purchase_date <= p_as_at and not gone) amt from assets group by 1
            union all select accum_account_id, 'accum', sum(accum) filter (where purchase_date <= p_as_at and not gone) from assets group by 1) g
      join public.accounts acc on acc.id = g.acct), '[]'),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'bill_id', b.id, 'supplier_invoice_no', b.supplier_invoice_no, 'bill_date', b.bill_date,
        'description', l.description, 'account_code', acc.code, 'cost', l.net + case when l.tax_code in ('SR', 'BLK') then l.vat - l.recoverable_vat else 0 end) order by b.bill_date, l.line_no)
      from public.purchase_bill_lines l join public.purchase_bills b on b.id = l.purchase_bill_id join public.accounts acc on acc.id = l.account_id
      where l.organization_id = p_org and b.status = 'posted' and b.doc_type = 'bill' and acc.subtype = 'fixed_asset'
        and not exists (select 1 from public.fixed_assets f where f.source_bill_line_id = l.id)), '[]'),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'month', r.month, 'journal_id', r.journal_id, 'journal_no', j.journal_no, 'status', j.status,
        'total', (select sum(amount) from public.depreciation_entries e where e.run_id = r.id)) order by r.month desc)
      from public.depreciation_runs r join public.journals j on j.id = r.journal_id where r.organization_id = p_org), '[]'),
    'next_month', coalesce((select (max(month) + interval '1 month')::date from public.depreciation_runs where organization_id = p_org),
                           (select date_trunc('month', min(coalesce((opening_as_at + interval '1 month')::date, purchase_date)))::date from public.fixed_assets where organization_id = p_org)),
    'sale_lines', coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'invoice_no', s.invoice_no, 'issue_date', s.issue_date, 'description', l.description, 'net', l.net) order by s.issue_date)
      from public.sales_invoice_lines l join public.sales_invoices s on s.id = l.sales_invoice_id join public.accounts acc on acc.id = l.account_id
      where l.organization_id = p_org and s.status = 'posted' and s.doc_type = 'invoice' and acc.subtype = 'disposal_clearing'
        and not exists (select 1 from public.fixed_assets f where f.disposal_invoice_line_id = l.id)), '[]')
  ) into v;
  return v;
end $$;

-- One asset's schedule over its whole life (projected), with what has been charged — the drill-down (Principle 10).
create or replace function app.asset_schedule_view(p_asset uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.fixed_assets; v_upto date;
begin
  select * into a from public.fixed_assets where id = p_asset;
  if a.id is null then raise exception 'Asset not found' using errcode = 'no_data_found'; end if;
  perform app.require(a.organization_id, 'view');
  v_upto := case when a.method = 'units' then greatest(current_date, coalesce((select max(month) from public.asset_usage where asset_id = a.id), current_date))
                 when a.life_months is not null then (date_trunc('month', a.purchase_date) + make_interval(months => a.life_months - 1))::date
                 else (date_trunc('month', a.purchase_date) + interval '600 months')::date end;
  return coalesce((select jsonb_agg(jsonb_build_object('month', s.month, 'charge', s.charge, 'nbv', s.nbv,
      'charged', (select e.amount from public.depreciation_entries e join public.depreciation_runs r on r.id = e.run_id where e.asset_id = a.id and r.month = s.month),
      'units', (select u.units from public.asset_usage u where u.asset_id = a.id and u.month = s.month)) order by s.month)
    from app.asset_schedule(a.id, v_upto) s where s.charge <> 0 or a.method = 'units'), '[]');
end $$;

-- ── API ──────────────────────────────────────────────────────────────────────────────────
grant execute on function app.save_fixed_asset(uuid, uuid, jsonb), app.set_asset_usage(uuid, date, bigint), app.run_depreciation(uuid, date),
  app.cancel_depreciation_run(uuid), app.dispose_asset(uuid, date, text, uuid), app.cancel_disposal(uuid), app.asset_register(uuid, date),
  app.asset_schedule_view(uuid) to authenticated;
create function public.save_fixed_asset(p_id uuid, p_organization_id uuid, p_asset jsonb) returns uuid language sql security invoker set search_path = '' as $$ select app.save_fixed_asset(p_id, p_organization_id, p_asset) $$;
create function public.set_asset_usage(p_asset_id uuid, p_month date, p_units bigint) returns void language sql security invoker set search_path = '' as $$ select app.set_asset_usage(p_asset_id, p_month, p_units) $$;
create function public.run_depreciation(p_organization_id uuid, p_month date) returns uuid language sql security invoker set search_path = '' as $$ select app.run_depreciation(p_organization_id, p_month) $$;
create function public.cancel_depreciation_run(p_run_id uuid) returns void language sql security invoker set search_path = '' as $$ select app.cancel_depreciation_run(p_run_id) $$;
create function public.dispose_asset(p_asset_id uuid, p_date date, p_kind text, p_invoice_line_id uuid default null) returns uuid language sql security invoker set search_path = '' as $$ select app.dispose_asset(p_asset_id, p_date, p_kind, p_invoice_line_id) $$;
create function public.cancel_disposal(p_asset_id uuid) returns void language sql security invoker set search_path = '' as $$ select app.cancel_disposal(p_asset_id) $$;
create function public.asset_register(p_organization_id uuid, p_as_at date) returns jsonb language sql security invoker set search_path = '' as $$ select app.asset_register(p_organization_id, p_as_at) $$;
create function public.asset_schedule_view(p_asset_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select app.asset_schedule_view(p_asset_id) $$;
revoke all on function public.save_fixed_asset(uuid, uuid, jsonb), public.set_asset_usage(uuid, date, bigint), public.run_depreciation(uuid, date),
  public.cancel_depreciation_run(uuid), public.dispose_asset(uuid, date, text, uuid), public.cancel_disposal(uuid), public.asset_register(uuid, date),
  public.asset_schedule_view(uuid) from public, anon;
grant execute on function public.save_fixed_asset(uuid, uuid, jsonb), public.set_asset_usage(uuid, date, bigint), public.run_depreciation(uuid, date),
  public.cancel_depreciation_run(uuid), public.dispose_asset(uuid, date, text, uuid), public.cancel_disposal(uuid), public.asset_register(uuid, date),
  public.asset_schedule_view(uuid) to authenticated;
