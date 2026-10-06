-- P1-07 · Roles, permissions and Row-Level Security on every table (Spec 02 §2–§3 · Spec 04 §4).
-- Helpers live in the private `app` schema (not exposed through the API — RBAC-19).

-- ── Permission matrix (fixed in code, read-only in the UI — Spec 02 §3.1 / D-14) ─────────
-- Super Admin is a flag on top of Firm Admin, so it has no row here; platform-only powers
-- (tax rules, app name, reference data, suspending users) check app.is_super_admin().
create table app.role_permissions (
  role text not null check (role in ('firm_admin', 'firm_accountant', 'client_owner', 'client_staff', 'read_only')),
  perm text not null,
  primary key (role, perm)
);
insert into app.role_permissions (role, perm)
select r.role, p.perm from (values
  ('view',                '{firm_admin,firm_accountant,client_owner,client_staff,read_only}'),
  ('export',              '{firm_admin,firm_accountant,client_owner,client_staff,read_only}'),
  ('prepare',             '{firm_admin,firm_accountant,client_owner,client_staff}'),
  ('upload',              '{firm_admin,firm_accountant,client_owner,client_staff}'),
  ('post_journal',        '{firm_admin}'),
  ('reverse_journal',     '{firm_admin}'),
  ('approve_document',    '{firm_admin,client_owner}'),
  ('record_payment',      '{firm_admin,firm_accountant,client_owner}'),
  ('approve_refund',      '{firm_admin,client_owner}'),
  ('bank_match',          '{firm_admin,firm_accountant}'),
  ('prepare_vat',         '{firm_admin,firm_accountant}'),
  ('approve_vat',         '{firm_admin}'),
  ('file_vat',            '{firm_admin}'),
  ('lock_period',         '{firm_admin}'),
  ('reopen_period',       '{firm_admin}'),
  ('manage_client',       '{firm_admin}'),
  ('manage_coa',          '{firm_admin}'),
  ('assign_staff',        '{firm_admin}'),
  ('invite_client_users', '{firm_admin,client_owner}'),
  ('view_audit',          '{firm_admin,firm_accountant,client_owner,read_only}')
) as p(perm, roles), unnest(p.roles::text[]) as r(role);
alter table app.role_permissions enable row level security;   -- not exposed; read by definer helpers only
revoke all on app.role_permissions from public, anon, authenticated;

-- ── Helpers (security definer, stable, empty search_path) ────────────────────────────────
create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active')
$$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and status = 'active' and is_super_admin)
$$;

create or replace function app.firm_role(p_firm uuid) returns public.firm_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.firm_members m
  join public.firms f on f.id = m.firm_id and f.status = 'active'
  join public.profiles p on p.id = m.user_id and p.status = 'active'
  where m.firm_id = p_firm and m.user_id = (select auth.uid()) and m.active
$$;

-- The caller's effective role for a client: Firm Admins inherit every client of their firm;
-- everyone else needs a current access grant (R5: read-only stops after valid_to).
create or replace function app.org_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'firm_admin' from public.organizations o
      where o.id = p_org and app.firm_role(o.firm_id) = 'firm_admin'),
    (select m.role::text from public.org_memberships m
       join public.organizations o on o.id = m.organization_id
       join public.profiles p on p.id = m.user_id and p.status = 'active'
      where m.organization_id = p_org and m.user_id = (select auth.uid())
        and current_date >= m.valid_from and current_date <= coalesce(m.valid_to, 'infinity'::date)
        and (m.role <> 'firm_accountant' or app.firm_role(o.firm_id) is not null)))
$$;

create or replace function app.has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.role_permissions where role = app.org_role(p_org) and perm = p_perm)
$$;

-- Set of clients on which the caller holds a permission. Policies use
-- `organization_id in (select app.orgs_with('view'))` so it is evaluated once per query.
create or replace function app.orgs_with(p_perm text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select o.id
  from public.organizations o
  join public.firm_members m on m.firm_id = o.firm_id and m.user_id = (select auth.uid()) and m.active and m.role = 'firm_admin'
  join public.firms f on f.id = o.firm_id and f.status = 'active'
  join public.profiles p on p.id = m.user_id and p.status = 'active'
  where exists (select 1 from app.role_permissions where role = 'firm_admin' and perm = p_perm)
  union
  select om.organization_id
  from public.org_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.profiles p on p.id = om.user_id and p.status = 'active'
  join app.role_permissions rp on rp.role = om.role::text and rp.perm = p_perm
  where om.user_id = (select auth.uid())
    and current_date >= om.valid_from and current_date <= coalesce(om.valid_to, 'infinity'::date)
    and (om.role <> 'firm_accountant' or app.firm_role(o.firm_id) is not null)
$$;

-- R6: firm users must be signed in with two-factor (aal2); client users are not forced (yet).
create or replace function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (select 1 from public.firm_members where user_id = (select auth.uid()) and active)
$$;

create or replace function app.actor_role(p_org uuid, p_firm uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when app.is_super_admin() then 'super_admin'
              when p_org is not null then app.org_role(p_org)
              when p_firm is not null then app.firm_role(p_firm)::text end
$$;

create or replace function app.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
      or app.is_super_admin()
      or exists (select 1 from public.firm_members mine join public.firm_members theirs on theirs.firm_id = mine.firm_id
                 where mine.user_id = (select auth.uid()) and mine.active and theirs.user_id = p_user)
      or exists (select 1 from public.org_memberships om
                 where om.user_id = p_user and om.organization_id in (select app.orgs_with('view')))
$$;

grant execute on function app.is_active_user(), app.is_super_admin(), app.firm_role(uuid), app.org_role(uuid),
  app.has_perm(uuid, text), app.orgs_with(text), app.mfa_ok(), app.can_see_profile(uuid) to authenticated;

-- ── Super Admin actions on people (R4, R7, DM-13, RBAC-10/11/24) ─────────────────────────
create or replace function public.set_super_admin(p_user uuid, p_value boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() or not app.mfa_ok() then
    raise exception 'Only a Super Admin (signed in with two-factor) can change Super Admins' using errcode = 'insufficient_privilege';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'You cannot change your own Super Admin flag' using errcode = 'insufficient_privilege'; -- R4
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('set_super_admin');
  perform set_config('app.reason', p_reason, true);
  update public.profiles set is_super_admin = p_value where id = p_user;
  if not found then raise exception 'User not found' using errcode = 'no_data_found'; end if;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

create or replace function public.set_user_status(p_user uuid, p_status public.user_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() or not app.mfa_ok() then
    raise exception 'Only a Super Admin (signed in with two-factor) can suspend or reactivate users' using errcode = 'insufficient_privilege';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'You cannot change your own status' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('set_user_status');
  perform set_config('app.reason', p_reason, true);
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'User not found' using errcode = 'no_data_found'; end if;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;
revoke all on function public.set_super_admin(uuid, boolean, text), public.set_user_status(uuid, public.user_status, text) from public, anon;
grant execute on function public.set_super_admin(uuid, boolean, text), public.set_user_status(uuid, public.user_status, text) to authenticated;

-- ── Restrictive MFA policy on every business table (R6) ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'audit_log', 'currencies', 'vat_boxes', 'emirates', 'tax_codes', 'ct_tags', 'coa_templates',
    'coa_template_accounts', 'firms', 'profiles', 'firm_members', 'organizations', 'org_memberships',
    'invitations', 'accounts', 'accounting_periods', 'tax_periods', 'number_sequences', 'journals',
    'journal_lines', 'config_keys', 'config_versions', 'config_values', 'firm_settings',
    'email_templates', 'compliance_rules']
  loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated
                    using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
  end loop;
end $$;

-- ── Reference data & configuration: everyone signed in reads; Super Admin writes ─────────
do $$
declare t text;
begin
  foreach t in array array['currencies', 'vat_boxes', 'emirates', 'tax_codes', 'ct_tags', 'coa_templates',
                           'coa_template_accounts', 'config_keys', 'config_versions', 'config_values',
                           'compliance_rules']
  loop
    execute format('create policy sel on public.%I for select to authenticated using (true)', t);
    execute format('create policy ins on public.%I for insert to authenticated with check ((select app.is_super_admin()))', t);
    execute format('create policy upd on public.%I for update to authenticated
                    using ((select app.is_super_admin())) with check ((select app.is_super_admin()))', t);
  end loop;
end $$;
create policy del on public.config_versions for delete to authenticated using ((select app.is_super_admin()));
create policy del on public.config_values for delete to authenticated using ((select app.is_super_admin()));
grant select, insert, update on public.config_keys, public.config_versions, public.config_values,
  public.compliance_rules to authenticated;
grant delete on public.config_versions, public.config_values to authenticated;

-- Platform settings: the public keys (app name, logo) are readable before sign-in.
create policy sel_public on public.platform_settings for select to anon using (is_public);
create policy sel on public.platform_settings for select to authenticated using (is_public or (select app.is_active_user()));
create policy upd on public.platform_settings for update to authenticated
  using ((select app.is_super_admin()) and (select app.mfa_ok())) with check ((select app.is_super_admin()) and (select app.mfa_ok()));
grant select on public.platform_settings to anon, authenticated;
grant update (value) on public.platform_settings to authenticated;

create policy sel on public.email_templates for select to authenticated using ((select app.is_super_admin()));
create policy upd on public.email_templates for update to authenticated
  using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
grant select, update (subject, body) on public.email_templates to authenticated;

-- ── Firms, people, memberships ───────────────────────────────────────────────────────────
create policy sel on public.firms for select to authenticated
  using ((select app.firm_role(id)) is not null or (select app.is_super_admin()));
create policy ins on public.firms for insert to authenticated with check ((select app.is_super_admin()));
create policy upd on public.firms for update to authenticated
  using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
grant select, insert on public.firms to authenticated;
grant update (legal_name, status, trn, tax_agent_number, emirate_code, address, logo_path) on public.firms to authenticated;

create policy sel on public.profiles for select to authenticated using ((select app.can_see_profile(id)));
create policy upd on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy sel on public.firm_members for select to authenticated
  using ((select app.firm_role(firm_id)) is not null or (select app.is_super_admin()));
create policy ins on public.firm_members for insert to authenticated
  with check (((select app.firm_role(firm_id)) = 'firm_admin' and role = 'firm_accountant') or (select app.is_super_admin()));
create policy upd on public.firm_members for update to authenticated
  using ((select app.firm_role(firm_id)) = 'firm_admin' or (select app.is_super_admin()))
  with check (((select app.firm_role(firm_id)) = 'firm_admin' and role = 'firm_accountant') or (select app.is_super_admin()));
grant select, insert on public.firm_members to authenticated;
grant update (role, active) on public.firm_members to authenticated;

create policy sel on public.firm_settings for select to authenticated using ((select app.firm_role(firm_id)) is not null);
create policy ins on public.firm_settings for insert to authenticated
  with check ((select app.firm_role(firm_id)) = 'firm_admin'
              and (key not in ('allowed_email_domains', 'invite_expiry_days', 'reminder_lead_days', 'daily_digest',
                               'integrity_alert_recipients') or (select app.is_super_admin())));
create policy upd on public.firm_settings for update to authenticated
  using ((select app.firm_role(firm_id)) = 'firm_admin')
  with check ((select app.firm_role(firm_id)) = 'firm_admin'
              and (key not in ('allowed_email_domains', 'invite_expiry_days', 'reminder_lead_days', 'daily_digest',
                               'integrity_alert_recipients') or (select app.is_super_admin())));
grant select, insert on public.firm_settings to authenticated;
grant update (value) on public.firm_settings to authenticated;

create policy sel on public.organizations for select to authenticated
  using (id in (select app.orgs_with('view')));
create policy ins on public.organizations for insert to authenticated
  with check ((select app.firm_role(firm_id)) = 'firm_admin');
create policy upd on public.organizations for update to authenticated
  using (id in (select app.orgs_with('manage_client')))
  with check (id in (select app.orgs_with('manage_client')));
grant select, insert on public.organizations to authenticated;
grant update (legal_name, trade_name, trn, ct_trn, licence_no, licence_authority, licence_expiry, emirate_code,
  industry, fy_start_month, vat_registered, vat_period, vat_first_period_end, ct_regime, prior_year_revenue,
  manager_id, status, brand_color) on public.organizations to authenticated;

create policy sel on public.org_memberships for select to authenticated
  using (user_id = (select auth.uid()) or organization_id in (select app.orgs_with('view')));
create policy ins on public.org_memberships for insert to authenticated
  with check (organization_id in (select app.orgs_with('assign_staff')));
create policy upd on public.org_memberships for update to authenticated
  using (organization_id in (select app.orgs_with('assign_staff')))
  with check (organization_id in (select app.orgs_with('assign_staff')));
create policy del on public.org_memberships for delete to authenticated
  using (organization_id in (select app.orgs_with('assign_staff')));
grant select, insert, delete on public.org_memberships to authenticated;
grant update (role, valid_from, valid_to) on public.org_memberships to authenticated;

-- Invitations are created and accepted by the server (Vercel function, P1-10).
create policy sel on public.invitations for select to authenticated
  using ((select app.firm_role(firm_id)) = 'firm_admin'
         or organization_id in (select app.orgs_with('invite_client_users')));
grant select on public.invitations to authenticated;

-- ── Client books ─────────────────────────────────────────────────────────────────────────
create policy sel on public.accounts for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.accounts for insert to authenticated with check (organization_id in (select app.orgs_with('manage_coa')));
create policy upd on public.accounts for update to authenticated
  using (organization_id in (select app.orgs_with('manage_coa')))
  with check (organization_id in (select app.orgs_with('manage_coa')));
grant select, insert on public.accounts to authenticated;
grant update (code, name, subtype, report_group, ct_tag, is_control, is_active, parent_id) on public.accounts to authenticated;

create policy sel on public.accounting_periods for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.accounting_periods for insert to authenticated with check (organization_id in (select app.orgs_with('manage_client')));
create policy del on public.accounting_periods for delete to authenticated using (organization_id in (select app.orgs_with('manage_client')));
grant select, insert, delete on public.accounting_periods to authenticated;

create policy sel on public.tax_periods for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.tax_periods for insert to authenticated with check (organization_id in (select app.orgs_with('manage_client')));
create policy del on public.tax_periods for delete to authenticated using (organization_id in (select app.orgs_with('manage_client')));
grant select, insert, delete on public.tax_periods to authenticated;

create policy sel on public.number_sequences for select to authenticated using (organization_id in (select app.orgs_with('view')));
grant select on public.number_sequences to authenticated;

create policy sel on public.journals for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.journals for insert to authenticated with check (organization_id in (select app.orgs_with('prepare')));
create policy upd on public.journals for update to authenticated
  using (organization_id in (select app.orgs_with('prepare')))
  with check (organization_id in (select app.orgs_with('prepare')));
create policy del on public.journals for delete to authenticated using (organization_id in (select app.orgs_with('prepare')));
grant select, delete on public.journals to authenticated;
grant insert (id, organization_id, entry_date, source, memo, status) on public.journals to authenticated;
grant update (entry_date, memo, status) on public.journals to authenticated;

create policy sel on public.journal_lines for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.journal_lines for insert to authenticated with check (organization_id in (select app.orgs_with('prepare')));
create policy upd on public.journal_lines for update to authenticated
  using (organization_id in (select app.orgs_with('prepare')))
  with check (organization_id in (select app.orgs_with('prepare')));
create policy del on public.journal_lines for delete to authenticated using (organization_id in (select app.orgs_with('prepare')));
grant select, delete on public.journal_lines to authenticated;
grant insert (id, journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy,
  tax_code, vat_amount, supply_emirate, description) on public.journal_lines to authenticated;
grant update (line_no, account_id, debit, credit, currency, fx_rate, amount_fcy, tax_code, vat_amount,
  supply_emirate, description) on public.journal_lines to authenticated;

-- ── Audit log: read according to role; nobody writes except the audit trigger ───────────
-- Super Admins see platform-level rows; client rows only through their own firm (D-20).
create policy sel on public.audit_log for select to authenticated using (
  (organization_id is not null and organization_id in (select app.orgs_with('view_audit')))
  or (organization_id is null and firm_id is not null and (select app.firm_role(firm_id)) = 'firm_admin')
  or (organization_id is null and firm_id is null and (select app.is_super_admin())));
grant select on public.audit_log to authenticated;

-- ── Private storage for documents: documents/{organization_id}/… (Spec 01 §4.7, S-2.5/2.7) ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'text/csv',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy documents_select on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (select app.mfa_ok())
  and (storage.foldername(name))[1] in (select o::text from app.orgs_with('view') o));
create policy documents_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (select app.mfa_ok())
  and (storage.foldername(name))[1] in (select o::text from app.orgs_with('upload') o));
