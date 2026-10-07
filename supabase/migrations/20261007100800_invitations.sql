-- P1-10 · Invitations (Spec 03 §3.2 · Spec 02 §2.3 · D-24). The database decides who may
-- invite whom; the server function (poc/api/invite.ts) only creates the one-time sign-in link
-- and sends the email after create_invitation() has said yes.
-- Firm staff only for now: client logins arrive at the pilot (Phase 3).

alter table public.invitations
  add column full_name text,
  add column link_copied_at timestamptz,
  add column accepted_user_id uuid references public.profiles (id) on delete restrict;
create index invitations_accepted_user_idx on public.invitations (accepted_user_id);

-- The invitee accepting their own invitation is the one time a person's own membership is
-- created; every other self-change stays blocked (R4).
create or replace function app.firm_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.firm_members := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.user_id = (select auth.uid()) and not (tg_op = 'INSERT' and app.ctx() = 'accept_invitation') then
    raise exception 'You cannot change your own firm role' using errcode = 'insufficient_privilege';
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or not new.active or new.role <> 'firm_admin' or new.firm_id <> old.firm_id)
     and exists (select 1 from public.profiles p join public.firms f on f.id = old.firm_id
                 where p.id = old.user_id and p.is_super_admin and f.is_platform_owner) then
    raise exception 'Remove the Super Admin flag before changing this person''s firm membership' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Who is inviting, for which firm: the caller's active Firm Admin membership.
create or replace function app.inviter_firm() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.firm_id from public.firm_members m
  where m.user_id = (select auth.uid()) and m.active and m.role = 'firm_admin'
    and app.firm_role(m.firm_id) = 'firm_admin'
  order by m.created_at limit 1
$$;

create or replace function app.create_invitation(p_email text, p_full_name text, p_role text)
returns table (invitation_id uuid, email text, full_name text, role text, expires_at timestamptz, firm_name text, inviter_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_firm uuid;
  v_email extensions.citext := lower(btrim(p_email));
  v_domains jsonb;
  v_days int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = 'insufficient_privilege'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor sign-in is required' using errcode = 'insufficient_privilege'; end if;
  v_firm := app.inviter_firm();
  if v_firm is null then
    raise exception 'Only a Firm Admin can invite people' using errcode = 'insufficient_privilege';
  end if;
  if p_role in ('client_owner', 'client_staff', 'read_only') then
    raise exception 'Client logins arrive at the pilot (Phase 3)' using errcode = 'check_violation';
  end if;
  if p_role not in ('firm_admin', 'firm_accountant') then
    raise exception 'Unknown role %', p_role using errcode = 'check_violation';
  end if;
  if p_role = 'firm_admin' and not app.is_super_admin() then
    raise exception 'Only a Super Admin can invite a Firm Admin' using errcode = 'insufficient_privilege';
  end if;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Enter the person''s name' using errcode = 'check_violation';
  end if;
  v_domains := coalesce(app.firm_setting(v_firm, 'allowed_email_domains'), '[]'::jsonb);              -- CFG-11
  if jsonb_array_length(v_domains) > 0
     and not exists (select 1 from jsonb_array_elements_text(v_domains) d where split_part(v_email::text, '@', 2) = lower(d)) then
    raise exception 'Firm staff must use a firm email address (%)', (select string_agg('@' || d, ', ') from jsonb_array_elements_text(v_domains) d)
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.firm_members m join public.profiles p on p.id = m.user_id
             where m.firm_id = v_firm and m.active and p.email = v_email) then
    raise exception '% is already a member of the firm', v_email using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.invitations i where i.email = v_email and i.firm_id = v_firm
             and i.organization_id is null and i.status = 'pending' and i.expires_at > now()) then
    raise exception '% already has an invitation waiting — copy its link or revoke it first', v_email using errcode = 'unique_violation';
  end if;
  -- Old, unused invitations for the same person are closed off.
  update public.invitations i set status = 'expired'
   where i.email = v_email and i.firm_id = v_firm and i.status = 'pending';

  v_days := coalesce((app.firm_setting(v_firm, 'invite_expiry_days') #>> '{}')::int, 7);
  perform app.set_ctx('create_invitation');
  insert into public.invitations (email, firm_id, role, invited_by, expires_at, full_name)
  values (v_email, v_firm, p_role, v_uid, now() + make_interval(days => v_days), btrim(p_full_name))
  returning id into v_id;
  perform app.set_ctx(null);
  return query
    select i.id, i.email::text, i.full_name, i.role, i.expires_at, f.legal_name, p.full_name
    from public.invitations i join public.firms f on f.id = i.firm_id join public.profiles p on p.id = v_uid
    where i.id = v_id;
end $$;

create or replace function app.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.mfa_ok() then raise exception 'Two-factor sign-in is required' using errcode = 'insufficient_privilege'; end if;
  perform app.set_ctx('revoke_invitation');
  update public.invitations set status = 'revoked'
   where id = p_invitation_id and status = 'pending' and app.firm_role(firm_id) = 'firm_admin';
  if not found then raise exception 'Invitation not found or no longer pending' using errcode = 'no_data_found'; end if;
  perform app.set_ctx(null);
end $$;

-- CFG-18: copying an invite link is recorded (the update writes an audit row).
create or replace function app.mark_invite_link_copied(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.mfa_ok() then raise exception 'Two-factor sign-in is required' using errcode = 'insufficient_privilege'; end if;
  perform app.set_ctx('copy_invite_link');
  update public.invitations set link_copied_at = now()
   where id = p_invitation_id and status = 'pending' and app.firm_role(firm_id) = 'firm_admin';
  if not found then raise exception 'Invitation not found or no longer pending' using errcode = 'no_data_found'; end if;
  perform app.set_ctx(null);
end $$;

-- Called by the app when someone signs in. Turns a waiting invitation for their email into
-- a firm membership. Returns 'accepted', 'expired' (CFG-10) or 'none'.
create or replace function app.accept_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email extensions.citext;
  inv public.invitations;
begin
  if v_uid is null then return 'none'; end if;
  select email into v_email from public.profiles where id = v_uid and status = 'active';
  if v_email is null then return 'none'; end if;
  select * into inv from public.invitations
   where email = v_email and status = 'pending' and organization_id is null
   order by created_at desc limit 1 for update;
  if inv.id is null then return 'none'; end if;
  if inv.expires_at <= now() then
    perform app.set_ctx('expire_invitation');
    update public.invitations set status = 'expired' where id = inv.id;
    perform app.set_ctx(null);
    return 'expired';
  end if;
  perform app.set_ctx('accept_invitation');
  insert into public.firm_members (firm_id, user_id, role)
  values (inv.firm_id, v_uid, inv.role::public.firm_role)
  on conflict (firm_id, user_id) do nothing;
  update public.invitations set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid where id = inv.id;
  update public.profiles set full_name = inv.full_name
   where id = v_uid and inv.full_name is not null and full_name is distinct from inv.full_name;
  perform app.set_ctx(null);
  return 'accepted';
end $$;

grant execute on function app.create_invitation(text, text, text), app.revoke_invitation(uuid),
  app.mark_invite_link_copied(uuid), app.accept_invitation() to authenticated;

-- API wrappers (SECURITY INVOKER, same pattern as …100600).
create function public.create_invitation(p_email text, p_full_name text, p_role text)
returns table (invitation_id uuid, email text, full_name text, role text, expires_at timestamptz, firm_name text, inviter_name text)
language sql security invoker set search_path = '' as $$ select * from app.create_invitation(p_email, p_full_name, p_role) $$;
create function public.revoke_invitation(p_invitation_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.revoke_invitation(p_invitation_id) $$;
create function public.mark_invite_link_copied(p_invitation_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.mark_invite_link_copied(p_invitation_id) $$;
create function public.accept_invitation() returns text
language sql security invoker set search_path = '' as $$ select app.accept_invitation() $$;
revoke all on function public.create_invitation(text, text, text), public.revoke_invitation(uuid),
  public.mark_invite_link_copied(uuid), public.accept_invitation() from public, anon;
grant execute on function public.create_invitation(text, text, text), public.revoke_invitation(uuid),
  public.mark_invite_link_copied(uuid), public.accept_invitation() to authenticated;
