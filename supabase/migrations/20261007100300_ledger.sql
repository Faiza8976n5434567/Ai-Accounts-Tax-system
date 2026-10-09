-- P1-03 / P1-04 · Chart of accounts, periods, document numbering, journals and the posting
-- functions (Spec 01 §4.3, §4.5 · Spec 02 R1–R3 · PLAN §6.1 LED-01 → LED-14, §6.10 NUM-*).
-- The database is the referee: a journal can only become `posted` through post_journal(),
-- and the trigger that allows it re-checks every accounting rule.

-- ── Chart of accounts ────────────────────────────────────────────────────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text not null check (code ~ '^[0-9A-Za-z.-]{1,20}$'),
  name text not null,
  type public.account_type not null,
  subtype text,
  report_group text,
  ct_tag text references public.ct_tags (code) on delete restrict,
  is_control boolean not null default false,   -- AR, AP, VAT, bank: no manual journal lines
  is_active boolean not null default true,     -- inactive accounts reject new postings
  parent_id uuid,
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (parent_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);
select app.setup_table('public.accounts');
create index accounts_ct_tag_idx on public.accounts (ct_tag);
create index accounts_parent_idx on public.accounts (parent_id, organization_id);

-- ── Periods ──────────────────────────────────────────────────────────────────────────────
create type public.period_status as enum ('open', 'locked');
create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  status public.period_status not null default 'open',
  locked_by uuid references public.profiles (id) on delete restrict,
  locked_at timestamptz,
  lock_reason text,
  reopened_by uuid references public.profiles (id) on delete restrict,
  reopened_at timestamptz,
  reopen_reason text,
  unique (organization_id, start_date),
  check (end_date >= start_date),
  exclude using gist (organization_id with =, daterange(start_date, end_date, '[]') with &&)
);
select app.setup_table('public.accounting_periods');
create index accounting_periods_locked_by_idx on public.accounting_periods (locked_by);
create index accounting_periods_reopened_by_idx on public.accounting_periods (reopened_by);

create type public.tax_period_kind as enum ('vat', 'ct');
create table public.tax_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.tax_period_kind not null,
  start_date date not null,
  end_date date not null,
  due_date date not null,
  unique (organization_id, kind, start_date),
  check (end_date >= start_date and due_date > end_date),
  exclude using gist (organization_id with =, kind with =, daterange(start_date, end_date, '[]') with &&)
);
select app.setup_table('public.tax_periods');

-- ── Document numbering (D-22): one running counter per client and type, never resets ───
create type public.doc_type as enum ('journal', 'sales_invoice', 'credit_note', 'receipt', 'payment');
create table public.number_sequences (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doc_type public.doc_type not null,
  next_value bigint not null default 1 check (next_value > 0),
  primary key (organization_id, doc_type)
);
select app.setup_table('public.number_sequences', false);

-- Formats a number, e.g. ('{PREFIX}-{YYYY}-{MM}-{SEQ:4}', 'INV', 2026-02-14, 101) → INV-2026-02-0101.
-- The counter grows past the padding width instead of being cut (…-10000).
create or replace function app.format_doc_number(p_format text, p_prefix text, p_date date, p_seq bigint)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_width int := coalesce((regexp_match(p_format, '\{SEQ:(\d+)\}'))[1]::int, 0);
  v_seq text := p_seq::text;
begin
  if length(v_seq) < v_width then v_seq := lpad(v_seq, v_width, '0'); end if;
  return regexp_replace(
           replace(replace(replace(p_format, '{PREFIX}', p_prefix),
                   '{YYYY}', to_char(p_date, 'YYYY')), '{MM}', to_char(p_date, 'MM')),
           '\{SEQ(:\d+)?\}', v_seq);
end $$;

-- Takes the next number inside the posting transaction. The upsert row lock serialises
-- concurrent posts (NUM-05) and a rollback returns the number, so there are no gaps.
create or replace function app.next_document_number(p_org uuid, p_type public.doc_type, p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_seq bigint;
  v_firm uuid := (select firm_id from public.organizations where id = p_org);
  v_format text := coalesce(app.firm_setting(v_firm, 'numbering_format') #>> '{}', '{PREFIX}-{YYYY}-{MM}-{SEQ:4}');
  v_prefix text := coalesce(app.firm_setting(v_firm, 'document_prefixes') ->> p_type::text,
                            case p_type when 'journal' then 'JV' when 'sales_invoice' then 'INV'
                              when 'credit_note' then 'CN' when 'receipt' then 'RCPT' else 'PAY' end);
begin
  insert into public.number_sequences as s (organization_id, doc_type, next_value)
  values (p_org, p_type, 2)
  on conflict (organization_id, doc_type) do update set next_value = s.next_value + 1
  returning next_value - 1 into v_seq;
  return app.format_doc_number(v_format, v_prefix, p_date, v_seq);
end $$;

-- ── Journals ─────────────────────────────────────────────────────────────────────────────
create type public.journal_source as enum
  ('manual', 'sale', 'purchase', 'receipt', 'payment', 'bank', 'opening', 'reversal', 'vat', 'ct');
create type public.journal_status as enum ('draft', 'pending', 'posted', 'reversed');

create table public.journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  journal_no text,
  entry_date date not null,
  source public.journal_source not null default 'manual',
  source_id uuid,
  memo text,
  status public.journal_status not null default 'draft',
  reversal_of uuid unique,
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  unique (organization_id, journal_no),
  unique (id, organization_id),
  foreign key (reversal_of, organization_id) references public.journals (id, organization_id) on delete restrict,
  check (approved_by <> prepared_by),                                        -- R1 maker-checker
  check ((status in ('posted', 'reversed')) = (journal_no is not null and posted_at is not null))
);
select app.setup_table('public.journals');
create index journals_reversal_idx on public.journals (reversal_of, organization_id);
create index journals_prepared_by_idx on public.journals (prepared_by);
create index journals_approved_by_idx on public.journals (approved_by);
create index journals_org_date_idx on public.journals (organization_id, entry_date);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null,
  organization_id uuid not null,              -- must equal the journal's (composite FK below)
  line_no smallint not null check (line_no > 0),
  account_id uuid not null,
  debit bigint not null default 0 check (debit >= 0),                       -- AED fils
  credit bigint not null default 0 check (credit >= 0),
  currency char(3) not null default 'AED' references public.currencies (code) on delete restrict,
  fx_rate numeric(12, 6) not null default 1 check (fx_rate > 0),
  amount_fcy bigint check (amount_fcy >= 0),                                -- document-currency amount
  tax_code text references public.tax_codes (code) on delete restrict,
  vat_amount bigint not null default 0 check (vat_amount >= 0),
  supply_emirate text references public.emirates (code) on delete restrict,
  description text,
  unique (journal_id, line_no),
  foreign key (journal_id, organization_id) references public.journals (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict, -- DM-01
  check ((debit > 0) <> (credit > 0)),                                       -- LED-03: one side only, never zero
  check (currency <> 'AED' or (fx_rate = 1 and (amount_fcy is null or amount_fcy = debit + credit)))
);
select app.setup_table('public.journal_lines');
create index journal_lines_journal_idx on public.journal_lines (journal_id, organization_id);
create index journal_lines_account_idx on public.journal_lines (account_id, organization_id);
create index journal_lines_currency_idx on public.journal_lines (currency);
create index journal_lines_tax_code_idx on public.journal_lines (tax_code);
create index journal_lines_emirate_idx on public.journal_lines (supply_emirate);

-- Every accounting rule a journal must pass before it can be posted.
create or replace function app.assert_postable(p_journal public.journals) returns void
language plpgsql set search_path = '' as $$
declare
  v_lines int; v_dr bigint; v_cr bigint; v_bad text; v_period public.period_status;
begin
  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_lines, v_dr, v_cr
  from public.journal_lines where journal_id = p_journal.id;
  if v_lines < 2 then
    raise exception 'A journal needs at least two lines' using errcode = 'check_violation';          -- LED-05
  end if;
  if v_dr <> v_cr then
    raise exception 'Journal does not balance: debits % ≠ credits % (fils)', v_dr, v_cr
      using errcode = 'check_violation';                                                              -- LED-02
  end if;
  select string_agg(a.code, ', ') into v_bad
  from public.journal_lines l join public.accounts a on a.id = l.account_id
  where l.journal_id = p_journal.id and not a.is_active;
  if v_bad is not null then
    raise exception 'Inactive account(s): %', v_bad using errcode = 'check_violation';               -- LED-12
  end if;
  if p_journal.source = 'manual' then
    select string_agg(a.code, ', ') into v_bad
    from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.journal_id = p_journal.id and a.is_control;
    if v_bad is not null then
      raise exception 'Control account(s) % cannot be used in a manual journal', v_bad using errcode = 'check_violation';
    end if;
  end if;
  select status into v_period from public.accounting_periods
  where organization_id = p_journal.organization_id
    and p_journal.entry_date between start_date and end_date;
  if v_period is null then
    raise exception 'No accounting period covers %', p_journal.entry_date using errcode = 'check_violation';
  elsif v_period = 'locked' then
    raise exception 'The period containing % is locked', p_journal.entry_date using errcode = 'check_violation'; -- LED-10
  end if;
end $$;

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
    if new.journal_no is not null or new.approved_by is not null or new.posted_at is not null
       or new.source <> old.source or new.reversal_of is distinct from old.reversal_of
       or new.source_id is distinct from old.source_id then
      raise exception 'Only the date, memo and draft/pending status of a journal can be edited' using errcode = 'insufficient_privilege';
    end if;
    new.prepared_by := coalesce((select auth.uid()), new.prepared_by);
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.journals
  for each row execute function app.journals_guard();

create or replace function app.journal_lines_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.journal_lines := case when tg_op = 'DELETE' then old else new end;
  v_status public.journal_status;
begin
  select status into v_status from public.journals where id = v_row.journal_id;
  if v_status is null and tg_op = 'DELETE' then
    return old;                         -- cascading from the deletion of a draft journal
  end if;
  if v_status not in ('draft', 'pending')
     or (tg_op = 'UPDATE' and old.journal_id <> new.journal_id) then
    raise exception 'Lines of a posted journal cannot be changed' using errcode = 'insufficient_privilege'; -- LED-07
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
create trigger guard before insert or update or delete on public.journal_lines
  for each row execute function app.journal_lines_guard();

create or replace function app.periods_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and app.ctx() not in ('lock_period', 'reopen_period', 'approve_vat_return')
     and (new.status, new.locked_by, new.locked_at, new.lock_reason, new.reopened_by, new.reopened_at, new.reopen_reason)
         is distinct from
         (old.status, old.locked_by, old.locked_at, old.lock_reason, old.reopened_by, old.reopened_at, old.reopen_reason) then
    raise exception 'Periods are locked and reopened only through lock_period() / reopen_period()' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (new.start_date, new.end_date, new.organization_id) is distinct from (old.start_date, old.end_date, old.organization_id)
     and exists (select 1 from public.journals j where j.organization_id = old.organization_id
                 and j.status in ('posted', 'reversed') and j.entry_date between old.start_date and old.end_date) then
    raise exception 'A period with posted journals cannot be changed' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'locked' or exists (select 1 from public.journals j where j.organization_id = old.organization_id
              and j.status in ('posted', 'reversed') and j.entry_date between old.start_date and old.end_date) then
      raise exception 'A locked period or one with posted journals cannot be deleted' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.status <> 'open' then
    raise exception 'New periods start open' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.accounting_periods
  for each row execute function app.periods_guard();

-- ── Posting functions (the only way to post, reverse, lock and reopen) ───────────────────
-- Callable through the API; each one re-checks the caller's permission (Spec 02 layer 2).

create or replace function app.require(p_org uuid, p_perm text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if not app.mfa_ok() then
    raise exception 'Two-factor sign-in is required' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_perm(p_org, p_perm) then
    raise exception 'You are not allowed to %', replace(p_perm, '_', ' ') using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end $$;

create or replace function public.post_journal(p_journal_id uuid) returns text
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
  perform app.set_ctx(null);
  return v_no;
end $$;

create or replace function public.reverse_journal(p_journal_id uuid, p_reason text, p_date date default current_date)
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

  perform app.set_ctx('reverse_journal');
  perform set_config('app.reason', p_reason, true);
  insert into public.journals (organization_id, entry_date, source, source_id, memo, reversal_of, prepared_by)
  values (j.organization_id, p_date, 'reversal', j.id,
          'Reversal of ' || j.journal_no || ': ' || btrim(p_reason), j.id, v_uid)
  returning id into v_new;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, description)
  select v_new, organization_id, line_no, account_id, credit, debit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, description
  from public.journal_lines where journal_id = j.id;
  update public.journals
     set status = 'posted', posted_at = now(),
         journal_no = app.next_document_number(j.organization_id, 'journal', p_date)
   where id = v_new;
  update public.journals set status = 'reversed' where id = j.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_new;
end $$;

create or replace function public.lock_period(p_period_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.accounting_periods; v_uid uuid;
begin
  select * into p from public.accounting_periods where id = p_period_id for update;
  if p.id is null then raise exception 'Period not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(p.organization_id, 'lock_period');
  if p.status = 'locked' then raise exception 'Period is already locked' using errcode = 'check_violation'; end if;
  perform app.set_ctx('lock_period');
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  update public.accounting_periods
     set status = 'locked', locked_by = v_uid, locked_at = now(), lock_reason = nullif(btrim(p_reason), '')
   where id = p.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

create or replace function public.reopen_period(p_period_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.accounting_periods; v_uid uuid;
begin
  select * into p from public.accounting_periods where id = p_period_id for update;
  if p.id is null then raise exception 'Period not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(p.organization_id, 'reopen_period');
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required to reopen a period' using errcode = 'check_violation';     -- RBAC-09
  end if;
  if p.status <> 'locked' then raise exception 'Period is not locked' using errcode = 'check_violation'; end if;
  perform app.set_ctx('reopen_period');
  perform set_config('app.reason', p_reason, true);
  update public.accounting_periods
     set status = 'open', reopened_by = v_uid, reopened_at = now(), reopen_reason = btrim(p_reason)
   where id = p.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

revoke all on function public.post_journal(uuid), public.reverse_journal(uuid, text, date),
  public.lock_period(uuid, text), public.reopen_period(uuid, text) from public, anon;
grant execute on function public.post_journal(uuid), public.reverse_journal(uuid, text, date),
  public.lock_period(uuid, text), public.reopen_period(uuid, text) to authenticated;
