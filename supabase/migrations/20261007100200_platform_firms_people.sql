-- P1-02 (+ organizations from P1-03) · Platform, firms, people and access (Spec 01 §4.1, §4.3;
-- Spec 02 §1.1, §2.4). Clients are created here because memberships point at them.

create domain public.trn as text check (value ~ '^1[0-9]{14}$');
comment on domain public.trn is 'UAE TRN: 15 digits starting with 1 (Spec 03 F-18).';

-- Platform-wide settings owned by TFS Plus (D-20). Never hard-code the app name.
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  is_public boolean not null default false,   -- readable before login (e.g. app name on the sign-in page)
  description text
);
select app.setup_table('public.platform_settings');
insert into public.platform_settings (key, value, is_public, description) values
  ('app_name', '"TFS+ Smart Ledger"', true, 'Product name shown in titles, emails and exports'),
  ('logo_path', 'null', true, 'Storage path of the platform logo'),
  ('email_from', '"onboarding@resend.dev"', false, 'Sender address for app emails (D-24)'),
  ('email_from_name', '"TFS+ Smart Ledger"', false, 'Sender display name'),
  ('email_reply_to', 'null', false, 'Reply-to address'),
  ('support_email', 'null', false, 'Support contact shown to users');

create type public.firm_status as enum ('active', 'suspended');
create table public.firms (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  is_platform_owner boolean not null default false,
  status public.firm_status not null default 'active',
  trn public.trn,
  tax_agent_number text,
  emirate_code text references public.emirates (code) on delete restrict,
  address text,
  logo_path text
);
select app.setup_table('public.firms');
create unique index firms_one_platform_owner on public.firms (is_platform_owner) where is_platform_owner; -- DM-14
create index firms_emirate_idx on public.firms (emirate_code);
insert into public.firms (legal_name, is_platform_owner, emirate_code)
values ('TFS Plus Tax & Accountancy LLC', true, 'AUH');

create type public.user_status as enum ('active', 'suspended');
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null,
  email extensions.citext not null unique,
  is_super_admin boolean not null default false,
  status public.user_status not null default 'active',
  last_sign_in_at timestamptz
);
select app.setup_table('public.profiles');

create type public.firm_role as enum ('firm_admin', 'firm_accountant');
create table public.firm_members (
  firm_id uuid not null references public.firms (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.firm_role not null,
  active boolean not null default true,
  primary key (firm_id, user_id)
);
select app.setup_table('public.firm_members');
create index firm_members_user_idx on public.firm_members (user_id);

create type public.vat_period as enum ('quarterly', 'monthly');
create type public.ct_regime as enum ('standard', 'sbr', 'qfzp');
create type public.org_status as enum ('onboarding', 'active', 'archived');
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete restrict,
  legal_name text not null,
  trade_name text,
  trn public.trn,
  ct_trn text,
  licence_no text,
  licence_authority text,
  licence_expiry date,
  emirate_code text not null references public.emirates (code) on delete restrict,
  industry text,
  base_currency char(3) not null default 'AED' references public.currencies (code) on delete restrict
    check (base_currency = 'AED'),                      -- books are always in AED (D-21)
  fy_start_month smallint not null default 1 check (fy_start_month between 1 and 12),
  vat_registered boolean not null default false,
  vat_period public.vat_period,
  vat_first_period_end date,
  ct_regime public.ct_regime not null default 'standard',
  prior_year_revenue bigint not null default 0 check (prior_year_revenue >= 0),
  manager_id uuid references public.profiles (id) on delete restrict,
  status public.org_status not null default 'onboarding',
  brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  unique (firm_id, trn),
  check (not vat_registered or (trn is not null and vat_period is not null and vat_first_period_end is not null))
);
select app.setup_table('public.organizations');
create index organizations_firm_idx on public.organizations (firm_id);
create index organizations_emirate_idx on public.organizations (emirate_code);
create index organizations_currency_idx on public.organizations (base_currency);
create index organizations_manager_idx on public.organizations (manager_id);

create type public.org_role as enum ('firm_accountant', 'client_owner', 'client_staff', 'read_only');
create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.org_role not null,
  valid_from date not null default current_date,
  valid_to date,
  granted_by uuid references public.profiles (id) on delete restrict,
  unique (organization_id, user_id),
  check (role <> 'read_only' or valid_to is not null),          -- DM-12 / R5
  check (valid_to is null or valid_to >= valid_from)
);
select app.setup_table('public.org_memberships');
create index org_memberships_user_idx on public.org_memberships (user_id);
create index org_memberships_granted_by_idx on public.org_memberships (granted_by);

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  firm_id uuid not null references public.firms (id) on delete restrict,
  organization_id uuid references public.organizations (id) on delete restrict,
  role text not null check (role in ('firm_admin', 'firm_accountant', 'client_owner', 'client_staff', 'read_only')),
  valid_to date,
  invited_by uuid references public.profiles (id) on delete restrict,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  check ((role in ('firm_admin', 'firm_accountant')) = (organization_id is null)),
  check (role <> 'read_only' or valid_to is not null)
);
select app.setup_table('public.invitations');
create index invitations_firm_idx on public.invitations (firm_id);
create index invitations_org_idx on public.invitations (organization_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
create unique index invitations_one_pending on public.invitations (email, firm_id, coalesce(organization_id, firm_id))
  where status = 'pending';

-- A profile row for every login (invite-only sign-up is set in Supabase Auth).
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Guards on profiles: Super Admin flag and status change only through functions;
-- only platform-owner firm admins can be Super Admin (DM-13); last Super Admin protected (R7).
create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.is_super_admin and app.ctx() <> 'bootstrap_super_admin' then
      raise exception 'Super Admin can only be granted by another Super Admin' using errcode = 'insufficient_privilege';
    end if;
    new.status := 'active';
    return new;
  end if;

  if new.id <> old.id or (new.email <> old.email and app.ctx() <> 'sync_email') then
    raise exception 'A profile''s identity cannot be changed' using errcode = 'insufficient_privilege';
  end if;

  if new.is_super_admin is distinct from old.is_super_admin
     and app.ctx() not in ('set_super_admin', 'bootstrap_super_admin') then
    raise exception 'Super Admin can only be changed through set_super_admin()' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and app.ctx() <> 'set_user_status' then
    raise exception 'User status can only be changed through set_user_status()' using errcode = 'insufficient_privilege';
  end if;

  if new.is_super_admin and not exists (
      select 1 from public.firm_members m join public.firms f on f.id = m.firm_id
      where m.user_id = new.id and m.active and m.role = 'firm_admin' and f.is_platform_owner) then
    raise exception 'Only Firm Admins of the platform-owner firm can be Super Admin' using errcode = 'check_violation';
  end if;

  if old.is_super_admin and old.status = 'active'
     and not (new.is_super_admin and new.status = 'active')
     and not exists (select 1 from public.profiles p
                     where p.is_super_admin and p.status = 'active' and p.id <> old.id) then
    raise exception 'The last active Super Admin cannot be removed or suspended' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.profiles
  for each row execute function app.profiles_guard();

-- Guards on firm memberships: nobody changes their own (R4); a Super Admin's owner-firm
-- admin membership can't be dropped while they hold the flag (keeps DM-13 true).
create or replace function app.firm_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.firm_members := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.user_id = (select auth.uid()) then
    raise exception 'You cannot change your own firm role' using errcode = 'insufficient_privilege';
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or not new.active or new.role <> 'firm_admin' or new.firm_id <> old.firm_id)
     and exists (select 1 from public.profiles p join public.firms f on f.id = old.firm_id
                 where p.id = old.user_id and p.is_super_admin and f.is_platform_owner) then
    raise exception 'Remove the Super Admin flag before changing this person''s firm membership' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before insert or update or delete on public.firm_members
  for each row execute function app.firm_members_guard();

-- Client memberships: nobody grants themselves access; Firm Accountant grants only for
-- active staff of the client's firm.
create or replace function app.org_memberships_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.org_memberships := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.user_id = (select auth.uid()) then
    raise exception 'You cannot change your own access' using errcode = 'insufficient_privilege';
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.user_id <> old.user_id) then
      raise exception 'Create a new access grant instead of moving one' using errcode = 'check_violation';
    end if;
    if new.role = 'firm_accountant' and not exists (
        select 1 from public.firm_members m join public.organizations o on o.firm_id = m.firm_id
        where o.id = new.organization_id and m.user_id = new.user_id and m.active) then
      raise exception 'Only active staff of this client''s firm can be assigned as Firm Accountant' using errcode = 'check_violation';
    end if;
    new.granted_by := coalesce((select auth.uid()), new.granted_by);
  end if;
  return v_row;
end $$;
create trigger guard before insert or update or delete on public.org_memberships
  for each row execute function app.org_memberships_guard();

-- Owner-only bootstrap of the first Super Admin (run once from the Supabase SQL editor after
-- the person has been invited in Supabase Auth). Refuses if a Super Admin already exists.
create or replace function app.bootstrap_super_admin(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_firm uuid;
begin
  if exists (select 1 from public.profiles where is_super_admin and status = 'active') then
    raise exception 'A Super Admin already exists; use set_super_admin() instead';
  end if;
  select id into v_user from public.profiles where email = p_email::extensions.citext;
  if v_user is null then
    raise exception 'No login found for %; invite the user in Supabase Auth first', p_email;
  end if;
  select id into v_firm from public.firms where is_platform_owner;
  perform app.set_ctx('bootstrap_super_admin');
  insert into public.firm_members (firm_id, user_id, role) values (v_firm, v_user, 'firm_admin')
    on conflict (firm_id, user_id) do update set role = 'firm_admin', active = true;
  update public.profiles set is_super_admin = true where id = v_user;
  perform app.set_ctx(null);
  return v_user;
end $$;
revoke all on function app.bootstrap_super_admin(text) from public, authenticated, service_role;
