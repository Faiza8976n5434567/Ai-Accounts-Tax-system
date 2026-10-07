-- G-7 follow-up · Security advisor lint 0029: SECURITY DEFINER functions must not sit in the
-- API schema. The real functions move to the private `app` schema (not exposed through the
-- API); `public` keeps thin SECURITY INVOKER wrappers with the same names and arguments, so
-- the app calls exactly what it called before. Behaviour and permission checks are unchanged.

alter function public.post_journal(uuid) set schema app;
alter function public.reverse_journal(uuid, text, date) set schema app;
alter function public.lock_period(uuid, text) set schema app;
alter function public.reopen_period(uuid, text) set schema app;
alter function public.approve_config_version(uuid, text) set schema app;
alter function public.set_super_admin(uuid, boolean, text) set schema app;
alter function public.set_user_status(uuid, public.user_status, text) set schema app;

create function public.post_journal(p_journal_id uuid) returns text
language sql security invoker set search_path = '' as $$ select app.post_journal(p_journal_id) $$;

create function public.reverse_journal(p_journal_id uuid, p_reason text, p_date date default current_date) returns uuid
language sql security invoker set search_path = '' as $$ select app.reverse_journal(p_journal_id, p_reason, p_date) $$;

create function public.lock_period(p_period_id uuid, p_reason text default null) returns void
language sql security invoker set search_path = '' as $$ select app.lock_period(p_period_id, p_reason) $$;

create function public.reopen_period(p_period_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reopen_period(p_period_id, p_reason) $$;

create function public.approve_config_version(p_version_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.approve_config_version(p_version_id, p_reason) $$;

create function public.set_super_admin(p_user uuid, p_value boolean, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.set_super_admin(p_user, p_value, p_reason) $$;

create function public.set_user_status(p_user uuid, p_status public.user_status, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.set_user_status(p_user, p_status, p_reason) $$;

revoke all on function public.post_journal(uuid), public.reverse_journal(uuid, text, date),
  public.lock_period(uuid, text), public.reopen_period(uuid, text), public.approve_config_version(uuid, text),
  public.set_super_admin(uuid, boolean, text), public.set_user_status(uuid, public.user_status, text)
  from public, anon;
grant execute on function public.post_journal(uuid), public.reverse_journal(uuid, text, date),
  public.lock_period(uuid, text), public.reopen_period(uuid, text), public.approve_config_version(uuid, text),
  public.set_super_admin(uuid, boolean, text), public.set_user_status(uuid, public.user_status, text)
  to authenticated;
-- The implementations keep their existing grant to `authenticated` (moving a function keeps
-- its privileges); `app` is not exposed, so they are reachable only through the wrappers.
