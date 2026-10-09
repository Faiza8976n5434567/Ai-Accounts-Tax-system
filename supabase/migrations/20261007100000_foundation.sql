-- P1-00 · Foundation: clean-up, locked-down privileges, private `app` schema.
-- Spec 04 S-4.1 / S-4.6 · PLAN Phase 0 clean-up.

-- 1. Remove the empty POC tables and functions created on 2026-10-06 (PLAN Phase 0).
drop function if exists public.poc_apply cascade;
drop function if exists public.poc_state cascade;
drop table if exists public.orgs, public.journals, public.purchases, public.sales,
  public.bank_lines, public.audit_log, public.app_meta cascade;

-- 2. Nothing new in `public` is reachable by the API roles unless a migration grants it
--    explicitly (Supabase's default is "everything to anon and authenticated").
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- Postgres lets every role execute new functions by default; per-schema rules can't remove
-- that, so remove it globally. Each function that the API may call is granted explicitly.
alter default privileges for role postgres revoke execute on functions from public;

-- 3. Extensions.
create extension if not exists citext with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- 4. Private schema for helpers (never exposed through the API: Spec 02 §3.1, RBAC-19).
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- 5. Who/when columns on every row (Spec 01 §2 rule 6). Set by the database, not the browser.
create or replace function app.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_at := now();
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce((select auth.uid()), new.updated_by);
  end if;
  return new;
end $$;

-- 6. Transaction-local "context" flag. Database functions (post_journal, …) set it so that
--    triggers can tell a sanctioned state change from a direct table update.
create or replace function app.ctx() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('app.ctx', true), ''), '')
$$;

create or replace function app.set_ctx(p text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform set_config('app.ctx', coalesce(p, ''), true);
end $$;

-- 7. Audit log (P1-06 · Spec 01 §4.12 · Spec 04 S-4.4/S-4.5). Append-only for everyone.
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  organization_id uuid,
  firm_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  reason text,
  txid bigint not null default txid_current()
);
comment on table public.audit_log is 'Append-only audit trail written by triggers. No updates or deletes, ever.';
create index audit_log_org_idx on public.audit_log (organization_id, occurred_at desc);
create index audit_log_firm_idx on public.audit_log (firm_id, occurred_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

create or replace function app.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log is append-only: % is not allowed', lower(tg_op)
    using errcode = 'insufficient_privilege';
end $$;
create trigger immutable before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();
create trigger immutable_truncate before truncate on public.audit_log
  for each statement execute function app.audit_log_immutable();

-- Placeholder until the role helpers exist (replaced in the access-control migration).
create or replace function app.actor_role(p_org uuid, p_firm uuid) returns text
language sql stable security definer set search_path = '' as $$ select null::text $$;

-- Generic row audit trigger. `app.ctx` names the business action (e.g. post_journal) and
-- `app.reason` carries the user's reason when the action requires one.
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid := (v_row ->> 'organization_id')::uuid;
  v_firm uuid := (v_row ->> 'firm_id')::uuid;
begin
  if tg_op = 'UPDATE' and v_old - 'updated_at' - 'updated_by' = v_new - 'updated_at' - 'updated_by' then
    return null; -- nothing really changed
  end if;
  insert into public.audit_log (actor_id, actor_role, organization_id, firm_id, action,
                                table_name, row_id, before, after, reason)
  values ((select auth.uid()), app.actor_role(v_org, v_firm), v_org, v_firm,
          coalesce(nullif(app.ctx(), ''), lower(tg_op)), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'code', v_row ->> 'user_id'),
          v_old, v_new, nullif(current_setting('app.reason', true), ''));
  return null;
end $$;

-- Standard set-up for every business table: who/when columns, touch + audit triggers,
-- RLS on, and no access for the API roles until a policy and grant say otherwise.
create or replace function app.setup_table(t regclass, with_audit boolean default true) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('alter table %s
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists created_by uuid,
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by uuid', t);
  execute format('create trigger touch before insert or update on %s for each row execute function app.touch()', t);
  if with_audit then
    execute format('create trigger audit after insert or update or delete on %s for each row execute function app.audit()', t);
  end if;
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon, authenticated', t);
end $$;
