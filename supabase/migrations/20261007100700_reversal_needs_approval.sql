-- D-26 (answers Q-21) · Reversing a posted journal needs a second person.
-- reverse_journal() now only *requests* the reversal: it creates the mirror journal as
-- `pending` (prepared by the requester). post_journal() by a different Firm Admin posts it
-- and, in the same transaction, marks the original as reversed. A pending reversal cannot be
-- edited by anyone — only approved, or deleted to cancel the request.

create or replace function app.reverse_journal(p_journal_id uuid, p_reason text, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  j public.journals;
  v_uid uuid;
  v_new uuid;
begin
  select * into j from public.journals where id = p_journal_id for update;
  if j.id is null then
    raise exception 'Journal not found' using errcode = 'no_data_found';
  end if;
  v_uid := app.require(j.organization_id, 'reverse_journal');
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required to reverse a journal' using errcode = 'check_violation';
  end if;
  if j.status <> 'posted' then
    raise exception 'Only posted journals can be reversed (this one is %)', j.status using errcode = 'check_violation';
  end if;
  if j.source = 'reversal' then
    raise exception 'A reversal cannot itself be reversed — post a new journal instead' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.journals where reversal_of = j.id) then
    raise exception 'A reversal of this journal is already waiting for approval' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('reverse_journal');
  perform set_config('app.reason', p_reason, true);
  insert into public.journals (organization_id, entry_date, source, source_id, memo, reversal_of, prepared_by, status)
  values (j.organization_id, p_date, 'reversal', j.id,
          'Reversal of ' || j.journal_no || ': ' || btrim(p_reason), j.id, v_uid, 'pending')
  returning id into v_new;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, description)
  select v_new, organization_id, line_no, account_id, credit, debit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, description
  from public.journal_lines where journal_id = j.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_new;
end $$;

create or replace function app.post_journal(p_journal_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  j public.journals;
  v_uid uuid;
  v_no text;
begin
  select * into j from public.journals where id = p_journal_id for update;
  if j.id is null then
    raise exception 'Journal not found' using errcode = 'no_data_found';
  end if;
  v_uid := app.require(j.organization_id, 'post_journal');
  if j.status not in ('draft', 'pending') then
    raise exception 'Journal is already %', j.status using errcode = 'check_violation';
  end if;
  if j.prepared_by = v_uid then
    raise exception 'You prepared this journal, so someone else must approve it (maker-checker)'
      using errcode = 'insufficient_privilege';                                                      -- R1
  end if;
  perform app.set_ctx('post_journal');
  v_no := app.next_document_number(j.organization_id, 'journal', j.entry_date);
  update public.journals
     set status = 'posted', approved_by = v_uid, posted_at = now(), journal_no = v_no
   where id = j.id;
  if j.reversal_of is not null then                                                                 -- D-26
    perform app.set_ctx('reverse_journal');
    update public.journals set status = 'reversed' where id = j.reversal_of and status = 'posted';
    if not found then
      raise exception 'The original journal is no longer posted' using errcode = 'check_violation';
    end if;
  end if;
  perform app.set_ctx(null);
  return v_no;
end $$;

-- Journals: a user may only delete (cancel) a pending reversal, never edit it.
create or replace function app.journals_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted', 'reversed') then
      raise exception 'Posted journals cannot be deleted — reverse them instead' using errcode = 'insufficient_privilege'; -- LED-08
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') or new.journal_no is not null
       or new.approved_by is not null or new.posted_at is not null then
      raise exception 'New journals start as drafts; posting goes through post_journal()' using errcode = 'insufficient_privilege';
    end if;
    if (new.reversal_of is not null or new.source not in ('manual', 'opening')) and app.ctx() = '' then
      raise exception 'Journals of source % are created by the system' , new.source using errcode = 'insufficient_privilege';
    end if;
    new.prepared_by := coalesce((select auth.uid()), new.prepared_by);
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.organization_id <> old.organization_id then
    raise exception 'A journal cannot move to another client' using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('posted', 'reversed') then                                                       -- R2 / LED-07
    if not (old.status = 'posted' and new.status = 'reversed' and app.ctx() = 'reverse_journal'
            and (to_jsonb(new) - 'status' - 'updated_at' - 'updated_by')
              = (to_jsonb(old) - 'status' - 'updated_at' - 'updated_by')) then
      raise exception 'Posted journals cannot be changed — reverse them instead' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.status in ('posted', 'reversed') then
    if new.status = 'reversed' or app.ctx() not in ('post_journal', 'reverse_journal') then
      raise exception 'Journals are posted only through post_journal()' using errcode = 'insufficient_privilege';
    end if;
    perform app.assert_postable(new);
    return new;
  end if;

  -- Draft / pending edits by a user: system columns stay as they are, and whoever edits
  -- last becomes the preparer (so they cannot approve it afterwards).
  if app.ctx() = '' then
    if old.source = 'reversal' then
      raise exception 'A reversal request cannot be edited — approve it or cancel it' using errcode = 'insufficient_privilege';
    end if;
    if new.journal_no is not null or new.approved_by is not null or new.posted_at is not null
       or new.source <> old.source or new.reversal_of is distinct from old.reversal_of
       or new.source_id is distinct from old.source_id then
      raise exception 'Only the date, memo and draft/pending status of a journal can be edited' using errcode = 'insufficient_privilege';
    end if;
    new.prepared_by := coalesce((select auth.uid()), new.prepared_by);
  end if;
  return new;
end $$;

create or replace function app.journal_lines_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.journal_lines := case when tg_op = 'DELETE' then old else new end;
  v_status public.journal_status;
  v_source public.journal_source;
begin
  select status, source into v_status, v_source from public.journals where id = v_row.journal_id;
  if v_status is null and tg_op = 'DELETE' then
    return old;                         -- cascading from the deletion of a draft journal
  end if;
  if v_status not in ('draft', 'pending')
     or (tg_op = 'UPDATE' and old.journal_id <> new.journal_id) then
    raise exception 'Lines of a posted journal cannot be changed' using errcode = 'insufficient_privilege'; -- LED-07
  end if;
  if v_source = 'reversal' and app.ctx() = '' then
    raise exception 'A reversal request cannot be edited — approve it or cancel it' using errcode = 'insufficient_privilege';
  end if;
  if tg_op <> 'DELETE' then
    if exists (select 1 from public.accounts
               where id = new.account_id and organization_id = new.organization_id and not is_active) then
      raise exception 'Account is inactive' using errcode = 'check_violation';                        -- LED-12
    end if;
    if new.currency = 'AED' and new.amount_fcy is null then
      new.amount_fcy := new.debit + new.credit;
    end if;
  end if;
  if app.ctx() = '' and (select auth.uid()) is not null then
    update public.journals set prepared_by = (select auth.uid())
    where id = v_row.journal_id and prepared_by is distinct from (select auth.uid());
  end if;
  return v_row;
end $$;
