-- P3-05 · Compliance calendar and deadline reminders (Spec 03 F-20 · CFG-07, CFG-12 · D-50, D-51).
--   • Deadlines come from the rules in `compliance_rules` (tax rules, not code): VAT return due dates and CT return due
--     dates are those of the tax periods (vat.return_due_days / ct.return_due_months); licence renewal = licence expiry
--     + offset (−30 days); e-invoicing ASP appointment = the configured date, for every client (D-51, VERIFY).
--   • D-50: reminders (firm setting reminder_lead_days, e.g. 14 / 7 / 1 days before) go to the client's firm staff
--     (assigned Firm Accountants and the Manager — or the firm's Firm Admins if none) and to its Client Owners and
--     Client Staff; never to Read-only users. The daily job runs on the server with the secret key.
--   • email_log keeps every email sent (who, what, provider id) and prevents the same reminder twice (CFG-12).

create or replace function app.compliance_items(p_org uuid)
returns table (rule_key text, kind text, title text, period_start date, period_end date, due_date date, detail text, status text, tab text)
language sql stable security definer set search_path = '' as $$
  -- VAT returns
  select 'vat_return', 'vat', cr.title, tp.start_date, tp.end_date, tp.due_date, null::text,
         case when r.status = 'filed' then 'done' when r.status = 'approved' then 'ready_to_file'
              when tp.due_date < current_date then 'overdue' else 'open' end, 'vat'
  from public.tax_periods tp
  join public.compliance_rules cr on cr.key = 'vat_return' and cr.is_active
  left join public.vat_returns r on r.tax_period_id = tp.id
  where tp.organization_id = p_org and tp.kind = 'vat'
  union all
  -- Corporate Tax returns (the return itself is built in Phase 5)
  select 'ct_return', 'ct', cr.title, tp.start_date, tp.end_date, tp.due_date, null,
         case when tp.due_date < current_date then 'overdue' else 'open' end, 'reports'
  from public.tax_periods tp join public.compliance_rules cr on cr.key = 'ct_return' and cr.is_active
  where tp.organization_id = p_org and tp.kind = 'ct'
  union all
  -- Trade licence renewal: the reminder date is the expiry + offset (CFG-07: 30 Nov → 31 Oct)
  select 'licence_renewal', 'licence', cr.title, null, o.licence_expiry, o.licence_expiry + cr.offset_days,
         'Licence expires ' || to_char(o.licence_expiry, 'DD Mon YYYY'),
         case when o.licence_expiry < current_date then 'overdue' else 'open' end, 'overview'
  from public.organizations o join public.compliance_rules cr on cr.key = 'licence_renewal' and cr.is_active
  where o.id = p_org and o.licence_expiry is not null and cr.offset_days is not null
  union all
  -- E-invoicing: appoint an Accredited Service Provider by the configured date (D-51, VERIFY)
  select 'einvoicing_asp', 'einvoicing', cr.title, null, null, (app.config_value(cr.offset_config_key, current_date) #>> '{}')::date,
         'Rule marked VERIFY', case when (app.config_value(cr.offset_config_key, current_date) #>> '{}')::date < current_date then 'overdue' else 'open' end, 'overview'
  from public.compliance_rules cr
  where cr.key = 'einvoicing_asp' and cr.is_active and app.config_value(cr.offset_config_key, current_date) is not null
$$;

-- The calendar for everyone the signed-in user may see: items due between the dates, plus anything overdue.
create or replace function app.compliance_calendar(p_from date, p_to date)
returns table (organization_id uuid, legal_name text, rule_key text, kind text, title text, period_start date, period_end date,
               due_date date, detail text, status text, tab text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.legal_name, i.rule_key, i.kind, i.title, i.period_start, i.period_end, i.due_date, i.detail, i.status, i.tab
  from public.organizations o, lateral app.compliance_items(o.id) i
  where o.status <> 'archived' and o.id in (select app.orgs_with('view'))
    and ((i.due_date between p_from and p_to) or (i.status = 'overdue' and i.due_date < p_from))
  order by i.due_date, o.legal_name, i.title
$$;

-- D-50 · who is reminded about a client's deadlines
create or replace function app.reminder_recipients(p_org uuid)
returns table (email text, full_name text, audience text)
language sql stable security definer set search_path = '' as $$
  with firm_staff as (
    select p.email::text, p.full_name, 'firm'::text as audience
    from public.org_memberships m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org and m.role = 'firm_accountant' and p.status = 'active'
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
    union
    select p.email::text, p.full_name, 'firm' from public.organizations o join public.profiles p on p.id = o.manager_id
    where o.id = p_org and p.status = 'active'
  ), fallback as (
    select p.email::text, p.full_name, 'firm'::text as audience
    from public.organizations o join public.firm_members f on f.firm_id = o.firm_id join public.profiles p on p.id = f.user_id
    where o.id = p_org and f.active and f.role = 'firm_admin' and p.status = 'active' and not exists (select 1 from firm_staff)
  ), client as (
    select p.email::text, p.full_name, 'client'::text as audience
    from public.org_memberships m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org and m.role in ('client_owner', 'client_staff') and p.status = 'active'
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
  )
  select * from firm_staff union select * from fallback union select * from client
$$;

-- For the daily job (secret key only): today's reminders — deadlines exactly N days ahead, N in the firm's lead days.
create or replace function app.due_reminders(p_today date)
returns table (organization_id uuid, legal_name text, rule_key text, title text, due_date date, days_left int, detail text,
               email text, full_name text, audience text, dedupe_key text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.legal_name, i.rule_key, i.title, i.due_date, (i.due_date - p_today)::int, i.detail, r.email, r.full_name, r.audience,
         concat_ws('|', o.id, i.rule_key, i.due_date, (i.due_date - p_today))
  from public.organizations o
  cross join lateral app.compliance_items(o.id) i
  cross join lateral app.reminder_recipients(o.id) r
  where o.status <> 'archived' and i.status in ('open', 'ready_to_file')
    and (i.due_date - p_today) in (select (x #>> '{}')::int from jsonb_array_elements(coalesce(app.firm_setting(o.firm_id, 'reminder_lead_days'), '[14,7,1]'::jsonb)) x)
  order by o.legal_name, i.due_date, r.email
$$;

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  kind text not null check (kind in ('invite', 'deadline_reminder', 'approval_waiting', 'integrity_alert', 'test')),
  to_email text not null,
  subject text not null,
  organization_id uuid references public.organizations (id) on delete restrict,
  dedupe_key text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text
);
alter table public.email_log enable row level security;
create unique index email_log_once on public.email_log (kind, to_email, dedupe_key) where dedupe_key is not null and status = 'sent';
create index email_log_org_idx on public.email_log (organization_id);
create index email_log_sent_idx on public.email_log (sent_at desc);
create policy mfa on public.email_log as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.email_log for select to authenticated using ((select app.is_super_admin()));
grant select on public.email_log to authenticated;
grant select, insert on public.email_log to service_role;

create or replace function app.email_log_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'The email log is a permanent record' using errcode = 'insufficient_privilege';
end $$;
create trigger append_only before update or delete on public.email_log for each row execute function app.email_log_append_only();

grant execute on function app.compliance_calendar(date, date), app.compliance_items(uuid) to authenticated;
grant execute on function app.due_reminders(date), app.compliance_items(uuid), app.reminder_recipients(uuid) to service_role;
create function public.compliance_calendar(p_from date, p_to date)
returns table (organization_id uuid, legal_name text, rule_key text, kind text, title text, period_start date, period_end date,
               due_date date, detail text, status text, tab text)
language sql security invoker set search_path = '' as $$ select * from app.compliance_calendar(p_from, p_to) $$;
create function public.due_reminders(p_today date)
returns table (organization_id uuid, legal_name text, rule_key text, title text, due_date date, days_left int, detail text,
               email text, full_name text, audience text, dedupe_key text)
language sql security invoker set search_path = '' as $$ select * from app.due_reminders(p_today) $$;
revoke all on function public.compliance_calendar(date, date), public.due_reminders(date) from public, anon, authenticated;
grant execute on function public.compliance_calendar(date, date) to authenticated;
grant execute on function public.due_reminders(date) to service_role;
