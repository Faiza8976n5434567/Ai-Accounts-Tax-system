-- P2-03 · Purchase bills and debit notes, compliance checks, risk score and attachments
-- (Spec 01 §4.7 · Spec 03 F-07, F-17 · D-31, D-32, D-33 · VAT-05/06/07/08 · ARAP-06 · DM-08).
--   • Lines are calculated like sales (D-33): quantity × price half-up; USD → AED first; VAT per line
--     at the rate in force on the bill date (D-31: the supplier's invoice date is the tax date).
--   • Checks (Exec. Reg. Art 59 + red flags) are stored per bill with a risk score (F-17, weights from
--     firm settings). Input VAT is automatically not recovered when the TRN is missing/invalid, an
--     unregistered supplier charges VAT, or the 'Tax Invoice' heading is missing — unless the approver
--     overrides with a reason (D-32). Blocked lines (BLK) are never recoverable.
--   • Posting: Dr expense/asset (net, plus VAT when not recoverable) / Dr VAT input (recoverable VAT) /
--     reverse charge Dr 1310 & Cr 2110 / Cr Payables. Debit notes post the other way and are capped
--     at what is left on the bill.

create type public.purchase_doc_type as enum ('bill', 'debit_note');
create type public.risk_level as enum ('low', 'medium', 'high');
create type public.check_severity as enum ('error', 'warn', 'info');

create table public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doc_type public.purchase_doc_type not null default 'bill',
  supplier_invoice_no text not null check (btrim(supplier_invoice_no) <> ''),
  original_bill_id uuid,
  contact_id uuid not null,
  bill_date date not null,
  due_date date not null,
  currency char(3) not null default 'AED' references public.currencies (code) on delete restrict,
  fx_rate numeric(12, 6) not null default 1 check (fx_rate > 0),
  supplier_trn_on_invoice public.trn,
  has_tax_invoice_heading boolean not null default true,
  is_foreign_supplier boolean not null default false,
  notes text,
  status public.document_status not null default 'draft',
  journal_id uuid unique,
  net_total bigint not null default 0 check (net_total >= 0),             -- AED fils
  vat_total bigint not null default 0 check (vat_total >= 0),
  recoverable_vat bigint not null default 0 check (recoverable_vat >= 0),
  payable_total bigint not null default 0 check (payable_total >= 0),     -- what is owed to the supplier (AED)
  payable_total_fcy bigint not null default 0 check (payable_total_fcy >= 0),
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  risk_level public.risk_level not null default 'low',
  vat_recoverable_by_checks boolean not null default true,
  vat_override_reason text,                                               -- D-32: approver's reason to recover anyway
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  unique (id, organization_id),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete restrict,
  foreign key (original_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete restrict,
  foreign key (journal_id, organization_id) references public.journals (id, organization_id) on delete restrict,
  check (approved_by <> prepared_by),
  check ((doc_type = 'debit_note') = (original_bill_id is not null)),
  check ((status = 'posted') = (journal_id is not null and posted_at is not null)),
  check (due_date >= bill_date),
  check (currency <> 'AED' or fx_rate = 1)
);
select app.setup_table('public.purchase_bills');
-- ARAP-06: the same supplier invoice number cannot be entered twice for a supplier
create unique index purchase_bills_no_duplicates on public.purchase_bills (organization_id, contact_id, doc_type, lower(btrim(supplier_invoice_no)));
create index purchase_bills_contact_idx on public.purchase_bills (contact_id, organization_id);
create index purchase_bills_original_idx on public.purchase_bills (original_bill_id, organization_id);
create index purchase_bills_journal_idx on public.purchase_bills (journal_id, organization_id);
create index purchase_bills_prepared_by_idx on public.purchase_bills (prepared_by);
create index purchase_bills_approved_by_idx on public.purchase_bills (approved_by);
create index purchase_bills_currency_idx on public.purchase_bills (currency);
create index purchase_bills_org_date_idx on public.purchase_bills (organization_id, bill_date);

create table public.purchase_bill_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_bill_id uuid not null,
  organization_id uuid not null,
  line_no smallint not null check (line_no > 0),
  description text not null check (btrim(description) <> ''),
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price bigint not null check (unit_price > 0),
  account_id uuid not null,
  tax_code text not null references public.tax_codes (code) on delete restrict,
  net_fcy bigint not null default 0 check (net_fcy >= 0),
  vat_fcy bigint not null default 0 check (vat_fcy >= 0),
  net bigint not null default 0 check (net >= 0),
  vat bigint not null default 0 check (vat >= 0),
  recoverable_vat bigint not null default 0 check (recoverable_vat >= 0),
  unique (purchase_bill_id, line_no),
  foreign key (purchase_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  check (tax_code in ('SR', 'ZR', 'EX', 'OS', 'RCS', 'BLK'))
);
select app.setup_table('public.purchase_bill_lines');
create index purchase_bill_lines_bill_idx on public.purchase_bill_lines (purchase_bill_id, organization_id);
create index purchase_bill_lines_account_idx on public.purchase_bill_lines (account_id, organization_id);
create index purchase_bill_lines_tax_code_idx on public.purchase_bill_lines (tax_code);

create table public.bill_checks (
  id uuid primary key default gen_random_uuid(),
  purchase_bill_id uuid not null,
  organization_id uuid not null,
  check_code text not null,
  label text not null,
  passed boolean not null,
  severity public.check_severity not null,
  detail text,
  unique (purchase_bill_id, check_code),
  foreign key (purchase_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete cascade
);
select app.setup_table('public.bill_checks', false);
create index bill_checks_bill_idx on public.bill_checks (purchase_bill_id, organization_id);

-- Attachments (private storage: documents/{organization_id}/…). DM-08: the same file once per client.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'text/csv',
                                               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),          -- S-2.5: ≤ 10 MB
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  purchase_bill_id uuid,
  sales_invoice_id uuid,
  uploaded_by uuid references public.profiles (id) on delete restrict,
  unique (organization_id, sha256),
  foreign key (purchase_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete restrict,
  foreign key (sales_invoice_id, organization_id) references public.sales_invoices (id, organization_id) on delete restrict,
  check (num_nonnulls(purchase_bill_id, sales_invoice_id) = 1),
  check (split_part(storage_path, '/', 1) = organization_id::text)
);
select app.setup_table('public.attachments');
create index attachments_bill_idx on public.attachments (purchase_bill_id, organization_id);
create index attachments_invoice_idx on public.attachments (sales_invoice_id, organization_id);
create index attachments_uploaded_by_idx on public.attachments (uploaded_by);

create or replace function app.attachments_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.uploaded_by := coalesce((select auth.uid()), new.uploaded_by);
  return new;
end $$;
create trigger defaults before insert on public.attachments for each row execute function app.attachments_defaults();

do $$
declare t text;
begin
  foreach t in array array['purchase_bills', 'purchase_bill_lines', 'bill_checks', 'attachments'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
  end loop;
end $$;
create policy ins on public.attachments for insert to authenticated with check (organization_id in (select app.orgs_with('upload')));
grant select on public.purchase_bills, public.purchase_bill_lines, public.bill_checks, public.attachments to authenticated;
grant insert (id, organization_id, storage_path, file_name, mime_type, size_bytes, sha256, purchase_bill_id, sales_invoice_id) on public.attachments to authenticated;

-- Posted bills are frozen for everyone (R2); checks are only rewritten by the functions.
create or replace function app.purchase_bills_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.document_status;
begin
  if tg_table_name = 'purchase_bills' then
    v_status := old.status;
  else
    select status into v_status from public.purchase_bills where id = old.purchase_bill_id;
  end if;
  if v_status = 'posted' and app.ctx() <> 'post_purchase_bill' then
    raise exception 'Posted bills cannot be changed — record a debit note instead' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger guard before update or delete on public.purchase_bills for each row execute function app.purchase_bills_guard();
create trigger guard before update or delete on public.purchase_bill_lines for each row execute function app.purchase_bills_guard();
create trigger guard before update or delete on public.bill_checks for each row execute function app.purchase_bills_guard();

-- ── Calculation, checks and risk (F-07, F-17, D-32, D-33) ───────────────────────────────
-- Recalculates lines and totals, re-runs every check, and sets recoverable VAT and the risk score.
create or replace function app.review_purchase_bill(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.purchase_bills;
  c public.contacts;
  v_trn text;
  v_charges_vat boolean;
  v_recoverable boolean;
  v_weights jsonb; v_thresholds jsonb;
  v_score int := 0;
  v_firm uuid;
  v_dup text;
begin
  select * into b from public.purchase_bills where id = p_id;
  select * into c from public.contacts where id = b.contact_id;
  v_firm := (select firm_id from public.organizations where id = b.organization_id);

  update public.purchase_bill_lines l set net_fcy = a.net_fcy, vat_fcy = a.vat_fcy, net = a.net, vat = a.vat
    from public.purchase_bill_lines l2,
         lateral app.sales_line_amounts(l2.quantity, l2.unit_price, l2.tax_code, b.currency, b.fx_rate, b.bill_date) a
   where l.id = l2.id and l.purchase_bill_id = p_id;

  v_trn := coalesce(b.supplier_trn_on_invoice, c.trn);
  v_charges_vat := exists (select 1 from public.purchase_bill_lines where purchase_bill_id = p_id and tax_code in ('SR', 'BLK') and vat > 0);

  delete from public.bill_checks where purchase_bill_id = p_id;
  insert into public.bill_checks (purchase_bill_id, organization_id, check_code, label, passed, severity, detail)
  select p_id, b.organization_id, x.code, x.label, x.passed, x.severity::public.check_severity, x.detail
  from (values
    ('heading', '''Tax Invoice'' heading present (Art 59)',
       b.doc_type = 'debit_note' or b.is_foreign_supplier or not v_charges_vat or b.has_tax_invoice_heading, 'error',
       case when b.doc_type = 'bill' and not b.has_tax_invoice_heading and v_charges_vat and not b.is_foreign_supplier
            then 'Without a tax invoice the input VAT is not recoverable' end),
    ('unregistered', 'VAT charged only by a VAT-registered supplier (valid TRN)', b.is_foreign_supplier or not v_charges_vat or v_trn is not null, 'error',
       case when v_trn is null and v_charges_vat and not b.is_foreign_supplier
            then 'No supplier TRN — possibly an invalid VAT charge, input VAT not recoverable' end),
    ('trn_match', 'TRN on the invoice matches the supplier record',
       b.supplier_trn_on_invoice is null or c.trn is null or b.supplier_trn_on_invoice = c.trn, 'warn',
       case when b.supplier_trn_on_invoice <> c.trn then 'Invoice shows ' || b.supplier_trn_on_invoice || ', supplier record has ' || c.trn end),
    ('reverse_charge', 'Foreign supplier billed under reverse charge (Art 48)',
       not b.is_foreign_supplier or not exists (select 1 from public.purchase_bill_lines where purchase_bill_id = p_id and tax_code = 'SR'), 'warn',
       case when b.is_foreign_supplier and exists (select 1 from public.purchase_bill_lines where purchase_bill_id = p_id and tax_code = 'SR')
            then 'Use Reverse charge (RCS) for services/goods from a supplier outside the UAE' end),
    ('weekend', 'Not dated on a weekend', extract(isodow from b.bill_date) not in (6, 7), 'warn', null),
    ('round_sum', 'Not a suspiciously round amount', not ((select coalesce(sum(net), 0) from public.purchase_bill_lines where purchase_bill_id = p_id) >= 1000000
                                                         and (select coalesce(sum(net), 0) from public.purchase_bill_lines where purchase_bill_id = p_id) % 100000 = 0), 'warn', null),
    ('stale', 'Invoice not older than 12 months', b.bill_date > current_date - 365, 'warn', null)
  ) as x(code, label, passed, severity, detail);

  -- Possible duplicate under a different number: same supplier, date and amount.
  select string_agg(o.supplier_invoice_no, ', ') into v_dup
  from public.purchase_bills o
  where o.organization_id = b.organization_id and o.contact_id = b.contact_id and o.id <> b.id and o.doc_type = b.doc_type
    and o.bill_date = b.bill_date and o.net_total = (select coalesce(sum(net), 0) from public.purchase_bill_lines where purchase_bill_id = p_id);
  insert into public.bill_checks (purchase_bill_id, organization_id, check_code, label, passed, severity, detail)
  values (p_id, b.organization_id, 'duplicate', 'Not a duplicate of another bill', v_dup is null, 'error',
          case when v_dup is not null then 'Same supplier, date and amount as ' || v_dup end);

  -- D-32: recoverability follows the TRN/heading checks; BLK is never recoverable.
  -- A debit note follows its bill: VAT that was not recovered is not reversed out of input VAT either.
  if b.doc_type = 'debit_note' then
    select o.vat_recoverable_by_checks or o.vat_override_reason is not null into v_recoverable
      from public.purchase_bills o where o.id = b.original_bill_id;
  else
    v_recoverable := not exists (select 1 from public.bill_checks where purchase_bill_id = p_id and check_code in ('heading', 'unregistered') and not passed);
  end if;
  update public.purchase_bill_lines set recoverable_vat =
    case when tax_code = 'RCS' then vat
         when tax_code = 'SR' and (v_recoverable or (b.doc_type = 'bill' and b.vat_override_reason is not null)) then vat
         else 0 end
   where purchase_bill_id = p_id;

  -- F-17: risk score from the firm's weights (error 22, duplicate/unregistered 45, warning 10)
  v_weights := coalesce(app.firm_setting(v_firm, 'risk_weights'), '{"error":22,"duplicate":45,"unregistered":45,"warning":10}');
  v_thresholds := coalesce(app.firm_setting(v_firm, 'risk_thresholds'), '{"medium":15,"high":45}');
  select coalesce(sum(case when check_code in ('duplicate', 'unregistered') then (v_weights ->> check_code)::int
                           when severity = 'error' then (v_weights ->> 'error')::int
                           when severity = 'warn' then (v_weights ->> 'warning')::int else 0 end), 0)
    into v_score from public.bill_checks where purchase_bill_id = p_id and not passed;
  v_score := least(v_score, 100);

  update public.purchase_bills p set
    net_total = t.net, vat_total = t.vat, recoverable_vat = t.rec,
    payable_total = t.net + t.vat_charged, payable_total_fcy = t.net_fcy + t.vat_charged_fcy,
    vat_recoverable_by_checks = v_recoverable,
    risk_score = v_score,
    risk_level = case when v_score >= (v_thresholds ->> 'high')::int then 'high'
                      when v_score >= (v_thresholds ->> 'medium')::int then 'medium' else 'low' end::public.risk_level
  from (select coalesce(sum(net), 0) net, coalesce(sum(vat), 0) vat, coalesce(sum(recoverable_vat), 0) rec,
               coalesce(sum(net_fcy), 0) net_fcy,
               coalesce(sum(vat) filter (where tax_code <> 'RCS'), 0) vat_charged,          -- reverse charge VAT is not paid to the supplier
               coalesce(sum(vat_fcy) filter (where tax_code <> 'RCS'), 0) vat_charged_fcy
        from public.purchase_bill_lines where purchase_bill_id = p_id) t
  where p.id = p_id;
end $$;

-- ── Workflow ────────────────────────────────────────────────────────────────────────────
-- p_doc: {doc_type, contact_id, supplier_invoice_no, bill_date, due_date?, currency?, original_bill_id?,
-- supplier_trn_on_invoice?, has_tax_invoice_heading?, notes?, lines: [{description, quantity, unit_price, account_id, tax_code}]}
create or replace function app.save_purchase_bill(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'prepare');
  v_type public.purchase_doc_type := coalesce(p_doc ->> 'doc_type', 'bill')::public.purchase_doc_type;
  v_contact public.contacts;
  v_orig public.purchase_bills;
  v_date date := (p_doc ->> 'bill_date')::date;
  v_currency text := coalesce(nullif(p_doc ->> 'currency', ''), 'AED');
  v_id uuid := p_id;
  v_line jsonb;
  v_acc public.accounts;
  v_n int := 0;
begin
  if v_date is null then raise exception 'Enter the bill date (the supplier''s invoice date)' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_doc ->> 'supplier_invoice_no'), '') is null then raise exception 'Enter the supplier''s invoice number' using errcode = 'check_violation'; end if;
  select * into v_contact from public.contacts where id = (p_doc ->> 'contact_id')::uuid and organization_id = p_organization_id;
  if v_contact.id is null then raise exception 'Choose a supplier of this client' using errcode = 'check_violation'; end if;
  if v_contact.kind = 'customer' then raise exception '% is set up as a customer only — make it a supplier first', v_contact.name using errcode = 'check_violation'; end if;
  if not v_contact.is_active then raise exception '% is inactive', v_contact.name using errcode = 'check_violation'; end if;
  if v_type = 'debit_note' then
    select * into v_orig from public.purchase_bills where id = (p_doc ->> 'original_bill_id')::uuid and organization_id = p_organization_id;
    if v_orig.id is null or v_orig.doc_type <> 'bill' or v_orig.status <> 'posted' then
      raise exception 'A debit note must refer to a posted bill of this client' using errcode = 'check_violation';
    end if;
    if v_orig.contact_id <> v_contact.id or v_orig.currency <> v_currency then
      raise exception 'A debit note must be for the same supplier and currency as its bill' using errcode = 'check_violation';
    end if;
  end if;
  if jsonb_typeof(p_doc -> 'lines') is distinct from 'array' or jsonb_array_length(p_doc -> 'lines') = 0 then
    raise exception 'Add at least one line' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('save_purchase_bill');
  if v_id is null then
    insert into public.purchase_bills (organization_id, doc_type, supplier_invoice_no, original_bill_id, contact_id, bill_date, due_date,
           currency, fx_rate, supplier_trn_on_invoice, has_tax_invoice_heading, is_foreign_supplier, notes, prepared_by)
    values (p_organization_id, v_type, btrim(p_doc ->> 'supplier_invoice_no'), v_orig.id, v_contact.id, v_date,
            coalesce((p_doc ->> 'due_date')::date, v_date + v_contact.payment_terms_days), v_currency, app.fx_rate(v_currency, v_date),
            nullif(btrim(p_doc ->> 'supplier_trn_on_invoice'), ''), coalesce((p_doc ->> 'has_tax_invoice_heading')::boolean, true),
            v_contact.country_code <> 'AE', nullif(btrim(p_doc ->> 'notes'), ''), v_uid)
    returning id into v_id;
  else
    update public.purchase_bills set doc_type = v_type, supplier_invoice_no = btrim(p_doc ->> 'supplier_invoice_no'), original_bill_id = v_orig.id,
           contact_id = v_contact.id, bill_date = v_date, due_date = coalesce((p_doc ->> 'due_date')::date, v_date + v_contact.payment_terms_days),
           currency = v_currency, fx_rate = app.fx_rate(v_currency, v_date), supplier_trn_on_invoice = nullif(btrim(p_doc ->> 'supplier_trn_on_invoice'), ''),
           has_tax_invoice_heading = coalesce((p_doc ->> 'has_tax_invoice_heading')::boolean, true), is_foreign_supplier = v_contact.country_code <> 'AE',
           notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid, vat_override_reason = null
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Bill not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.purchase_bill_lines where purchase_bill_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_doc -> 'lines') loop
    v_n := v_n + 1;
    select * into v_acc from public.accounts where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id;
    if v_acc.id is null or v_acc.type not in ('expense', 'asset') or v_acc.is_control or not v_acc.is_active then
      raise exception 'Line %: choose an active expense or asset account', v_n using errcode = 'check_violation';
    end if;
    insert into public.purchase_bill_lines (purchase_bill_id, organization_id, line_no, description, quantity, unit_price, account_id, tax_code)
    values (v_id, p_organization_id, v_n, btrim(v_line ->> 'description'), (v_line ->> 'quantity')::numeric,
            (v_line ->> 'unit_price')::bigint, v_acc.id, v_line ->> 'tax_code');
  end loop;
  perform app.review_purchase_bill(v_id);
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.submit_purchase_bill(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.purchase_bills;
begin
  select * into b from public.purchase_bills where id = p_id for update;
  if b.id is null then raise exception 'Bill not found' using errcode = 'no_data_found'; end if;
  perform app.require(b.organization_id, 'prepare');
  if b.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode = 'check_violation'; end if;
  perform app.set_ctx('submit_purchase_bill');
  update public.purchase_bills set status = 'pending' where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.reject_purchase_bill(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.purchase_bills;
begin
  select * into b from public.purchase_bills where id = p_id for update;
  if b.id is null then raise exception 'Bill not found' using errcode = 'no_data_found'; end if;
  perform app.require(b.organization_id, 'approve_document');
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required to send it back' using errcode = 'check_violation'; end if;
  if b.status <> 'pending' then raise exception 'Only bills waiting for approval can be sent back' using errcode = 'check_violation'; end if;
  perform app.set_ctx('reject_purchase_bill');
  perform set_config('app.reason', p_reason, true);
  update public.purchase_bills set status = 'draft' where id = p_id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

create or replace function app.delete_purchase_bill(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.purchase_bills;
begin
  select * into b from public.purchase_bills where id = p_id for update;
  if b.id is null then raise exception 'Bill not found' using errcode = 'no_data_found'; end if;
  perform app.require(b.organization_id, 'prepare');
  if b.status = 'posted' then raise exception 'Posted bills cannot be deleted — record a debit note' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.attachments where purchase_bill_id = p_id) then
    raise exception 'This bill has an attached document, so it is kept as evidence — send it back or correct it instead' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('delete_purchase_bill');
  delete from public.purchase_bills where id = p_id;
  perform app.set_ctx(null);
end $$;

-- Approves and posts. p_override_reason (D-32): the approver recovers VAT despite failed TRN/heading checks.
create or replace function app.post_purchase_bill(p_id uuid, p_override_reason text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.purchase_bills;
  v_uid uuid;
  v_ap uuid; v_vin uuid; v_vin_rc uuid; v_vout_rc uuid;
  v_j uuid; v_jno text; v_n int := 0;
  v_sign int;
  v_rc bigint;
  v_rem_net bigint; v_rem_vat bigint;
  l public.purchase_bill_lines;
  v_sup text;
  v_amount bigint;
  v_line_code text;
begin
  select * into b from public.purchase_bills where id = p_id for update;
  if b.id is null then raise exception 'Bill not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(b.organization_id, 'approve_document');
  if b.status not in ('draft', 'pending') then raise exception 'Already %', b.status using errcode = 'check_violation'; end if;
  if b.prepared_by = v_uid then
    raise exception 'You prepared this bill, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;

  perform app.set_ctx('post_purchase_bill');
  update public.purchase_bills set fx_rate = app.fx_rate(currency, bill_date),
         vat_override_reason = nullif(btrim(p_override_reason), '') where id = p_id;
  perform app.review_purchase_bill(p_id);
  select * into b from public.purchase_bills where id = p_id;
  if b.payable_total <= 0 and b.net_total <= 0 then raise exception 'The bill has no amount' using errcode = 'check_violation'; end if;
  if b.vat_override_reason is not null then
    perform set_config('app.reason', 'Input VAT recovered despite failed checks: ' || b.vat_override_reason, true);
  end if;

  if b.doc_type = 'debit_note' then
    select o.net_total - coalesce(sum(d.net_total), 0), o.vat_total - coalesce(sum(d.vat_total), 0) into v_rem_net, v_rem_vat
      from public.purchase_bills o
      left join public.purchase_bills d on d.original_bill_id = o.id and d.status = 'posted' and d.doc_type = 'debit_note'
     where o.id = b.original_bill_id group by o.net_total, o.vat_total;
    if b.net_total > v_rem_net or b.vat_total > v_rem_vat then
      raise exception 'This debit note is more than what is left on the bill (net %, VAT %)', v_rem_net / 100.0, v_rem_vat / 100.0 using errcode = 'check_violation';
    end if;
  end if;

  select id into v_ap from public.accounts where organization_id = b.organization_id and subtype = 'payable' and is_active order by code limit 1;
  select id into v_vin from public.accounts where organization_id = b.organization_id and subtype = 'vat_input' and is_active order by code limit 1;
  select id into v_vin_rc from public.accounts where organization_id = b.organization_id and subtype = 'vat_input_rc' and is_active order by code limit 1;
  select id into v_vout_rc from public.accounts where organization_id = b.organization_id and subtype = 'vat_output_rc' and is_active order by code limit 1;
  select coalesce(sum(vat), 0) into v_rc from public.purchase_bill_lines where purchase_bill_id = p_id and tax_code = 'RCS';
  if v_ap is null or (b.recoverable_vat - v_rc > 0 and v_vin is null) or (v_rc > 0 and (v_vin_rc is null or v_vout_rc is null)) then
    raise exception 'The chart of accounts needs active payables, VAT input and reverse-charge VAT accounts' using errcode = 'check_violation';
  end if;
  select name into v_sup from public.contacts where id = b.contact_id;
  v_sign := case when b.doc_type = 'bill' then 1 else -1 end;

  insert into public.journals (organization_id, entry_date, source, source_id, memo, contact_id, prepared_by)
  values (b.organization_id, b.bill_date, 'purchase', b.id,
          (case when b.doc_type = 'bill' then 'Bill ' else 'Debit note ' end) || b.supplier_invoice_no || ' · ' || v_sup, b.contact_id, b.prepared_by)
  returning id into v_j;

  -- Expense/asset lines: net plus any VAT that is not recovered (BLK, failed checks). The tax code on the
  -- ledger line drives the VAT 201: SR = box 9 (recoverable only), RCS = boxes 3 & 10, BLK = not claimed.
  for l in select * from public.purchase_bill_lines where purchase_bill_id = p_id order by line_no loop
    v_amount := l.net + case when l.tax_code in ('SR', 'BLK') then l.vat - l.recoverable_vat else 0 end;
    v_line_code := case when l.tax_code = 'SR' and l.recoverable_vat = 0 and l.vat > 0 then 'BLK' else l.tax_code end;
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy,
           tax_code, vat_amount, contact_id, description)
    values (v_j, b.organization_id, v_n, l.account_id, greatest(v_sign, 0) * v_amount, greatest(-v_sign, 0) * v_amount,
            b.currency, b.fx_rate, case when b.currency = 'AED' then null
                                        else l.net_fcy + case when v_amount > l.net then l.vat_fcy else 0 end end,
            v_line_code, l.vat, b.contact_id, l.description);
  end loop;
  if b.recoverable_vat - v_rc > 0 then                                                          -- VAT-06: box 9
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, contact_id, description)
    values (v_j, b.organization_id, v_n, v_vin, greatest(v_sign, 0) * (b.recoverable_vat - v_rc), greatest(-v_sign, 0) * (b.recoverable_vat - v_rc),
            b.contact_id, 'Input VAT ' || b.supplier_invoice_no);
  end if;
  if v_rc > 0 then                                                                               -- VAT-05: self-assessed, net 0
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, contact_id, description)
    values (v_j, b.organization_id, v_n, v_vin_rc, greatest(v_sign, 0) * v_rc, greatest(-v_sign, 0) * v_rc, b.contact_id, 'Reverse charge input VAT');
    v_n := v_n + 1;
    insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, contact_id, description)
    values (v_j, b.organization_id, v_n, v_vout_rc, greatest(-v_sign, 0) * v_rc, greatest(v_sign, 0) * v_rc, b.contact_id, 'Reverse charge output VAT');
  end if;
  v_n := v_n + 1;                                                                               -- Payables (what the supplier is owed)
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, currency, fx_rate, amount_fcy, contact_id, description)
  values (v_j, b.organization_id, v_n, v_ap, greatest(-v_sign, 0) * b.payable_total, greatest(v_sign, 0) * b.payable_total,
          b.currency, b.fx_rate, case when b.currency = 'AED' then null else b.payable_total_fcy end, b.contact_id, b.supplier_invoice_no);

  perform app.set_ctx('post_journal');
  v_jno := app.next_document_number(b.organization_id, 'journal', b.bill_date);
  update public.journals set status = 'posted', approved_by = v_uid, posted_at = now(), journal_no = v_jno where id = v_j;
  perform app.set_ctx('post_purchase_bill');
  update public.purchase_bills set status = 'posted', journal_id = v_j, approved_by = v_uid, posted_at = now() where id = p_id;
  -- "Last account used for this supplier" becomes the default for the next bill (Spec 05, no AI).
  update public.contacts set default_account_id = l2.account_id, default_tax_code = l2.tax_code
    from (select account_id, tax_code from public.purchase_bill_lines where purchase_bill_id = p_id order by line_no limit 1) l2
   where id = b.contact_id and b.doc_type = 'bill';
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_jno;
end $$;

grant execute on function app.save_purchase_bill(uuid, uuid, jsonb), app.submit_purchase_bill(uuid), app.reject_purchase_bill(uuid, text),
  app.delete_purchase_bill(uuid), app.post_purchase_bill(uuid, text) to authenticated;

create function public.save_purchase_bill(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app.save_purchase_bill(p_id, p_organization_id, p_doc) $$;
create function public.submit_purchase_bill(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.submit_purchase_bill(p_id) $$;
create function public.reject_purchase_bill(p_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reject_purchase_bill(p_id, p_reason) $$;
create function public.delete_purchase_bill(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_purchase_bill(p_id) $$;
create function public.post_purchase_bill(p_id uuid, p_override_reason text default null) returns text
language sql security invoker set search_path = '' as $$ select app.post_purchase_bill(p_id, p_override_reason) $$;
revoke all on function public.save_purchase_bill(uuid, uuid, jsonb), public.submit_purchase_bill(uuid), public.reject_purchase_bill(uuid, text),
  public.delete_purchase_bill(uuid), public.post_purchase_bill(uuid, text) from public, anon;
grant execute on function public.save_purchase_bill(uuid, uuid, jsonb), public.submit_purchase_bill(uuid), public.reject_purchase_bill(uuid, text),
  public.delete_purchase_bill(uuid), public.post_purchase_bill(uuid, text) to authenticated;
