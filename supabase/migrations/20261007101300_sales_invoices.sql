-- P2-02 · Sales invoices and credit notes (Spec 01 §4.6 · F-01, F-13, F-24, F-25 · D-10, D-21, D-22,
-- D-29, D-30 · VAT-01/02/09/10, FX-01, NUM-01 → 08, DM-02/03/15).
--   • Amounts are calculated by the database: line = round-half-up(quantity × unit price); a USD line is
--     converted to AED at fx.usd_aed first; VAT = round-half-up(AED net × rate) per line, rate from the
--     tax rules in force on the invoice date (D-29: the invoice date is the tax date).
--   • Draft → submit → a second person approves. Approving numbers the invoice (INV-/CN-) and posts the
--     journal: Dr Receivables / Cr income per line / Cr VAT output (credit notes the other way).
--   • Posted invoices are never edited or deleted; corrections are credit notes, capped at what is left
--     on the original (D-30). Document journals cannot be reversed directly.

create type public.sales_doc_type as enum ('invoice', 'credit_note');
create type public.document_status as enum ('draft', 'pending', 'posted');

create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doc_type public.sales_doc_type not null default 'invoice',
  invoice_no text,
  original_invoice_id uuid,
  contact_id uuid not null,
  issue_date date not null,
  due_date date not null,
  supply_date date,
  supply_emirate text not null references public.emirates (code) on delete restrict,
  currency char(3) not null default 'AED' references public.currencies (code) on delete restrict,
  fx_rate numeric(12, 6) not null default 1 check (fx_rate > 0),
  customer_reference text,
  notes text,
  status public.document_status not null default 'draft',
  journal_id uuid unique,
  net_total bigint not null default 0 check (net_total >= 0),          -- AED fils
  vat_total bigint not null default 0 check (vat_total >= 0),
  gross_total bigint not null default 0 check (gross_total >= 0),
  gross_total_fcy bigint not null default 0 check (gross_total_fcy >= 0), -- document currency (cents for USD)
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  unique (organization_id, invoice_no),                                   -- DM-02 / DM-03
  unique (id, organization_id),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete restrict,
  foreign key (original_invoice_id, organization_id) references public.sales_invoices (id, organization_id) on delete restrict,
  foreign key (journal_id, organization_id) references public.journals (id, organization_id) on delete restrict,
  check (approved_by <> prepared_by),                                     -- R1
  check ((doc_type = 'credit_note') = (original_invoice_id is not null)),
  check ((status = 'posted') = (invoice_no is not null and journal_id is not null and posted_at is not null)),
  check (due_date >= issue_date),
  check (currency <> 'AED' or fx_rate = 1),
  check (gross_total = net_total + vat_total)
);
select app.setup_table('public.sales_invoices');
create index sales_invoices_contact_idx on public.sales_invoices (contact_id, organization_id);
create index sales_invoices_original_idx on public.sales_invoices (original_invoice_id, organization_id);
create index sales_invoices_journal_idx on public.sales_invoices (journal_id, organization_id);
create index sales_invoices_prepared_by_idx on public.sales_invoices (prepared_by);
create index sales_invoices_approved_by_idx on public.sales_invoices (approved_by);
create index sales_invoices_emirate_idx on public.sales_invoices (supply_emirate);
create index sales_invoices_currency_idx on public.sales_invoices (currency);
create index sales_invoices_org_date_idx on public.sales_invoices (organization_id, issue_date);

create table public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null,
  organization_id uuid not null,
  line_no smallint not null check (line_no > 0),
  description text not null check (btrim(description) <> ''),
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price bigint not null check (unit_price > 0),                       -- document currency, minor units
  account_id uuid not null,
  tax_code text not null references public.tax_codes (code) on delete restrict,
  net_fcy bigint not null default 0 check (net_fcy >= 0),
  vat_fcy bigint not null default 0 check (vat_fcy >= 0),
  net bigint not null default 0 check (net >= 0),                          -- AED fils
  vat bigint not null default 0 check (vat >= 0),
  unique (sales_invoice_id, line_no),
  foreign key (sales_invoice_id, organization_id) references public.sales_invoices (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  check (tax_code in ('SR', 'ZR', 'EX', 'OS'))                             -- sales tax codes only
);
select app.setup_table('public.sales_invoice_lines');
create index sales_invoice_lines_invoice_idx on public.sales_invoice_lines (sales_invoice_id, organization_id);
create index sales_invoice_lines_account_idx on public.sales_invoice_lines (account_id, organization_id);
create index sales_invoice_lines_tax_code_idx on public.sales_invoice_lines (tax_code);

-- Read through RLS; every change goes through the functions below (no write grants).
create policy mfa on public.sales_invoices as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy mfa on public.sales_invoice_lines as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.sales_invoices for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy sel on public.sales_invoice_lines for select to authenticated using (organization_id in (select app.orgs_with('view')));
grant select on public.sales_invoices, public.sales_invoice_lines to authenticated;

-- Posted documents are frozen for everyone (R2).
create or replace function app.sales_invoices_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.document_status;
begin
  if tg_table_name = 'sales_invoices' then
    v_status := old.status;
  else
    select status into v_status from public.sales_invoices where id = old.sales_invoice_id;
  end if;
  if v_status = 'posted' and app.ctx() <> 'post_sales_invoice' then
    raise exception 'Posted invoices and credit notes cannot be changed — issue a credit note instead' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before update or delete on public.sales_invoices for each row execute function app.sales_invoices_guard();
create trigger guard before update or delete on public.sales_invoice_lines for each row execute function app.sales_invoices_guard();

-- ── Calculation rules (F-01, F-24) ──────────────────────────────────────────────────────
-- Half-up to the whole fils/cent (Postgres rounds numeric halves away from zero; amounts are ≥ 0).
create or replace function app.round_half_up(x numeric) returns bigint
language sql immutable set search_path = '' as $$ select round(x)::bigint $$;

-- AED per unit of currency on a date: AED = 1; USD = fx.usd_aed in force (D-21); others refused (FX-06).
create or replace function app.fx_rate(p_currency text, p_on date) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_currency = 'AED' then return 1; end if;
  if p_currency = 'USD' then return (app.config_value('fx.usd_aed', p_on) #>> '{}')::numeric; end if;
  raise exception 'Currency % is not supported (AED and USD only)', p_currency using errcode = 'check_violation';
end $$;

create or replace function app.sales_line_amounts(p_quantity numeric, p_unit_price bigint, p_tax_code text,
  p_currency text, p_fx numeric, p_on date, out net_fcy bigint, out vat_fcy bigint, out net bigint, out vat bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_rate int := 0; v_key text;
begin
  select rate_key into v_key from public.tax_codes where code = p_tax_code;
  if v_key is not null then v_rate := (app.config_value(v_key, p_on) #>> '{}')::int; end if;
  net_fcy := app.round_half_up(p_quantity * p_unit_price);
  vat_fcy := app.round_half_up(net_fcy * v_rate / 10000.0);
  net := case when p_currency = 'AED' then net_fcy else app.round_half_up(net_fcy * p_fx) end;     -- F-24: line → AED first
  vat := app.round_half_up(net * v_rate / 10000.0);                                                -- F-01: VAT on the AED line
end $$;

-- Recalculates every line and the totals of a document from quantity, price, tax code and date.
create or replace function app.recalc_sales_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices;
begin
  select * into inv from public.sales_invoices where id = p_id;
  update public.sales_invoice_lines l set net_fcy = a.net_fcy, vat_fcy = a.vat_fcy, net = a.net, vat = a.vat
    from public.sales_invoice_lines l2,
         lateral app.sales_line_amounts(l2.quantity, l2.unit_price, l2.tax_code, inv.currency, inv.fx_rate, inv.issue_date) a
   where l.id = l2.id and l.sales_invoice_id = p_id;
  update public.sales_invoices s set
    net_total = coalesce(t.net, 0), vat_total = coalesce(t.vat, 0), gross_total = coalesce(t.net, 0) + coalesce(t.vat, 0),
    gross_total_fcy = coalesce(t.net_fcy, 0) + coalesce(t.vat_fcy, 0)
  from (select sum(net) net, sum(vat) vat, sum(net_fcy) net_fcy, sum(vat_fcy) vat_fcy from public.sales_invoice_lines where sales_invoice_id = p_id) t
  where s.id = p_id;
end $$;

-- ── Workflow ────────────────────────────────────────────────────────────────────────────
-- Saves a draft (header + all lines) in one call. p_doc: {doc_type, contact_id, issue_date, due_date?,
-- supply_date?, supply_emirate?, currency?, original_invoice_id?, customer_reference?, notes?,
-- lines: [{description, quantity, unit_price, account_id, tax_code}]} — unit_price in minor units.
create or replace function app.save_sales_invoice(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'prepare');
  v_type public.sales_doc_type := coalesce(p_doc ->> 'doc_type', 'invoice')::public.sales_doc_type;
  v_contact public.contacts;
  v_orig public.sales_invoices;
  v_issue date := (p_doc ->> 'issue_date')::date;
  v_currency text := coalesce(nullif(p_doc ->> 'currency', ''), 'AED');
  v_emirate text;
  v_due date;
  v_id uuid := p_id;
  v_line jsonb;
  v_acc public.accounts;
  v_n int := 0;
begin
  if v_issue is null then raise exception 'Enter the invoice date' using errcode = 'check_violation'; end if;
  select * into v_contact from public.contacts where id = (p_doc ->> 'contact_id')::uuid and organization_id = p_organization_id;
  if v_contact.id is null then raise exception 'Choose a customer of this client' using errcode = 'check_violation'; end if;
  if v_contact.kind = 'supplier' then raise exception '% is set up as a supplier only — make it a customer first', v_contact.name using errcode = 'check_violation'; end if;
  if not v_contact.is_active then raise exception '% is inactive', v_contact.name using errcode = 'check_violation'; end if;
  if v_type = 'credit_note' then
    select * into v_orig from public.sales_invoices
     where id = (p_doc ->> 'original_invoice_id')::uuid and organization_id = p_organization_id;
    if v_orig.id is null or v_orig.doc_type <> 'invoice' or v_orig.status <> 'posted' then
      raise exception 'A credit note must refer to a posted invoice of this client' using errcode = 'check_violation';
    end if;
    if v_orig.contact_id <> v_contact.id or v_orig.currency <> v_currency then
      raise exception 'A credit note must be for the same customer and currency as its invoice' using errcode = 'check_violation';
    end if;
  end if;
  v_emirate := coalesce(nullif(p_doc ->> 'supply_emirate', ''), v_orig.supply_emirate,
                        (select emirate_code from public.organizations where id = p_organization_id));      -- D-10
  v_due := coalesce((p_doc ->> 'due_date')::date, v_issue + v_contact.payment_terms_days);                   -- F-13
  if jsonb_typeof(p_doc -> 'lines') is distinct from 'array' or jsonb_array_length(p_doc -> 'lines') = 0 then
    raise exception 'Add at least one line' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('save_sales_invoice');
  if v_id is null then
    insert into public.sales_invoices (organization_id, doc_type, original_invoice_id, contact_id, issue_date, due_date, supply_date,
           supply_emirate, currency, fx_rate, customer_reference, notes, prepared_by)
    values (p_organization_id, v_type, v_orig.id, v_contact.id, v_issue, v_due, (p_doc ->> 'supply_date')::date,
            v_emirate, v_currency, app.fx_rate(v_currency, v_issue), nullif(btrim(p_doc ->> 'customer_reference'), ''),
            nullif(btrim(p_doc ->> 'notes'), ''), v_uid)
    returning id into v_id;
  else
    update public.sales_invoices set doc_type = v_type, original_invoice_id = v_orig.id, contact_id = v_contact.id, issue_date = v_issue,
           due_date = v_due, supply_date = (p_doc ->> 'supply_date')::date, supply_emirate = v_emirate, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_issue), customer_reference = nullif(btrim(p_doc ->> 'customer_reference'), ''),
           notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Invoice not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.sales_invoice_lines where sales_invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_doc -> 'lines') loop
    v_n := v_n + 1;
    select * into v_acc from public.accounts where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id;
    if v_acc.id is null or v_acc.type <> 'revenue' or v_acc.is_control or not v_acc.is_active then
      raise exception 'Line %: choose an active income account', v_n using errcode = 'check_violation';
    end if;
    insert into public.sales_invoice_lines (sales_invoice_id, organization_id, line_no, description, quantity, unit_price, account_id, tax_code)
    values (v_id, p_organization_id, v_n, btrim(v_line ->> 'description'), (v_line ->> 'quantity')::numeric,
            (v_line ->> 'unit_price')::bigint, v_acc.id, v_line ->> 'tax_code');                          -- "100.5" fils is refused
  end loop;
  perform app.recalc_sales_invoice(v_id);
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.submit_sales_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices;
begin
  select * into inv from public.sales_invoices where id = p_id for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'no_data_found'; end if;
  perform app.require(inv.organization_id, 'prepare');
  if inv.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode = 'check_violation'; end if;
  perform app.set_ctx('submit_sales_invoice');
  update public.sales_invoices set status = 'pending' where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.reject_sales_invoice(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices;
begin
  select * into inv from public.sales_invoices where id = p_id for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'no_data_found'; end if;
  perform app.require(inv.organization_id, 'approve_document');
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required to send it back' using errcode = 'check_violation'; end if;
  if inv.status <> 'pending' then raise exception 'Only documents waiting for approval can be sent back' using errcode = 'check_violation'; end if;
  perform app.set_ctx('reject_sales_invoice');
  perform set_config('app.reason', p_reason, true);
  update public.sales_invoices set status = 'draft' where id = p_id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

-- Drafts and pending documents may be deleted; no number was ever used (NUM-06).
create or replace function app.delete_sales_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices;
begin
  select * into inv from public.sales_invoices where id = p_id for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'no_data_found'; end if;
  perform app.require(inv.organization_id, 'prepare');
  if inv.status = 'posted' then raise exception 'Posted invoices cannot be deleted — issue a credit note' using errcode = 'insufficient_privilege'; end if;
  perform app.set_ctx('delete_sales_invoice');
  delete from public.sales_invoices where id = p_id;
  perform app.set_ctx(null);
end $$;

-- Approves and posts: numbers the document and posts its journal in one transaction.
create or replace function app.post_sales_invoice(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  inv public.sales_invoices;
  v_uid uuid;
  v_ar uuid; v_vat uuid;
  v_j uuid; v_no text; v_n int := 0;
  v_sign int;                       -- +1 invoice, -1 credit note (Dr/Cr swap)
  v_remaining_net bigint; v_remaining_vat bigint;
  l public.sales_invoice_lines;
  v_cust text;
begin
  select * into inv from public.sales_invoices where id = p_id for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(inv.organization_id, 'approve_document');
  if inv.status not in ('draft', 'pending') then raise exception 'Already %', inv.status using errcode = 'check_violation'; end if;
  if inv.prepared_by = v_uid then
    raise exception 'You prepared this document, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;

  -- Recalculate with the rules and rate in force on the invoice date, then check.
  update public.sales_invoices set fx_rate = app.fx_rate(currency, issue_date) where id = p_id;
  perform app.recalc_sales_invoice(p_id);
  select * into inv from public.sales_invoices where id = p_id;
  if inv.gross_total <= 0 then raise exception 'The document has no amount' using errcode = 'check_violation'; end if;

  if inv.doc_type = 'credit_note' then                                                              -- D-30
    select o.net_total - coalesce(sum(c.net_total), 0), o.vat_total - coalesce(sum(c.vat_total), 0)
      into v_remaining_net, v_remaining_vat
      from public.sales_invoices o
      left join public.sales_invoices c on c.original_invoice_id = o.id and c.status = 'posted' and c.doc_type = 'credit_note'
     where o.id = inv.original_invoice_id
     group by o.net_total, o.vat_total;
    if inv.net_total > v_remaining_net or inv.vat_total > v_remaining_vat then
      raise exception 'This credit note (net %, VAT %) is more than what is left on the invoice (net %, VAT %)',
        inv.net_total / 100.0, inv.vat_total / 100.0, v_remaining_net / 100.0, v_remaining_vat / 100.0 using errcode = 'check_violation';
    end if;
  end if;

  select id into v_ar from public.accounts where organization_id = inv.organization_id and subtype = 'receivable' and is_active order by code limit 1;
  select id into v_vat from public.accounts where organization_id = inv.organization_id and subtype = 'vat_output' and is_active order by code limit 1;
  if v_ar is null or (inv.vat_total > 0 and v_vat is null) then
    raise exception 'The chart of accounts needs an active receivables account and VAT output account' using errcode = 'check_violation';
  end if;
  select name into v_cust from public.contacts where id = inv.contact_id;
  v_sign := case when inv.doc_type = 'invoice' then 1 else -1 end;

  perform app.set_ctx('post_sales_invoice');
  v_no := app.next_document_number(inv.organization_id, case when inv.doc_type = 'invoice' then 'sales_invoice' else 'credit_note' end::public.doc_type, inv.issue_date);
  insert into public.journals (organization_id, entry_date, source, source_id, memo, contact_id, prepared_by)
  values (inv.organization_id, inv.issue_date, 'sale', inv.id, (case when inv.doc_type = 'invoice' then 'Invoice ' else 'Credit note ' end) || v_no || ' · ' || v_cust,
          inv.contact_id, inv.prepared_by)
  returning id into v_j;

  -- Receivables (gross)
  v_n := v_n + 1;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy, contact_id, description)
  values (v_j, inv.organization_id, v_n, v_ar, greatest(v_sign, 0) * inv.gross_total, greatest(-v_sign, 0) * inv.gross_total,
          inv.currency, inv.fx_rate, case when inv.currency = 'AED' then null else inv.gross_total_fcy end, inv.contact_id, v_no);
  -- Income per line, carrying tax code, VAT and supply emirate for the VAT 201 (F-03, D-10)
  for l in select * from public.sales_invoice_lines where sales_invoice_id = p_id order by line_no loop
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy,
           tax_code, vat_amount, supply_emirate, contact_id, description)
    values (v_j, inv.organization_id, v_n, l.account_id, greatest(-v_sign, 0) * l.net, greatest(v_sign, 0) * l.net,
            inv.currency, inv.fx_rate, case when inv.currency = 'AED' then null else l.net_fcy end,
            l.tax_code, l.vat, inv.supply_emirate, inv.contact_id, l.description);
  end loop;
  -- VAT output
  if inv.vat_total > 0 then
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy, contact_id, description)
    values (v_j, inv.organization_id, v_n, v_vat, greatest(-v_sign, 0) * inv.vat_total, greatest(v_sign, 0) * inv.vat_total,
            inv.currency, inv.fx_rate, case when inv.currency = 'AED' then null else (select sum(vat_fcy) from public.sales_invoice_lines where sales_invoice_id = p_id) end,
            inv.contact_id, 'VAT ' || v_no);
  end if;

  perform app.set_ctx('post_journal');                         -- the journal guard re-checks balance and the period (LED-02, LED-10)
  update public.journals set status = 'posted', approved_by = v_uid, posted_at = now(),
         journal_no = app.next_document_number(inv.organization_id, 'journal', inv.issue_date)
   where id = v_j;
  perform app.set_ctx('post_sales_invoice');
  update public.sales_invoices set status = 'posted', invoice_no = v_no, journal_id = v_j, approved_by = v_uid, posted_at = now() where id = p_id;
  perform app.set_ctx(null);
  return v_no;
end $$;

grant execute on function app.save_sales_invoice(uuid, uuid, jsonb), app.submit_sales_invoice(uuid), app.reject_sales_invoice(uuid, text),
  app.delete_sales_invoice(uuid), app.post_sales_invoice(uuid) to authenticated;

create function public.save_sales_invoice(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app.save_sales_invoice(p_id, p_organization_id, p_doc) $$;
create function public.submit_sales_invoice(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.submit_sales_invoice(p_id) $$;
create function public.reject_sales_invoice(p_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reject_sales_invoice(p_id, p_reason) $$;
create function public.delete_sales_invoice(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_sales_invoice(p_id) $$;
create function public.post_sales_invoice(p_id uuid) returns text
language sql security invoker set search_path = '' as $$ select app.post_sales_invoice(p_id) $$;
revoke all on function public.save_sales_invoice(uuid, uuid, jsonb), public.submit_sales_invoice(uuid), public.reject_sales_invoice(uuid, text),
  public.delete_sales_invoice(uuid), public.post_sales_invoice(uuid) from public, anon;
grant execute on function public.save_sales_invoice(uuid, uuid, jsonb), public.submit_sales_invoice(uuid), public.reject_sales_invoice(uuid, text),
  public.delete_sales_invoice(uuid), public.post_sales_invoice(uuid) to authenticated;

-- ── Adjustments to the journal rules ────────────────────────────────────────────────────
-- Journals created by a document keep the document's preparer (so maker-checker compares the
-- right people); journals typed by a user take the signed-in user as before.
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
    new.prepared_by := case when app.ctx() = '' then coalesce((select auth.uid()), new.prepared_by)
                            else coalesce(new.prepared_by, (select auth.uid())) end;
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

  if app.ctx() = '' then
    if old.source = 'reversal' then
      raise exception 'A reversal request cannot be edited — approve it or cancel it' using errcode = 'insufficient_privilege';
    end if;
    if new.journal_no is not null or new.approved_by is not null or new.posted_at is not null
       or new.source <> old.source or new.reversal_of is distinct from old.reversal_of
       or new.source_id is distinct from old.source_id or new.contact_id is distinct from old.contact_id then
      raise exception 'Only the date, memo and draft/pending status of a journal can be edited' using errcode = 'insufficient_privilege';
    end if;
    new.prepared_by := coalesce((select auth.uid()), new.prepared_by);
  end if;
  return new;
end $$;

-- Journals that come from documents are corrected through the document (credit note), never reversed
-- directly — otherwise the invoice and the ledger would disagree.
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
  if j.source not in ('manual', 'opening') then
    raise exception 'This journal comes from a document (%) — correct the document instead (e.g. a credit note)', j.source using errcode = 'check_violation';
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
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, contact_id, description)
  select v_new, organization_id, line_no, account_id, credit, debit,
         currency, fx_rate, amount_fcy, tax_code, vat_amount, supply_emirate, contact_id, description
  from public.journal_lines where journal_id = j.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_new;
end $$;
