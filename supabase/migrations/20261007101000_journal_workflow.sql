-- P1-14 · Journal workflow for the screens: save a draft in one call, reject back to the
-- preparer with a reason, and tell the screens what the signed-in user may do on a client.
-- Posting, reversing and locking keep using the functions from …100300 / …100700.

-- Saves a manual or opening journal (header + all lines) atomically. Runs with the caller's
-- own rights (SECURITY INVOKER), so RLS and every guard trigger apply exactly as for direct writes.
-- Editing a pending journal returns it to draft — it must be submitted again.
create or replace function public.save_journal_draft(
  p_journal_id uuid, p_organization_id uuid, p_entry_date date, p_memo text,
  p_source public.journal_source, p_lines jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_journal_id;
  v_line jsonb;
  v_n int := 0;
begin
  if p_source not in ('manual', 'opening') then
    raise exception 'Only manual and opening journals are entered by hand' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Journal lines are missing' using errcode = 'check_violation';
  end if;
  if v_id is null then
    insert into public.journals (organization_id, entry_date, memo, source)
    values (p_organization_id, p_entry_date, nullif(btrim(p_memo), ''), p_source)
    returning id into v_id;
  else
    update public.journals set entry_date = p_entry_date, memo = nullif(btrim(p_memo), ''), status = 'draft'
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending') and source = p_source;
    if not found then
      raise exception 'Journal not found or no longer editable' using errcode = 'no_data_found';
    end if;
    delete from public.journal_lines where journal_id = v_id;
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, description)
    values (v_id, p_organization_id, v_n, (v_line ->> 'account_id')::uuid,
            coalesce((v_line ->> 'debit')::bigint, 0), coalesce((v_line ->> 'credit')::bigint, 0),   -- fils; "1000.5" is refused (LED-06)
            nullif(btrim(v_line ->> 'description'), ''));
  end loop;
  return v_id;
end $$;
revoke all on function public.save_journal_draft(uuid, uuid, date, text, public.journal_source, jsonb) from public, anon;
grant execute on function public.save_journal_draft(uuid, uuid, date, text, public.journal_source, jsonb) to authenticated;

-- An approver sends a pending journal back with a reason. The preparer stays the preparer (so
-- the approver can still approve the corrected version). Rejecting a reversal request cancels it.
create or replace function app.reject_journal(p_journal_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.journals;
begin
  select * into j from public.journals where id = p_journal_id for update;
  if j.id is null then raise exception 'Journal not found' using errcode = 'no_data_found'; end if;
  perform app.require(j.organization_id, 'post_journal');
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required to send a journal back' using errcode = 'check_violation';
  end if;
  if j.status <> 'pending' then
    raise exception 'Only journals waiting for approval can be sent back (this one is %)', j.status using errcode = 'check_violation';
  end if;
  perform app.set_ctx('reject_journal');
  perform set_config('app.reason', p_reason, true);
  if j.source = 'reversal' then
    delete from public.journals where id = j.id;
  else
    update public.journals set status = 'draft' where id = j.id;
  end if;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;
grant execute on function app.reject_journal(uuid, text) to authenticated;
create function public.reject_journal(p_journal_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reject_journal(p_journal_id, p_reason) $$;
revoke all on function public.reject_journal(uuid, text) from public, anon;
grant execute on function public.reject_journal(uuid, text) to authenticated;

-- What the signed-in user may do on a client (drives which buttons the screens show; every
-- action is still re-checked by the database). Empty without two-factor sign-in.
create or replace function app.my_permissions(p_org uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when not app.mfa_ok() then '{}'::text[]
              else coalesce((select array_agg(perm order by perm) from app.role_permissions where role = app.org_role(p_org)), '{}') end
$$;
grant execute on function app.my_permissions(uuid) to authenticated;
create function public.my_permissions(p_organization_id uuid) returns text[]
language sql stable security invoker set search_path = '' as $$ select app.my_permissions(p_organization_id) $$;
revoke all on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;
