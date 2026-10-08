-- P2-05 · Bank accounts, statement upload, duplicate detection, matching and reconciliation
-- (Spec 01 §4.9 · Spec 03 F-16 · D-38, D-39, D-40, D-41 · BANK-01→03 · DM-07).
--   • A bank account is one GL bank/cash account plus the remembered column layout of its statements (D-38).
--   • Statement lines get a dedupe hash (date, amount, description, balance, n-th identical line in the file):
--     the same line is never imported twice (DM-07); the same file twice is refused (BANK-01).
--   • A bank line matches exactly one posted GL line on that bank account, one-to-one (BANK-02, F-16).
--   • Other bank lines are posted to a chosen account as a journal approved by a second person, no VAT (D-39).
--   • Receipts/payments can be reversed with approval (D-40); reversed payments stop settling documents.
--   • Month-end reconciliation is saved, approved by a second person and frozen (D-41, BANK-03).

create type public.bank_txn_status as enum ('unmatched', 'matched');

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  account_id uuid not null,                                         -- the GL bank/cash account
  name text not null check (btrim(name) <> ''),
  bank_name text,
  iban_last4 text check (iban_last4 ~ '^[0-9]{4}$'),
  currency char(3) not null default 'AED' references public.currencies (code) on delete restrict,
  column_mapping jsonb,                                             -- D-38
  is_active boolean not null default true,
  unique (id, organization_id),
  unique (organization_id, account_id),
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict
);
select app.setup_table('public.bank_accounts');
create index bank_accounts_currency_idx on public.bank_accounts (currency);

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bank_account_id uuid not null,
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  period_start date,
  period_end date,
  closing_balance bigint,
  line_count int not null default 0,
  imported_count int not null default 0,
  duplicate_count int not null default 0,
  uploaded_by uuid references public.profiles (id) on delete restrict,
  unique (id, organization_id),
  unique (bank_account_id, file_sha256),                            -- BANK-01
  foreign key (bank_account_id, organization_id) references public.bank_accounts (id, organization_id) on delete restrict
);
select app.setup_table('public.bank_statements');
create index bank_statements_uploaded_by_idx on public.bank_statements (uploaded_by);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bank_account_id uuid not null,
  statement_id uuid not null,
  txn_date date not null,
  description text not null,
  reference text,
  amount bigint not null check (amount <> 0),                       -- signed, in the bank account's currency (+ money in)
  balance bigint,
  dedupe_hash text not null,
  status public.bank_txn_status not null default 'unmatched',
  journal_line_id uuid unique references public.journal_lines (id) on delete restrict,   -- BANK-02: one-to-one
  matched_by uuid references public.profiles (id) on delete restrict,
  matched_at timestamptz,
  unique (id, organization_id),
  unique (bank_account_id, dedupe_hash),                            -- DM-07
  foreign key (bank_account_id, organization_id) references public.bank_accounts (id, organization_id) on delete restrict,
  foreign key (statement_id, organization_id) references public.bank_statements (id, organization_id) on delete restrict,
  check ((status = 'matched') = (journal_line_id is not null))
);
select app.setup_table('public.bank_transactions');
create index bank_transactions_statement_idx on public.bank_transactions (statement_id, organization_id);
create index bank_transactions_account_date_idx on public.bank_transactions (bank_account_id, txn_date);
create index bank_transactions_matched_by_idx on public.bank_transactions (matched_by);

create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bank_account_id uuid not null,
  period_end date not null,
  statement_balance bigint not null,
  book_balance bigint not null,
  unreconciled_bank bigint not null,                                -- bank lines not yet in the books
  unreconciled_book bigint not null,                                -- book lines not yet on the statement
  snapshot jsonb not null,
  status public.document_status not null default 'pending' check (status in ('pending', 'posted')),
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  unique (bank_account_id, period_end),
  foreign key (bank_account_id, organization_id) references public.bank_accounts (id, organization_id) on delete restrict,
  check (approved_by <> prepared_by),
  check ((status = 'posted') = (approved_at is not null)),
  check (book_balance + unreconciled_bank - unreconciled_book = statement_balance)            -- BANK-03
);
select app.setup_table('public.bank_reconciliations');
create index bank_reconciliations_prepared_by_idx on public.bank_reconciliations (prepared_by);
create index bank_reconciliations_approved_by_idx on public.bank_reconciliations (approved_by);

alter table public.payments add column bank_transaction_id uuid unique references public.bank_transactions (id) on delete restrict;

do $$
declare t text;
begin
  foreach t in array array['bank_accounts', 'bank_statements', 'bank_transactions', 'bank_reconciliations'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
  end loop;
end $$;
grant select on public.bank_accounts, public.bank_statements, public.bank_transactions, public.bank_reconciliations to authenticated;

-- ── Book side of a bank account ─────────────────────────────────────────────────────────
-- Every posted GL line on the bank account, signed (+ money in), in the account's currency.
-- `eligible` = may be auto-matched (not part of a reversed pair).
create or replace function app.bank_book(p_bank_account_id uuid)
returns table (line_id uuid, journal_id uuid, journal_no text, entry_date date, memo text, description text, amount bigint, eligible boolean,
               matched_txn uuid, txn_date date)
language sql stable security definer set search_path = '' as $$
  select l.id, j.id, j.journal_no, j.entry_date, j.memo, l.description,
         case when ba.currency = 'AED' then l.debit - l.credit else sign(l.debit - l.credit)::bigint * l.amount_fcy end,
         j.status = 'posted' and j.reversal_of is null,
         t.id, t.txn_date
  from public.bank_accounts ba
  join public.journal_lines l on l.account_id = ba.account_id and l.organization_id = ba.organization_id
  join public.journals j on j.id = l.journal_id and j.status in ('posted', 'reversed')
  left join public.bank_transactions t on t.journal_line_id = l.id
  where ba.id = p_bank_account_id
$$;
grant execute on function app.bank_book(uuid) to authenticated;

create view public.bank_book_lines with (security_invoker = true) as
  select ba.id as bank_account_id, ba.organization_id, b.* from public.bank_accounts ba, lateral app.bank_book(ba.id) b;
grant select on public.bank_book_lines to authenticated;

-- Latest approved reconciliation date of a bank account (nothing on or before it may change).
create or replace function app.bank_reconciled_to(p_bank_account_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select max(period_end) from public.bank_reconciliations where bank_account_id = p_bank_account_id and status = 'posted'
$$;

-- D-41: a match whose bank line and book line are both on or before an approved reconciliation is frozen.
create or replace function app.bank_transactions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_end date := app.bank_reconciled_to(coalesce(new.bank_account_id, old.bank_account_id));
begin
  if tg_op = 'DELETE' then
    raise exception 'Bank statement lines cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  if v_end is not null and new.journal_line_id is distinct from old.journal_line_id then
    if (old.journal_line_id is not null and old.txn_date <= v_end
        and (select j.entry_date from public.journal_lines l join public.journals j on j.id = l.journal_id where l.id = old.journal_line_id) <= v_end)
    or (new.journal_line_id is not null and new.txn_date <= v_end
        and (select j.entry_date from public.journal_lines l join public.journals j on j.id = l.journal_id where l.id = new.journal_line_id) <= v_end) then
      raise exception 'This match is part of the reconciliation approved to % and cannot change', v_end using errcode = 'insufficient_privilege';
    end if;
  end if;
  if (to_jsonb(new) - 'status' - 'journal_line_id' - 'matched_by' - 'matched_at' - 'updated_at' - 'updated_by')
     <> (to_jsonb(old) - 'status' - 'journal_line_id' - 'matched_by' - 'matched_at' - 'updated_at' - 'updated_by') then
    raise exception 'Bank statement lines cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger guard before update or delete on public.bank_transactions for each row execute function app.bank_transactions_guard();

create or replace function app.bank_reconciliations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'posted' then
    raise exception 'An approved bank reconciliation is frozen' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before update or delete on public.bank_reconciliations for each row execute function app.bank_reconciliations_guard();

-- ── Bank accounts and statements ────────────────────────────────────────────────────────
-- p_doc: {name, bank_name?, iban_last4?, currency?, account_id?} — without account_id a new GL bank account is created.
create or replace function app.save_bank_account(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.accounts;
  v_code text;
  v_id uuid := p_id;
  v_name text := nullif(btrim(p_doc ->> 'name'), '');
begin
  perform app.require(p_organization_id, 'manage_coa');
  if v_name is null then raise exception 'Enter a name for the bank account' using errcode = 'check_violation'; end if;
  if v_id is null then
    if p_doc ->> 'account_id' is not null then
      select * into v_acc from public.accounts where id = (p_doc ->> 'account_id')::uuid and organization_id = p_organization_id;
      if v_acc.id is null or v_acc.subtype not in ('bank', 'cash') then
        raise exception 'Choose a bank or cash account from the chart of accounts' using errcode = 'check_violation';
      end if;
    else
      select min(c)::text into v_code from generate_series(1011, 1099) c
       where not exists (select 1 from public.accounts where organization_id = p_organization_id and code = c::text);
      if v_code is null then raise exception 'No free account code between 1011 and 1099' using errcode = 'check_violation'; end if;
      insert into public.accounts (organization_id, code, name, type, subtype, report_group, is_control)
      values (p_organization_id, v_code, 'Bank - ' || v_name, 'asset', 'bank', 'Cash & equivalents', true)
      returning * into v_acc;
    end if;
    insert into public.bank_accounts (organization_id, account_id, name, bank_name, iban_last4, currency)
    values (p_organization_id, v_acc.id, v_name, nullif(btrim(p_doc ->> 'bank_name'), ''), nullif(btrim(p_doc ->> 'iban_last4'), ''),
            coalesce(nullif(p_doc ->> 'currency', ''), 'AED'))
    returning id into v_id;
  else
    update public.bank_accounts set name = v_name, bank_name = nullif(btrim(p_doc ->> 'bank_name'), ''),
           iban_last4 = nullif(btrim(p_doc ->> 'iban_last4'), ''), is_active = coalesce((p_doc ->> 'is_active')::boolean, true)
     where id = v_id and organization_id = p_organization_id;
    if not found then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  end if;
  return v_id;
end $$;

create or replace function app.save_bank_mapping(p_bank_account_id uuid, p_mapping jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := (select organization_id from public.bank_accounts where id = p_bank_account_id);
begin
  if v_org is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  perform app.require(v_org, 'prepare');
  update public.bank_accounts set column_mapping = p_mapping where id = p_bank_account_id;
end $$;

-- p_rows: [{date, description, reference?, amount (signed minor units), balance?}] in file order.
create or replace function app.import_bank_statement(p_bank_account_id uuid, p_file_name text, p_file_sha256 text, p_rows jsonb, p_closing_balance bigint default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v_stmt uuid;
  v_end date;
  v_prev timestamptz;
  v_lines int; v_new int; v_old int; v_locked int;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'prepare');
  select created_at into v_prev from public.bank_statements where bank_account_id = ba.id and file_sha256 = p_file_sha256;
  if v_prev is not null then
    raise exception 'This statement file was already uploaded on % — nothing imported', to_char(v_prev, 'DD Mon YYYY') using errcode = 'unique_violation'; -- BANK-01
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no statement lines' using errcode = 'check_violation';
  end if;
  v_end := app.bank_reconciled_to(ba.id);

  create temp table if not exists _bank_rows (n int, txn_date date, description text, reference text, amount bigint, balance bigint, hash text) on commit drop;
  truncate _bank_rows;
  insert into _bank_rows (n, txn_date, description, reference, amount, balance)
  select x.ord, (x.r ->> 'date')::date, coalesce(nullif(btrim(regexp_replace(x.r ->> 'description', '\s+', ' ', 'g')), ''), '(no description)'),
         nullif(btrim(x.r ->> 'reference'), ''), (x.r ->> 'amount')::bigint, (x.r ->> 'balance')::bigint
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  if exists (select 1 from _bank_rows where txn_date is null or amount is null or amount = 0) then
    raise exception 'Every line needs a date and an amount other than zero — check the column mapping' using errcode = 'check_violation';
  end if;
  -- DM-07: the n-th identical line of a file keeps the same hash in every file that contains it.
  update _bank_rows r set hash = encode(sha256(convert_to(concat_ws('|', r.txn_date, r.amount, lower(r.description), r.balance, s.k), 'UTF8')), 'hex')
    from (select n, row_number() over (partition by txn_date, amount, lower(description), balance order by n) k from _bank_rows) s
   where s.n = r.n;

  select count(*) into v_lines from _bank_rows;
  select count(*) into v_old from _bank_rows r where exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.dedupe_hash = r.hash);
  select count(*) into v_locked from _bank_rows r
   where v_end is not null and r.txn_date <= v_end and not exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.dedupe_hash = r.hash);
  if v_locked > 0 then
    raise exception '% new line(s) are dated on or before the reconciliation approved to % — that month is closed', v_locked, v_end using errcode = 'check_violation';
  end if;

  insert into public.bank_statements (organization_id, bank_account_id, file_name, file_sha256, period_start, period_end, closing_balance,
         line_count, uploaded_by)
  select ba.organization_id, ba.id, left(p_file_name, 200), p_file_sha256, min(txn_date), max(txn_date),
         coalesce(p_closing_balance, (select balance from _bank_rows where balance is not null order by txn_date desc, n desc limit 1)), v_lines, v_uid
  from _bank_rows
  returning id into v_stmt;
  insert into public.bank_transactions (organization_id, bank_account_id, statement_id, txn_date, description, reference, amount, balance, dedupe_hash)
  select ba.organization_id, ba.id, v_stmt, txn_date, description, reference, amount, balance, hash from _bank_rows order by n
  on conflict (bank_account_id, dedupe_hash) do nothing;
  get diagnostics v_new = row_count;
  update public.bank_statements set imported_count = v_new, duplicate_count = v_lines - v_new where id = v_stmt;
  return jsonb_build_object('statement_id', v_stmt, 'lines', v_lines, 'imported', v_new, 'duplicates', v_lines - v_new);
end $$;

-- ── Matching (F-16 · BANK-02) ───────────────────────────────────────────────────────────
create or replace function app.match_bank_transaction(p_txn_id uuid, p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  v_uid uuid;
  v_amount bigint;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(t.organization_id, 'prepare');
  if t.journal_line_id is not null then raise exception 'This bank line is already matched' using errcode = 'check_violation'; end if;
  select b.amount into v_amount from app.bank_book(t.bank_account_id) b where b.line_id = p_line_id and b.matched_txn is null;
  if v_amount is null then raise exception 'That ledger line is not an unmatched line of this bank account' using errcode = 'check_violation'; end if;
  if v_amount <> t.amount then
    raise exception 'The amounts differ (bank %, ledger %)', t.amount / 100.0, v_amount / 100.0 using errcode = 'check_violation';
  end if;
  update public.bank_transactions set status = 'matched', journal_line_id = p_line_id, matched_by = v_uid, matched_at = now() where id = p_txn_id;
end $$;

create or replace function app.unmatch_bank_transaction(p_txn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.bank_transactions;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  perform app.require(t.organization_id, 'prepare');
  update public.bank_transactions set status = 'unmatched', journal_line_id = null, matched_by = null, matched_at = null where id = p_txn_id;
end $$;

-- Same amount, date within ± N days (firm setting), one-to-one, closest date first.
create or replace function app.auto_match_bank(p_bank_account_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v_tol int;
  v_end date;
  t record;
  v_line uuid;
  v_n int := 0;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'prepare');
  v_tol := coalesce((app.firm_setting((select firm_id from public.organizations where id = ba.organization_id), 'bank_match_tolerance_days') #>> '{}')::int, 5);
  v_end := app.bank_reconciled_to(ba.id);
  for t in select * from public.bank_transactions where bank_account_id = ba.id and status = 'unmatched' order by txn_date, created_at, id loop
    select b.line_id into v_line from app.bank_book(ba.id) b
     where b.matched_txn is null and b.eligible and b.amount = t.amount and abs(b.entry_date - t.txn_date) <= v_tol
       and (v_end is null or t.txn_date > v_end or b.entry_date > v_end)
     order by abs(b.entry_date - t.txn_date), b.entry_date, b.line_id limit 1;
    if v_line is not null then
      update public.bank_transactions set status = 'matched', journal_line_id = v_line, matched_by = v_uid, matched_at = now() where id = t.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ── Posting other bank lines (D-39): a journal to one account, no VAT, approved by someone else ─
create or replace function app.post_bank_line(p_txn_id uuid, p_account_id uuid, p_memo text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  ba public.bank_accounts;
  v_acc public.accounts;
  v_uid uuid;
  v_j uuid;
  v_rate numeric;
  v_aed bigint;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(t.organization_id, 'prepare');
  if t.journal_line_id is not null then raise exception 'This bank line is already matched' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.journals where source = 'bank' and source_id = t.id and status in ('draft', 'pending')) then
    raise exception 'A journal for this bank line is already waiting for approval' using errcode = 'check_violation';
  end if;
  select * into ba from public.bank_accounts where id = t.bank_account_id;
  select * into v_acc from public.accounts where id = p_account_id and organization_id = t.organization_id;
  if v_acc.id is null or not v_acc.is_active or v_acc.id = ba.account_id
     or (v_acc.is_control and coalesce(v_acc.subtype, '') not in ('bank', 'cash')) then
    raise exception 'Choose an active account (customers and suppliers go through receipts and payments)' using errcode = 'check_violation';
  end if;
  v_rate := app.fx_rate(ba.currency, t.txn_date);
  v_aed := app.round_half_up(abs(t.amount) * v_rate);

  perform app.set_ctx('post_bank_line');
  insert into public.journals (organization_id, entry_date, source, source_id, memo, prepared_by, status)
  values (t.organization_id, t.txn_date, 'bank', t.id, coalesce(nullif(btrim(p_memo), ''), t.description), v_uid, 'pending')
  returning id into v_j;
  perform app.add_line(v_j, t.organization_id, ba.account_id, sign(t.amount)::bigint * v_aed, null, t.description,
                       ba.currency, v_rate, case when ba.currency = 'AED' then null else abs(t.amount) end);
  perform app.add_line(v_j, t.organization_id, v_acc.id, -sign(t.amount)::bigint * v_aed, null, coalesce(nullif(btrim(p_memo), ''), t.description));
  perform app.set_ctx(null);
  return v_j;
end $$;

-- Links a draft receipt/payment to the bank line it came from; matched when it is posted.
create or replace function app.set_payment_bank_line(p_payment_id uuid, p_txn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments; t public.bank_transactions;
begin
  select * into p from public.payments where id = p_payment_id for update;
  select * into t from public.bank_transactions where id = p_txn_id;
  if p.id is null or t.id is null or p.organization_id <> t.organization_id then raise exception 'Not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'prepare');
  if p.status = 'posted' then raise exception 'Already posted' using errcode = 'check_violation'; end if;
  if (select account_id from public.bank_accounts where id = t.bank_account_id) <> p.bank_account_id then
    raise exception 'The payment uses a different bank account than the bank line' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('save_payment');
  update public.payments set bank_transaction_id = t.id where id = p.id;
  perform app.set_ctx(null);
end $$;

-- When a linked receipt/payment or a bank-line journal is posted, its bank line is matched automatically.
create or replace function app.match_after_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_txn uuid; v_line uuid; t public.bank_transactions;
begin
  if tg_table_name = 'payments' then
    if not (new.status = 'posted' and old.status <> 'posted' and new.bank_transaction_id is not null) then return null; end if;
    v_txn := new.bank_transaction_id;
    select * into t from public.bank_transactions where id = v_txn;
    select b.line_id into v_line from app.bank_book(t.bank_account_id) b
     where b.journal_id = new.journal_id and b.amount = t.amount and b.matched_txn is null limit 1;
  else
    if not (new.status = 'posted' and old.status <> 'posted' and new.source = 'bank') then return null; end if;
    v_txn := new.source_id;
    select * into t from public.bank_transactions where id = v_txn;
    select b.line_id into v_line from app.bank_book(t.bank_account_id) b
     where b.journal_id = new.id and b.amount = t.amount and b.matched_txn is null limit 1;
  end if;
  if v_line is not null and t.journal_line_id is null then
    update public.bank_transactions set status = 'matched', journal_line_id = v_line, matched_by = new.approved_by, matched_at = now() where id = t.id;
  end if;
  return null;
end $$;
create trigger match_bank after update of status on public.payments for each row execute function app.match_after_post();
create trigger match_bank after update of status on public.journals for each row execute function app.match_after_post();

-- ── D-40 · reversing receipts and payments ──────────────────────────────────────────────
-- A payment counts only while its journal is posted and no reversal of it has been requested.
create or replace function app.payment_live(p_payment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payments p join public.journals j on j.id = p.journal_id
                 where p.id = p_payment_id and p.status = 'posted' and j.status = 'posted')
$$;

create or replace function app.sales_open(p_id uuid, out open_fcy bigint, out open_aed bigint)
language sql stable security definer set search_path = '' as $$
  select i.gross_total_fcy - coalesce(cn.fcy, 0) - coalesce(al.fcy, 0), i.gross_total - coalesce(cn.aed, 0) - coalesce(al.aed, 0)
  from public.sales_invoices i
  left join lateral (select sum(c.gross_total_fcy) fcy, sum(c.gross_total) aed from public.sales_invoices c
                     where c.original_invoice_id = i.id and c.status = 'posted') cn on true
  left join lateral (select sum(a.amount_fcy) fcy, sum(a.amount) aed from public.payment_allocations a
                     where a.sales_invoice_id = i.id and app.payment_live(a.payment_id)
                       and (a.journal_id is null or (select status from public.journals where id = a.journal_id) = 'posted')) al on true
  where i.id = p_id
$$;

create or replace function app.bill_open(p_id uuid, out open_fcy bigint, out open_aed bigint)
language sql stable security definer set search_path = '' as $$
  select b.payable_total_fcy - coalesce(dn.fcy, 0) - coalesce(al.fcy, 0), b.payable_total - coalesce(dn.aed, 0) - coalesce(al.aed, 0)
  from public.purchase_bills b
  left join lateral (select sum(d.payable_total_fcy) fcy, sum(d.payable_total) aed from public.purchase_bills d
                     where d.original_bill_id = b.id and d.status = 'posted') dn on true
  left join lateral (select sum(a.amount_fcy) fcy, sum(a.amount) aed from public.payment_allocations a
                     where a.purchase_bill_id = b.id and app.payment_live(a.payment_id)
                       and (a.journal_id is null or (select status from public.journals where id = a.journal_id) = 'posted')) al on true
  where b.id = p_id
$$;

create or replace function app.credit_left(p_id uuid, out left_fcy bigint, out left_aed bigint)
language sql stable security definer set search_path = '' as $$
  select p.credit_fcy - coalesce(sum(a.amount_fcy), 0), p.credit_aed - coalesce(sum(a.credit_amount), 0)
  from public.payments p
  left join public.payment_allocations a on a.payment_id = p.id and a.credit_amount is not null
       and (a.refund_id is null or app.payment_live(a.refund_id))
  where p.id = p_id and app.payment_live(p.id)
    and not exists (select 1 from public.journals r where r.reversal_of = p.journal_id)
  group by p.credit_fcy, p.credit_aed
$$;

-- Journals may be reversed when they are manual, opening or bank-line journals, or the journal of a receipt /
-- payment whose credit has not been used (D-40). Lines matched to the bank must be unmatched first.
create or replace function app.reverse_journal(p_journal_id uuid, p_reason text, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  j public.journals;
  v_uid uuid;
  v_new uuid;
  v_payment public.payments;
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
  if j.source in ('receipt', 'payment') then
    select * into v_payment from public.payments where journal_id = j.id;
    if v_payment.id is null then
      raise exception 'This journal applies a credit to a document — it cannot be reversed on its own' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.payment_allocations a where a.payment_id = v_payment.id and a.credit_amount is not null
               and (a.refund_id is null or app.payment_live(a.refund_id))) then
      raise exception 'Part of this payment''s credit has already been used or refunded — reverse that first' using errcode = 'check_violation';
    end if;
  elsif j.source not in ('manual', 'opening', 'bank') then
    raise exception 'This journal comes from a document (%) — correct the document instead (e.g. a credit note)', j.source using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.bank_transactions t join public.journal_lines l on l.id = t.journal_line_id where l.journal_id = j.id) then
    raise exception 'This journal is matched to a bank statement line — unmatch it first' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.journals where reversal_of = j.id) then
    raise exception 'A reversal of this journal is already waiting for approval' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('reverse_journal');
  perform set_config('app.reason', p_reason, true);
  insert into public.journals (organization_id, entry_date, source, source_id, memo, reversal_of, prepared_by, status, contact_id)
  values (j.organization_id, p_date, 'reversal', j.id,
          'Reversal of ' || j.journal_no || ': ' || btrim(p_reason), j.id, v_uid, 'pending', j.contact_id)
  returning id into v_new;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, contact_id, description)
  select v_new, organization_id, line_no, account_id, credit, debit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, contact_id, description
  from public.journal_lines where journal_id = j.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_new;
end $$;

-- ── Reconciliation (D-41 · BANK-03) ─────────────────────────────────────────────────────
-- Items not yet on both sides at p_end: bank lines not in the books, book lines not on the statement.
create or replace function app.bank_rec_items(p_bank_account_id uuid, p_end date)
returns table (side text, id uuid, item_date date, description text, amount bigint)
language sql stable security definer set search_path = '' as $$
  select 'bank', t.id, t.txn_date, t.description, t.amount
  from public.bank_transactions t
  left join public.journal_lines l on l.id = t.journal_line_id
  left join public.journals j on j.id = l.journal_id
  where t.bank_account_id = p_bank_account_id and t.txn_date <= p_end and (t.journal_line_id is null or j.entry_date > p_end)
  union all
  select 'book', b.line_id, b.entry_date, coalesce(b.journal_no || ' · ', '') || coalesce(b.description, b.memo, ''), b.amount
  from app.bank_book(p_bank_account_id) b
  where b.entry_date <= p_end and (b.matched_txn is null or b.txn_date > p_end)
$$;

create or replace function app.bank_book_balance(p_bank_account_id uuid, p_end date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::bigint from app.bank_book(p_bank_account_id) where entry_date <= p_end
$$;

-- What the screen shows: book balance, items, and the statement balance the bank says.
create or replace function app.bank_reconciliation_preview(p_bank_account_id uuid, p_end date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ba public.bank_accounts;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  perform app.require(ba.organization_id, 'view');
  return jsonb_build_object(
    'book_balance', app.bank_book_balance(ba.id, p_end),
    'statement_balance', (select balance from public.bank_transactions where bank_account_id = ba.id and txn_date <= p_end and balance is not null
                          order by txn_date desc, created_at desc limit 1),
    'unreconciled_bank', (select coalesce(sum(amount), 0) from app.bank_rec_items(ba.id, p_end) where side = 'bank'),
    'unreconciled_book', (select coalesce(sum(amount), 0) from app.bank_rec_items(ba.id, p_end) where side = 'book'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.side, i.item_date) from app.bank_rec_items(ba.id, p_end) i), '[]'),
    'reconciled_to', app.bank_reconciled_to(ba.id));
end $$;

create or replace function app.save_bank_reconciliation(p_bank_account_id uuid, p_end date, p_statement_balance bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v jsonb;
  v_diff bigint;
  v_id uuid;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'prepare');
  if p_end <= coalesce(app.bank_reconciled_to(ba.id), '-infinity'::date) then
    raise exception 'The account is already reconciled to %', app.bank_reconciled_to(ba.id) using errcode = 'check_violation';
  end if;
  v := app.bank_reconciliation_preview(ba.id, p_end);
  v_diff := p_statement_balance - ((v ->> 'book_balance')::bigint + (v ->> 'unreconciled_bank')::bigint - (v ->> 'unreconciled_book')::bigint);
  if v_diff <> 0 then
    raise exception 'Not reconciled yet: a difference of % remains', v_diff / 100.0 using errcode = 'check_violation';
  end if;
  delete from public.bank_reconciliations where bank_account_id = ba.id and status = 'pending';
  insert into public.bank_reconciliations (organization_id, bank_account_id, period_end, statement_balance, book_balance,
         unreconciled_bank, unreconciled_book, snapshot, prepared_by)
  values (ba.organization_id, ba.id, p_end, p_statement_balance, (v ->> 'book_balance')::bigint,
          (v ->> 'unreconciled_bank')::bigint, (v ->> 'unreconciled_book')::bigint, v -> 'items', v_uid)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.approve_bank_reconciliation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.bank_reconciliations; v_uid uuid; v jsonb;
begin
  select * into r from public.bank_reconciliations where id = p_id for update;
  if r.id is null then raise exception 'Reconciliation not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'approve_document');
  if r.status <> 'pending' then raise exception 'Already approved' using errcode = 'check_violation'; end if;
  if r.prepared_by = v_uid then
    raise exception 'You prepared this reconciliation, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;
  v := app.bank_reconciliation_preview(r.bank_account_id, r.period_end);
  if (v ->> 'book_balance')::bigint + (v ->> 'unreconciled_bank')::bigint - (v ->> 'unreconciled_book')::bigint <> r.statement_balance then
    raise exception 'The bank or the books changed since it was prepared — prepare it again' using errcode = 'check_violation';
  end if;
  update public.bank_reconciliations set status = 'posted', approved_by = v_uid, approved_at = now(), book_balance = (v ->> 'book_balance')::bigint,
         unreconciled_bank = (v ->> 'unreconciled_bank')::bigint, unreconciled_book = (v ->> 'unreconciled_book')::bigint, snapshot = v -> 'items'
   where id = p_id;
end $$;

create or replace function app.delete_bank_reconciliation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.bank_reconciliations;
begin
  select * into r from public.bank_reconciliations where id = p_id;
  if r.id is null then raise exception 'Reconciliation not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'prepare');
  delete from public.bank_reconciliations where id = p_id;
end $$;

-- ── API ─────────────────────────────────────────────────────────────────────────────────
grant execute on function app.save_bank_account(uuid, uuid, jsonb), app.save_bank_mapping(uuid, jsonb),
  app.import_bank_statement(uuid, text, text, jsonb, bigint), app.match_bank_transaction(uuid, uuid), app.unmatch_bank_transaction(uuid),
  app.auto_match_bank(uuid), app.post_bank_line(uuid, uuid, text), app.set_payment_bank_line(uuid, uuid),
  app.bank_reconciliation_preview(uuid, date), app.save_bank_reconciliation(uuid, date, bigint), app.approve_bank_reconciliation(uuid),
  app.delete_bank_reconciliation(uuid) to authenticated;

create function public.save_bank_account(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app.save_bank_account(p_id, p_organization_id, p_doc) $$;
create function public.save_bank_mapping(p_bank_account_id uuid, p_mapping jsonb) returns void
language sql security invoker set search_path = '' as $$ select app.save_bank_mapping(p_bank_account_id, p_mapping) $$;
create function public.import_bank_statement(p_bank_account_id uuid, p_file_name text, p_file_sha256 text, p_rows jsonb, p_closing_balance bigint default null) returns jsonb
language sql security invoker set search_path = '' as $$ select app.import_bank_statement(p_bank_account_id, p_file_name, p_file_sha256, p_rows, p_closing_balance) $$;
create function public.match_bank_transaction(p_txn_id uuid, p_line_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.match_bank_transaction(p_txn_id, p_line_id) $$;
create function public.unmatch_bank_transaction(p_txn_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.unmatch_bank_transaction(p_txn_id) $$;
create function public.auto_match_bank(p_bank_account_id uuid) returns int
language sql security invoker set search_path = '' as $$ select app.auto_match_bank(p_bank_account_id) $$;
create function public.post_bank_line(p_txn_id uuid, p_account_id uuid, p_memo text default null) returns uuid
language sql security invoker set search_path = '' as $$ select app.post_bank_line(p_txn_id, p_account_id, p_memo) $$;
create function public.set_payment_bank_line(p_payment_id uuid, p_txn_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.set_payment_bank_line(p_payment_id, p_txn_id) $$;
create function public.bank_reconciliation_preview(p_bank_account_id uuid, p_end date) returns jsonb
language sql security invoker set search_path = '' as $$ select app.bank_reconciliation_preview(p_bank_account_id, p_end) $$;
create function public.save_bank_reconciliation(p_bank_account_id uuid, p_end date, p_statement_balance bigint) returns uuid
language sql security invoker set search_path = '' as $$ select app.save_bank_reconciliation(p_bank_account_id, p_end, p_statement_balance) $$;
create function public.approve_bank_reconciliation(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.approve_bank_reconciliation(p_id) $$;
create function public.delete_bank_reconciliation(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_bank_reconciliation(p_id) $$;

revoke all on function public.save_bank_account(uuid, uuid, jsonb), public.save_bank_mapping(uuid, jsonb),
  public.import_bank_statement(uuid, text, text, jsonb, bigint), public.match_bank_transaction(uuid, uuid), public.unmatch_bank_transaction(uuid),
  public.auto_match_bank(uuid), public.post_bank_line(uuid, uuid, text), public.set_payment_bank_line(uuid, uuid),
  public.bank_reconciliation_preview(uuid, date), public.save_bank_reconciliation(uuid, date, bigint), public.approve_bank_reconciliation(uuid),
  public.delete_bank_reconciliation(uuid) from public, anon;
grant execute on function public.save_bank_account(uuid, uuid, jsonb), public.save_bank_mapping(uuid, jsonb),
  public.import_bank_statement(uuid, text, text, jsonb, bigint), public.match_bank_transaction(uuid, uuid), public.unmatch_bank_transaction(uuid),
  public.auto_match_bank(uuid), public.post_bank_line(uuid, uuid, text), public.set_payment_bank_line(uuid, uuid),
  public.bank_reconciliation_preview(uuid, date), public.save_bank_reconciliation(uuid, date, bigint), public.approve_bank_reconciliation(uuid),
  public.delete_bank_reconciliation(uuid) to authenticated;
