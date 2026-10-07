-- P2-04 · Receipts, supplier payments, refunds, allocations, Customer Credits and Supplier advances
-- (Spec 01 §4.8 · Spec 03 F-15, F-24 · D-11, D-34, D-36, D-37 · ARAP-01→05, 08→12 · DM-05/06 · FX-02/03).
--   • A payment settles documents of its own contact and currency. Open balance of a document =
--     total − posted credit/debit notes − posted allocations (nothing stored, so it cannot drift).
--   • Overpayments become a Customer Credit (2150) or Supplier advance (1160): credit = payment − allocations.
--     Credits are applied automatically, oldest first, when the contact's next invoice/bill is posted,
--     and can be refunded (maker-checker).
--   • D-34: differences up to the firm's small_difference_limit (AED 1.00) go to 6190; bank charges to 6400.
--   • D-37: AED differences from a changed USD rate go to 4310 / 6410. A payment that exactly matches a
--     document's open USD amount clears its open AED amount in full (FX-03).

-- ── Accounts (template and every existing client) ──────────────────────────────────────
insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, a.code, a.name, a.type::public.account_type, a.subtype, a.grp, null, a.ctl
from public.coa_templates t, (values
  ('1160', 'Supplier advances',              'asset',   'supplier_advances', 'Receivables',        true),
  ('4310', 'Exchange gains',                 'revenue', 'fx_gain',           'Other income',       false),
  ('6190', 'Rounding and small differences', 'expense', 'rounding',          'Operating expenses', false),
  ('6410', 'Exchange losses',                'expense', 'fx_loss',           'Finance costs',      false)
) as a(code, name, type, subtype, grp, ctl)
where t.code = 'uae-sme'
on conflict (template_id, code) do nothing;
update public.coa_template_accounts set subtype = 'bank_charges' where code = '6400' and subtype is null;

insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
select o.id, ta.code, ta.name, ta.type, ta.subtype, ta.report_group, ta.ct_tag, ta.is_control
from public.organizations o
join public.coa_template_accounts ta on ta.code in ('1160', '4310', '6190', '6410')
join public.coa_templates t on t.id = ta.template_id and t.code = 'uae-sme'
where not exists (select 1 from public.accounts a where a.organization_id = o.id and (a.code = ta.code or a.subtype = ta.subtype));
update public.accounts set subtype = 'bank_charges' where code = '6400' and subtype is null;

-- ── Tables ──────────────────────────────────────────────────────────────────────────────
create type public.payment_kind as enum ('customer_receipt', 'supplier_payment', 'customer_refund', 'supplier_refund');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.payment_kind not null,
  payment_no text,                                                  -- RCPT-/PAY-, given at posting
  contact_id uuid not null,
  bank_account_id uuid not null,                                    -- the GL bank/cash account (bank_accounts arrive in P2-05)
  payment_date date not null,
  currency char(3) not null default 'AED' references public.currencies (code) on delete restrict,
  fx_rate numeric(12, 6) not null default 1 check (fx_rate > 0),
  amount_fcy bigint not null check (amount_fcy > 0),                -- settled with the contact, in the payment currency
  bank_charges_fcy bigint not null default 0 check (bank_charges_fcy >= 0),
  amount bigint not null default 0 check (amount >= 0),             -- AED at fx_rate
  bank_charges bigint not null default 0 check (bank_charges >= 0),
  writeoff_fcy bigint not null default 0,                           -- documents settled beyond the cash (+) or cash beyond documents (−), D-34
  writeoff bigint not null default 0,
  fx_difference bigint not null default 0,                          -- AED, + = loss (D-37)
  credit_fcy bigint not null default 0 check (credit_fcy >= 0),     -- left as Customer Credit / Supplier advance at posting
  credit_aed bigint not null default 0 check (credit_aed >= 0),
  auto_allocate boolean not null default true,
  reference text,
  notes text,
  status public.document_status not null default 'draft',
  journal_id uuid unique,
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, payment_no),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete restrict,
  foreign key (bank_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  foreign key (journal_id, organization_id) references public.journals (id, organization_id) on delete restrict,
  check (approved_by <> prepared_by),
  check ((status = 'posted') = (journal_id is not null and posted_at is not null and payment_no is not null)),
  check (bank_charges_fcy < amount_fcy),
  check (currency <> 'AED' or fx_rate = 1)
);
select app.setup_table('public.payments');
create index payments_contact_idx on public.payments (contact_id, organization_id);
create index payments_bank_idx on public.payments (bank_account_id, organization_id);
create index payments_journal_idx on public.payments (journal_id, organization_id);
create index payments_prepared_by_idx on public.payments (prepared_by);
create index payments_approved_by_idx on public.payments (approved_by);
create index payments_currency_idx on public.payments (currency);
create index payments_org_date_idx on public.payments (organization_id, payment_date);

-- One row = money (or credit) of payment_id applied to one invoice, bill or refund.
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,                                         -- whose money / credit is used
  sales_invoice_id uuid,
  purchase_bill_id uuid,
  refund_id uuid,                                                   -- the refund that pays out this credit
  amount_fcy bigint not null check (amount_fcy > 0),
  amount bigint not null check (amount > 0),                        -- AED on the document side (or the credit side for refunds)
  credit_amount bigint check (credit_amount > 0),                   -- AED taken from a credit balance (later applications and refunds)
  applied_on date not null,
  journal_id uuid,                                                  -- the credit-application journal (Dr 2150 / Cr 1100 …)
  foreign key (payment_id, organization_id) references public.payments (id, organization_id) on delete cascade,
  foreign key (sales_invoice_id, organization_id) references public.sales_invoices (id, organization_id) on delete restrict,
  foreign key (purchase_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete restrict,
  foreign key (refund_id, organization_id) references public.payments (id, organization_id) on delete restrict,
  foreign key (journal_id, organization_id) references public.journals (id, organization_id) on delete restrict,
  check (num_nonnulls(sales_invoice_id, purchase_bill_id, refund_id) = 1),                 -- DM-06
  check (refund_id is null or credit_amount is not null)
);
select app.setup_table('public.payment_allocations');
create unique index payment_allocations_once on public.payment_allocations (payment_id, sales_invoice_id, purchase_bill_id, refund_id) nulls not distinct;
create index payment_allocations_payment_idx on public.payment_allocations (payment_id, organization_id);
create index payment_allocations_invoice_idx on public.payment_allocations (sales_invoice_id, organization_id);
create index payment_allocations_bill_idx on public.payment_allocations (purchase_bill_id, organization_id);
create index payment_allocations_refund_idx on public.payment_allocations (refund_id, organization_id);
create index payment_allocations_journal_idx on public.payment_allocations (journal_id, organization_id);

do $$
declare t text;
begin
  foreach t in array array['payments', 'payment_allocations'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
  end loop;
end $$;
grant select on public.payments, public.payment_allocations to authenticated;

-- Posted payments and counted allocations are frozen for everyone (R2).
create or replace function app.payments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_frozen boolean;
begin
  if tg_table_name = 'payments' then
    v_frozen := old.status = 'posted';
  else
    v_frozen := (select status from public.payments where id = old.payment_id) = 'posted'
                and (old.refund_id is null or (select status from public.payments where id = old.refund_id) = 'posted');
  end if;
  if v_frozen and app.ctx() <> 'post_payment' then
    raise exception 'Posted receipts and payments cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before update or delete on public.payments for each row execute function app.payments_guard();
create trigger guard before update or delete on public.payment_allocations for each row execute function app.payments_guard();

-- ── Open balances (F-15) ────────────────────────────────────────────────────────────────
create or replace function app.sales_open(p_id uuid, out open_fcy bigint, out open_aed bigint)
language sql stable security definer set search_path = '' as $$
  select i.gross_total_fcy - coalesce(cn.fcy, 0) - coalesce(al.fcy, 0), i.gross_total - coalesce(cn.aed, 0) - coalesce(al.aed, 0)
  from public.sales_invoices i
  left join lateral (select sum(c.gross_total_fcy) fcy, sum(c.gross_total) aed from public.sales_invoices c
                     where c.original_invoice_id = i.id and c.status = 'posted') cn on true
  left join lateral (select sum(a.amount_fcy) fcy, sum(a.amount) aed from public.payment_allocations a join public.payments p on p.id = a.payment_id
                     where a.sales_invoice_id = i.id and p.status = 'posted') al on true
  where i.id = p_id
$$;

create or replace function app.bill_open(p_id uuid, out open_fcy bigint, out open_aed bigint)
language sql stable security definer set search_path = '' as $$
  select b.payable_total_fcy - coalesce(dn.fcy, 0) - coalesce(al.fcy, 0), b.payable_total - coalesce(dn.aed, 0) - coalesce(al.aed, 0)
  from public.purchase_bills b
  left join lateral (select sum(d.payable_total_fcy) fcy, sum(d.payable_total) aed from public.purchase_bills d
                     where d.original_bill_id = b.id and d.status = 'posted') dn on true
  left join lateral (select sum(a.amount_fcy) fcy, sum(a.amount) aed from public.payment_allocations a join public.payments p on p.id = a.payment_id
                     where a.purchase_bill_id = b.id and p.status = 'posted') al on true
  where b.id = p_id
$$;

-- What is left of a payment's credit (receipt → Customer Credit, supplier payment → Supplier advance).
create or replace function app.credit_left(p_id uuid, out left_fcy bigint, out left_aed bigint)
language sql stable security definer set search_path = '' as $$
  select p.credit_fcy - coalesce(sum(a.amount_fcy), 0), p.credit_aed - coalesce(sum(a.credit_amount), 0)
  from public.payments p
  left join public.payment_allocations a on a.payment_id = p.id and a.credit_amount is not null
       and (a.refund_id is null or (select r.status from public.payments r where r.id = a.refund_id) = 'posted')
  where p.id = p_id and p.status = 'posted'
  group by p.credit_fcy, p.credit_aed
$$;
grant execute on function app.sales_open(uuid), app.bill_open(uuid), app.credit_left(uuid) to authenticated;

-- Open invoices and bills, for allocation and ageing by due date (ARAP-01). Reads through RLS.
create view public.open_documents with (security_invoker = true) as
  select 'sales_invoice'::text as doc_kind, i.id, i.organization_id, i.contact_id, i.invoice_no as doc_no, i.issue_date as doc_date, i.due_date,
         i.currency, i.gross_total_fcy as total_fcy, i.gross_total as total_aed, o.open_fcy, o.open_aed
  from public.sales_invoices i, lateral app.sales_open(i.id) o
  where i.status = 'posted' and i.doc_type = 'invoice' and o.open_fcy <> 0
  union all
  select 'purchase_bill', b.id, b.organization_id, b.contact_id, b.supplier_invoice_no, b.bill_date, b.due_date,
         b.currency, b.payable_total_fcy, b.payable_total, o.open_fcy, o.open_aed
  from public.purchase_bills b, lateral app.bill_open(b.id) o
  where b.status = 'posted' and b.doc_type = 'bill' and o.open_fcy <> 0;

-- Unused Customer Credits and Supplier advances, per payment.
create view public.credit_balances with (security_invoker = true) as
  select p.id as payment_id, p.organization_id, p.contact_id, p.kind, p.payment_no, p.payment_date, p.currency, c.left_fcy, c.left_aed
  from public.payments p, lateral app.credit_left(p.id) c
  where p.status = 'posted' and p.kind in ('customer_receipt', 'supplier_payment') and c.left_fcy > 0;
grant select on public.open_documents, public.credit_balances to authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────
-- Adds a journal line from a signed AED amount (+ debit, − credit); zero amounts are skipped.
create or replace function app.add_line(p_j uuid, p_org uuid, p_account uuid, p_amount bigint, p_contact uuid, p_desc text,
  p_currency text default 'AED', p_fx numeric default 1, p_fcy bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_amount = 0 then return; end if;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy, contact_id, description)
  values (p_j, p_org, coalesce((select max(line_no) from public.journal_lines where journal_id = p_j), 0) + 1, p_account,
          greatest(p_amount, 0), greatest(-p_amount, 0), p_currency, p_fx, p_fcy, p_contact, p_desc);
end $$;

create or replace function app.subtype_account(p_org uuid, p_subtype text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.accounts where organization_id = p_org and subtype = p_subtype and is_active order by code limit 1;
  if v is null then raise exception 'The chart of accounts needs an active % account', replace(p_subtype, '_', ' ') using errcode = 'check_violation'; end if;
  return v;
end $$;

create or replace function app.small_difference_limit(p_org uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((app.firm_setting((select firm_id from public.organizations where id = p_org), 'small_difference_limit') #>> '{}')::bigint, 100)
$$;

-- AED value of part of a document's / credit's open amount: the whole open AED when it is all of it (FX-03).
create or replace function app.aed_share(p_fcy bigint, p_open_fcy bigint, p_open_aed bigint, p_rate numeric) returns bigint
language sql immutable set search_path = '' as $$
  select case when p_fcy = p_open_fcy then p_open_aed else least(app.round_half_up(p_fcy * p_rate), p_open_aed) end
$$;

-- Posts a draft journal built by a document function (ctx juggling kept in one place).
create or replace function app.post_built_journal(p_j uuid, p_org uuid, p_date date, p_approver uuid, p_back_ctx text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_no text;
begin
  perform app.set_ctx('post_journal');
  v_no := app.next_document_number(p_org, 'journal', p_date);
  update public.journals set status = 'posted', approved_by = p_approver, posted_at = now(), journal_no = v_no where id = p_j;
  perform app.set_ctx(p_back_ctx);
  return v_no;
end $$;

-- ── Draft workflow ──────────────────────────────────────────────────────────────────────
-- p_doc: {kind, contact_id, bank_account_id, payment_date, currency?, amount, bank_charges?, reference?, notes?,
--         allocations?: [{document_id, amount}]} — amounts in minor units of the payment currency.
-- No allocations (null) = automatic, oldest first, at posting. Refunds always draw on credits oldest first.
create or replace function app.save_payment(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'prepare');
  v_kind public.payment_kind := (p_doc ->> 'kind')::public.payment_kind;
  v_customer boolean;
  v_contact public.contacts;
  v_bank public.accounts;
  v_date date := (p_doc ->> 'payment_date')::date;
  v_currency text := coalesce(nullif(p_doc ->> 'currency', ''), 'AED');
  v_amount bigint := (p_doc ->> 'amount')::bigint;
  v_charges bigint := coalesce((p_doc ->> 'bank_charges')::bigint, 0);
  v_auto boolean := jsonb_typeof(p_doc -> 'allocations') is distinct from 'array' or jsonb_array_length(p_doc -> 'allocations') = 0;
  v_id uuid := p_id;
  v_a jsonb;
  v_open bigint;
  v_doc_contact uuid; v_doc_currency text; v_doc_ok boolean;
begin
  if v_kind is null then raise exception 'Choose what kind of payment this is' using errcode = 'check_violation'; end if;
  if v_date is null then raise exception 'Enter the payment date' using errcode = 'check_violation'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = 'check_violation'; end if;
  if v_charges < 0 or v_charges >= v_amount then raise exception 'Bank charges must be less than the amount' using errcode = 'check_violation'; end if;
  v_customer := v_kind in ('customer_receipt', 'customer_refund');
  select * into v_contact from public.contacts where id = (p_doc ->> 'contact_id')::uuid and organization_id = p_organization_id;
  if v_contact.id is null then raise exception 'Choose a % of this client', case when v_customer then 'customer' else 'supplier' end using errcode = 'check_violation'; end if;
  if v_contact.kind = (case when v_customer then 'supplier' else 'customer' end)::public.contact_kind then
    raise exception '% is not set up as a %', v_contact.name, case when v_customer then 'customer' else 'supplier' end using errcode = 'check_violation';
  end if;
  select * into v_bank from public.accounts where id = (p_doc ->> 'bank_account_id')::uuid and organization_id = p_organization_id;
  if v_bank.id is null or v_bank.subtype not in ('bank', 'cash') or not v_bank.is_active then
    raise exception 'Choose an active bank or cash account' using errcode = 'check_violation';
  end if;
  perform app.fx_rate(v_currency, v_date);                                                   -- AED and USD only (FX-06)
  if v_kind in ('customer_refund', 'supplier_refund') then
    if not v_auto then raise exception 'Refunds draw on the contact''s credits automatically — do not choose documents' using errcode = 'check_violation'; end if;
    if v_amount > (select coalesce(sum(c.left_fcy), 0) from public.payments p, lateral app.credit_left(p.id) c
                   where p.contact_id = v_contact.id and p.currency = v_currency and p.status = 'posted'
                     and p.kind = case when v_customer then 'customer_receipt' else 'supplier_payment' end::public.payment_kind) then
      raise exception 'The refund is more than the % available', case when v_customer then 'customer credit' else 'supplier advance' end using errcode = 'check_violation'; -- ARAP-11
    end if;
  end if;

  perform app.set_ctx('save_payment');
  if v_id is null then
    insert into public.payments (organization_id, kind, contact_id, bank_account_id, payment_date, currency, fx_rate, amount_fcy, bank_charges_fcy,
           auto_allocate, reference, notes, prepared_by)
    values (p_organization_id, v_kind, v_contact.id, v_bank.id, v_date, v_currency, app.fx_rate(v_currency, v_date), v_amount, v_charges,
            v_auto, nullif(btrim(p_doc ->> 'reference'), ''), nullif(btrim(p_doc ->> 'notes'), ''), v_uid)
    returning id into v_id;
  else
    update public.payments set kind = v_kind, contact_id = v_contact.id, bank_account_id = v_bank.id, payment_date = v_date, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_date), amount_fcy = v_amount, bank_charges_fcy = v_charges, auto_allocate = v_auto,
           reference = nullif(btrim(p_doc ->> 'reference'), ''), notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Payment not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.payment_allocations where payment_id = v_id;
  end if;

  if not v_auto and v_kind in ('customer_receipt', 'supplier_payment') then
    for v_a in select * from jsonb_array_elements(p_doc -> 'allocations') loop
      v_doc_contact := null; v_doc_currency := null; v_doc_ok := null; v_open := null;
      if v_kind = 'customer_receipt' then
        select contact_id, currency, status = 'posted' and doc_type = 'invoice', (app.sales_open(id)).open_fcy
          into v_doc_contact, v_doc_currency, v_doc_ok, v_open from public.sales_invoices where id = (v_a ->> 'document_id')::uuid and organization_id = p_organization_id;
      else
        select contact_id, currency, status = 'posted' and doc_type = 'bill', (app.bill_open(id)).open_fcy
          into v_doc_contact, v_doc_currency, v_doc_ok, v_open from public.purchase_bills where id = (v_a ->> 'document_id')::uuid and organization_id = p_organization_id;
      end if;
      if v_doc_ok is not true or v_doc_contact <> v_contact.id then
        raise exception 'Allocations must be to posted % of %', case when v_customer then 'invoices' else 'bills' end, v_contact.name using errcode = 'check_violation';
      end if;
      if v_doc_currency <> v_currency then raise exception 'A % payment can only settle % documents', v_currency, v_currency using errcode = 'check_violation'; end if;
      if (v_a ->> 'amount')::bigint > v_open then
        raise exception 'An allocation is more than the open balance of the document (%)', v_open / 100.0 using errcode = 'check_violation';   -- DM-05
      end if;
      insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, purchase_bill_id, amount_fcy, amount, applied_on)
      values (p_organization_id, v_id,
              case when v_customer then (v_a ->> 'document_id')::uuid end, case when not v_customer then (v_a ->> 'document_id')::uuid end,
              (v_a ->> 'amount')::bigint, (v_a ->> 'amount')::bigint, v_date);                     -- AED re-valued at posting
    end loop;
  end if;
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.submit_payment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'prepare');
  if p.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode = 'check_violation'; end if;
  perform app.set_ctx('submit_payment');
  update public.payments set status = 'pending' where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.reject_payment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'approve_document');
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required to send it back' using errcode = 'check_violation'; end if;
  if p.status <> 'pending' then raise exception 'Only payments waiting for approval can be sent back' using errcode = 'check_violation'; end if;
  perform app.set_ctx('reject_payment');
  perform set_config('app.reason', p_reason, true);
  update public.payments set status = 'draft' where id = p_id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

create or replace function app.delete_payment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'prepare');
  if p.status = 'posted' then raise exception 'Posted receipts and payments cannot be deleted' using errcode = 'insufficient_privilege'; end if;
  perform app.set_ctx('delete_payment');
  delete from public.payments where id = p_id;
  perform app.set_ctx(null);
end $$;

-- ── Posting ─────────────────────────────────────────────────────────────────────────────
create or replace function app.post_payment(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_uid uuid;
  v_customer boolean; v_in boolean; v_refund boolean;
  v_sign int;                         -- +1 money in, −1 money out
  v_limit bigint;
  v_cash_left bigint;
  v_take bigint;
  r record;
  v_alloc_fcy bigint := 0; v_alloc_aed bigint := 0;
  v_diff bigint;
  v_j uuid; v_no text;
  v_side uuid;                        -- receivables / payables / credits account touched by the allocations
  v_credit_acc uuid;
  v_total bigint;
  v_name text;
  v_last uuid;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(p.organization_id, 'approve_document');
  if p.status not in ('draft', 'pending') then raise exception 'Already %', p.status using errcode = 'check_violation'; end if;
  if p.prepared_by = v_uid then
    raise exception 'You prepared this, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;
  v_customer := p.kind in ('customer_receipt', 'customer_refund');
  v_in := p.kind in ('customer_receipt', 'supplier_refund');
  v_refund := p.kind in ('customer_refund', 'supplier_refund');
  v_sign := case when v_in then 1 else -1 end;
  v_limit := app.small_difference_limit(p.organization_id);
  select name into v_name from public.contacts where id = p.contact_id;

  perform app.set_ctx('post_payment');
  update public.payments set fx_rate = app.fx_rate(currency, payment_date) where id = p_id;
  select * into p from public.payments where id = p_id;

  -- 1. Allocations: automatic oldest first (ARAP-09), or the preparer's choice re-checked (DM-05).
  if v_refund then
    v_cash_left := p.amount_fcy;
    for r in select s.id, c.left_fcy, c.left_aed, s.fx_rate from public.payments s, lateral app.credit_left(s.id) c
             where s.contact_id = p.contact_id and s.currency = p.currency and s.status = 'posted' and c.left_fcy > 0
               and s.kind = case when v_customer then 'customer_receipt' else 'supplier_payment' end::public.payment_kind
             order by s.payment_date, s.posted_at loop
      exit when v_cash_left = 0;
      v_take := least(v_cash_left, r.left_fcy);
      insert into public.payment_allocations (organization_id, payment_id, refund_id, amount_fcy, amount, credit_amount, applied_on)
      values (p.organization_id, r.id, p.id, v_take, app.aed_share(v_take, r.left_fcy, r.left_aed, r.fx_rate),
              app.aed_share(v_take, r.left_fcy, r.left_aed, r.fx_rate), p.payment_date);
      v_cash_left := v_cash_left - v_take;
    end loop;
    if v_cash_left > 0 then
      raise exception 'The refund is more than the % available', case when v_customer then 'customer credit' else 'supplier advance' end using errcode = 'check_violation'; -- ARAP-11
    end if;
  else
    if p.auto_allocate then
      delete from public.payment_allocations where payment_id = p_id;
      v_cash_left := p.amount_fcy;
      for r in select d.id, d.open_fcy, d.open_aed from public.open_documents d
               where d.contact_id = p.contact_id and d.currency = p.currency and d.open_fcy > 0
                 and d.doc_kind = case when v_customer then 'sales_invoice' else 'purchase_bill' end
               order by d.doc_date, d.doc_no loop
        exit when v_cash_left = 0;
        v_take := least(v_cash_left, r.open_fcy);
        v_cash_left := v_cash_left - v_take;
        -- D-34: a small amount left on the last document is settled too (written off)
        if v_cash_left = 0 and r.open_fcy - v_take > 0 and app.round_half_up((r.open_fcy - v_take) * p.fx_rate) <= v_limit then
          v_take := r.open_fcy;
        end if;
        insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, purchase_bill_id, amount_fcy, amount, applied_on)
        values (p.organization_id, p.id, case when v_customer then r.id end, case when not v_customer then r.id end, v_take, v_take, p.payment_date);
      end loop;
    end if;
    -- Value every allocation in AED on the document side; re-check open balances (DM-05).
    for r in select a.id, a.amount_fcy, coalesce(a.sales_invoice_id, a.purchase_bill_id) doc_id from public.payment_allocations a where a.payment_id = p_id loop
      declare o_fcy bigint; o_aed bigint; d_rate numeric; d_contact uuid; d_currency text;
      begin
        if v_customer then
          select (app.sales_open(id)).open_fcy, (app.sales_open(id)).open_aed, fx_rate, contact_id, currency into o_fcy, o_aed, d_rate, d_contact, d_currency
            from public.sales_invoices where id = r.doc_id;
        else
          select (app.bill_open(id)).open_fcy, (app.bill_open(id)).open_aed, fx_rate, contact_id, currency into o_fcy, o_aed, d_rate, d_contact, d_currency
            from public.purchase_bills where id = r.doc_id;
        end if;
        if d_contact <> p.contact_id or d_currency <> p.currency then
          raise exception 'Allocations must be to documents of the same contact and currency' using errcode = 'check_violation';
        end if;
        if r.amount_fcy > o_fcy then
          raise exception 'An allocation is more than the open balance of the document (%)', o_fcy / 100.0 using errcode = 'check_violation';  -- DM-05
        end if;
        update public.payment_allocations set amount = app.aed_share(r.amount_fcy, o_fcy, o_aed, d_rate), applied_on = p.payment_date where id = r.id;
      end;
    end loop;
  end if;
  select coalesce(sum(amount_fcy), 0), coalesce(sum(case when v_refund then credit_amount else amount end), 0) into v_alloc_fcy, v_alloc_aed
    from public.payment_allocations where (case when v_refund then refund_id else payment_id end) = p_id;

  -- 2. Differences (D-34) and what is left as a credit / advance (D-11, D-36).
  v_diff := v_alloc_fcy - p.amount_fcy;                       -- + documents beyond the cash, − cash beyond the documents
  if v_refund or v_diff = 0 then
    v_diff := 0;
  elsif v_diff > 0 then
    if app.round_half_up(v_diff * p.fx_rate) > v_limit then
      raise exception 'The allocations are % more than the amount — reduce them, or record a credit note', v_diff / 100.0 using errcode = 'check_violation';
    end if;
  elsif v_alloc_fcy > 0 and app.round_half_up(-v_diff * p.fx_rate) <= v_limit then
    null;                                                     -- small excess written off
  else
    v_diff := 0;                                              -- bigger excess (or nothing allocated) stays as a credit
  end if;
  update public.payments set
    amount = app.round_half_up(amount_fcy * fx_rate),
    bank_charges = app.round_half_up(bank_charges_fcy * fx_rate),
    writeoff_fcy = v_diff,
    writeoff = case when v_diff >= 0 then app.round_half_up(v_diff * fx_rate) else -app.round_half_up(-v_diff * fx_rate) end,
    credit_fcy = case when v_refund then 0 else amount_fcy + v_diff - v_alloc_fcy end,
    credit_aed = case when v_refund then 0 else app.round_half_up((amount_fcy + v_diff - v_alloc_fcy) * fx_rate) end
  where id = p_id;
  select * into p from public.payments where id = p_id;

  -- 3. Journal (source receipt/payment, dated on the payment date).
  v_side := case when v_refund then app.subtype_account(p.organization_id, case when v_customer then 'customer_credits' else 'supplier_advances' end)
                 else app.subtype_account(p.organization_id, case when v_customer then 'receivable' else 'payable' end) end;
  v_credit_acc := app.subtype_account(p.organization_id, case when v_customer then 'customer_credits' else 'supplier_advances' end);
  insert into public.journals (organization_id, entry_date, source, source_id, memo, contact_id, prepared_by)
  values (p.organization_id, p.payment_date, case when v_in then 'receipt' else 'payment' end::public.journal_source, p.id,
          initcap(replace(p.kind::text, '_', ' ')) || ' · ' || v_name || coalesce(' · ' || p.reference, ''), p.contact_id, p.prepared_by)
  returning id into v_j;

  -- Bank: in = amount − charges; out = amount + charges.
  perform app.add_line(v_j, p.organization_id, p.bank_account_id, v_sign * (p.amount - v_sign * p.bank_charges), p.contact_id,
                       coalesce(p.reference, initcap(replace(p.kind::text, '_', ' '))), p.currency, p.fx_rate,
                       case when p.currency = 'AED' then null else p.amount_fcy - v_sign * p.bank_charges_fcy end);
  perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'bank_charges'), p.bank_charges, p.contact_id, 'Bank charges');
  if p.writeoff <> 0 then
    perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'rounding'), v_sign * p.writeoff, p.contact_id, 'Small difference written off (D-34)');
  end if;
  -- Documents settled (receipts credit receivables, payments debit payables) or credits paid out (refunds).
  if v_refund then
    perform app.add_line(v_j, p.organization_id, v_side, -v_sign * v_alloc_aed, p.contact_id,
                         case when v_customer then 'Customer credit refunded' else 'Supplier advance refunded' end);
  else
    for r in select a.amount, coalesce(i.invoice_no, b.supplier_invoice_no) no from public.payment_allocations a
             left join public.sales_invoices i on i.id = a.sales_invoice_id left join public.purchase_bills b on b.id = a.purchase_bill_id
             where a.payment_id = p_id order by a.created_at, a.id loop
      perform app.add_line(v_j, p.organization_id, v_side, -v_sign * r.amount, p.contact_id, r.no);
    end loop;
    perform app.add_line(v_j, p.organization_id, v_credit_acc, -v_sign * p.credit_aed, p.contact_id,
                         case when v_customer then 'Customer credit (D-11)' else 'Supplier advance (D-36)' end);
  end if;
  -- D-37: whatever remains is the realised exchange difference (+ = loss).
  select coalesce(sum(debit) - sum(credit), 0) into v_total from public.journal_lines where journal_id = v_j;
  if v_total <> 0 then
    perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, case when v_total > 0 then 'fx_gain' else 'fx_loss' end),
                         -v_total, p.contact_id, 'Exchange difference (D-37)');
  end if;
  v_no := app.next_document_number(p.organization_id, case when v_in then 'receipt' else 'payment' end::public.doc_type, p.payment_date);
  perform app.post_built_journal(v_j, p.organization_id, p.payment_date, v_uid, 'post_payment');
  update public.payments set status = 'posted', payment_no = v_no, journal_id = v_j, approved_by = v_uid, posted_at = now(), fx_difference = v_total
   where id = p_id;
  perform app.set_ctx(null);
  return v_no;
end $$;

-- ── Automatic application of credits to a newly posted invoice / bill (D-11, D-36 · ARAP-08/09) ─
create or replace function app.apply_credits(p_kind text, p_doc_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_customer boolean := p_kind = 'sales_invoice';
  v_org uuid; v_contact uuid; v_currency text; v_date date; v_no text; v_rate numeric; v_prep uuid; v_appr uuid;
  v_open_fcy bigint; v_open_aed bigint;
  v_prev_ctx text := app.ctx();
  v_prev_reason text := coalesce(current_setting('app.reason', true), '');
  r record;
  v_take bigint; v_doc_aed bigint; v_credit_aed bigint;
  v_j uuid;
  v_side uuid; v_credit_acc uuid;
  v_total bigint;
begin
  if v_customer then
    select organization_id, contact_id, currency, issue_date, invoice_no, fx_rate, prepared_by, approved_by
      into v_org, v_contact, v_currency, v_date, v_no, v_rate, v_prep, v_appr from public.sales_invoices where id = p_doc_id;
    select open_fcy, open_aed into v_open_fcy, v_open_aed from app.sales_open(p_doc_id);
  else
    select organization_id, contact_id, currency, bill_date, supplier_invoice_no, fx_rate, prepared_by, approved_by
      into v_org, v_contact, v_currency, v_date, v_no, v_rate, v_prep, v_appr from public.purchase_bills where id = p_doc_id;
    select open_fcy, open_aed into v_open_fcy, v_open_aed from app.bill_open(p_doc_id);
  end if;
  if coalesce((app.firm_setting((select firm_id from public.organizations where id = v_org),
               case when v_customer then 'auto_apply_customer_credits' else 'auto_apply_supplier_advances' end) #>> '{}')::boolean, true) is not true then
    return;
  end if;
  v_side := app.subtype_account(v_org, case when v_customer then 'receivable' else 'payable' end);
  perform set_config('app.reason', case when v_customer then 'Customer credit applied automatically (D-11)' else 'Supplier advance applied automatically (D-36)' end, true);

  for r in select s.id, s.payment_no, s.payment_date, s.fx_rate, c.left_fcy, c.left_aed from public.payments s, lateral app.credit_left(s.id) c
           where s.contact_id = v_contact and s.currency = v_currency and s.status = 'posted' and c.left_fcy > 0
             and s.kind = case when v_customer then 'customer_receipt' else 'supplier_payment' end::public.payment_kind
           order by s.payment_date, s.posted_at loop
    exit when v_open_fcy <= 0;
    if v_credit_acc is null then
      v_credit_acc := app.subtype_account(v_org, case when v_customer then 'customer_credits' else 'supplier_advances' end);
    end if;
    v_take := least(r.left_fcy, v_open_fcy);
    v_doc_aed := app.aed_share(v_take, v_open_fcy, v_open_aed, v_rate);
    v_credit_aed := app.aed_share(v_take, r.left_fcy, r.left_aed, r.fx_rate);

    perform app.set_ctx('apply_credits');
    insert into public.journals (organization_id, entry_date, source, source_id, memo, contact_id, prepared_by)
    values (v_org, greatest(v_date, r.payment_date), case when v_customer then 'receipt' else 'payment' end::public.journal_source, r.id,
            case when v_customer then 'Customer credit ' else 'Supplier advance ' end || r.payment_no || ' applied to ' || v_no, v_contact, v_prep)
    returning id into v_j;
    if v_customer then
      perform app.add_line(v_j, v_org, v_credit_acc, v_credit_aed, v_contact, 'Customer credit ' || r.payment_no);
      perform app.add_line(v_j, v_org, v_side, -v_doc_aed, v_contact, v_no);
    else
      perform app.add_line(v_j, v_org, v_side, v_doc_aed, v_contact, v_no);
      perform app.add_line(v_j, v_org, v_credit_acc, -v_credit_aed, v_contact, 'Supplier advance ' || r.payment_no);
    end if;
    select coalesce(sum(debit) - sum(credit), 0) into v_total from public.journal_lines where journal_id = v_j;
    if v_total <> 0 then
      perform app.add_line(v_j, v_org, app.subtype_account(v_org, case when v_total > 0 then 'fx_gain' else 'fx_loss' end), -v_total, v_contact, 'Exchange difference (D-37)');
    end if;
    perform app.post_built_journal(v_j, v_org, greatest(v_date, r.payment_date), v_appr, 'apply_credits');
    insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, purchase_bill_id, amount_fcy, amount, credit_amount, applied_on, journal_id)
    values (v_org, r.id, case when v_customer then p_doc_id end, case when not v_customer then p_doc_id end,
            v_take, v_doc_aed, v_credit_aed, greatest(v_date, r.payment_date), v_j);
    v_open_fcy := v_open_fcy - v_take;
    v_open_aed := v_open_aed - v_doc_aed;
  end loop;
  perform app.set_ctx(v_prev_ctx);
  perform set_config('app.reason', v_prev_reason, true);
end $$;

create or replace function app.apply_credits_on_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'posted' and old.status <> 'posted' then
    perform app.apply_credits(case when tg_table_name = 'sales_invoices' then 'sales_invoice' else 'purchase_bill' end, new.id);
  end if;
  return null;
end $$;
create trigger apply_credits after update of status on public.sales_invoices
  for each row when (new.doc_type = 'invoice') execute function app.apply_credits_on_post();
create trigger apply_credits after update of status on public.purchase_bills
  for each row when (new.doc_type = 'bill') execute function app.apply_credits_on_post();

-- ── API ─────────────────────────────────────────────────────────────────────────────────
grant execute on function app.save_payment(uuid, uuid, jsonb), app.submit_payment(uuid), app.reject_payment(uuid, text),
  app.delete_payment(uuid), app.post_payment(uuid) to authenticated;
create function public.save_payment(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app.save_payment(p_id, p_organization_id, p_doc) $$;
create function public.submit_payment(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.submit_payment(p_id) $$;
create function public.reject_payment(p_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reject_payment(p_id, p_reason) $$;
create function public.delete_payment(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_payment(p_id) $$;
create function public.post_payment(p_id uuid) returns text
language sql security invoker set search_path = '' as $$ select app.post_payment(p_id) $$;
revoke all on function public.save_payment(uuid, uuid, jsonb), public.submit_payment(uuid), public.reject_payment(uuid, text),
  public.delete_payment(uuid), public.post_payment(uuid) from public, anon;
grant execute on function public.save_payment(uuid, uuid, jsonb), public.submit_payment(uuid), public.reject_payment(uuid, text),
  public.delete_payment(uuid), public.post_payment(uuid) to authenticated;
