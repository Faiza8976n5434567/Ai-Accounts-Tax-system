-- P3-01 / P3-02 · VAT 201 return and its approval workflow (Spec 01 §4.10 · Spec 03 F-03 · D-10, D-12, D-42 → D-44).
--   • Every box is calculated from posted sales and purchase journals of the VAT period, by the tax code on each line.
--   • D-42: new tax code IMG (import of goods, reverse charge) → boxes 6 and 10; RCS (imported services) → 3 and 10.
--   • D-43: manual entries only on the adjustment column of 1a–1g and 9 and on boxes 2 and 7, each with a reason.
--   • Approval (maker-checker) freezes a snapshot with its SHA-256 and the tax-rule version used, writes every box
--     (0.00 when empty, D-12) and locks the quarter's accounting periods. D-44: if a Firm Admin reopens a period, VAT
--     documents posted into it later appear in the next return as prior-period items for the preparer to review.

-- ── D-42 · Import of goods (reverse charge) ─────────────────────────────────────────────
insert into public.tax_codes (code, label, rate_key, output_by_emirate, output_box, input_box, recoverable, pint_category)
values ('IMG', 'Import of goods (reverse charge)', 'vat.rate_bp', false, '6', '10', true, 'AE');
alter table public.purchase_bill_lines drop constraint purchase_bill_lines_tax_code_check;
alter table public.purchase_bill_lines add constraint purchase_bill_lines_tax_code_check check (tax_code in ('SR', 'ZR', 'EX', 'OS', 'RCS', 'IMG', 'BLK'));

-- Bills treat IMG exactly like RCS: VAT self-assessed (recovered, not paid to the supplier), posted to 1310/2110.
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
    case when tax_code in ('RCS', 'IMG') then vat
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
               coalesce(sum(vat) filter (where tax_code not in ('RCS', 'IMG')), 0) vat_charged,          -- reverse charge VAT is not paid to the supplier
               coalesce(sum(vat_fcy) filter (where tax_code not in ('RCS', 'IMG')), 0) vat_charged_fcy
        from public.purchase_bill_lines where purchase_bill_id = p_id) t
  where p.id = p_id;
end $$;

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
  select coalesce(sum(vat), 0) into v_rc from public.purchase_bill_lines where purchase_bill_id = p_id and tax_code in ('RCS', 'IMG');
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
  -- ledger line drives the VAT 201: SR = box 9 (recoverable only), RCS = boxes 3 & 10, IMG = boxes 6 & 10, BLK = not claimed.
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

-- ── VAT 201 calculation (F-03 · D-10, D-12, D-42) ───────────────────────────────────────
-- From posted sales and purchase journals of the period (the tax date is the document date, D-29/D-31).
-- Sales: SR → box 1a–1g by the supply emirate on the line (head office if missing), ZR → 4, EX → 5, OS → none.
-- Purchases: SR (recoverable) → 9, RCS → 3 and 10, IMG → 6 and 10, BLK/non-recoverable → none.
-- Credit and debit notes come in with the opposite sign. Receipts and payments never touch VAT (VAT-16, D-35).
create or replace function app.vat201_base(p_org uuid, p_from date, p_to date)
returns table (box text, amount bigint, vat bigint)
language sql stable security definer set search_path = '' as $$
  with l as (
    select j.source, ln.tax_code, coalesce(ln.supply_emirate, o.emirate_code) as emirate, ln.debit, ln.credit, ln.vat_amount
    from public.journal_lines ln
    join public.journals j on j.id = ln.journal_id
    join public.organizations o on o.id = ln.organization_id
    where ln.organization_id = p_org and j.status in ('posted', 'reversed') and j.entry_date between p_from and p_to
      and ln.tax_code is not null and j.source in ('sale', 'purchase')
  ), x as (
    select e.vat_box as box, l.credit - l.debit as amount, sign(l.credit - l.debit)::bigint * l.vat_amount as vat
      from l join public.emirates e on e.code = l.emirate where l.source = 'sale' and l.tax_code = 'SR'
    union all select '4', credit - debit, 0 from l where source = 'sale' and tax_code = 'ZR'
    union all select '5', credit - debit, 0 from l where source = 'sale' and tax_code = 'EX'
    union all select '3', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'RCS'
    union all select '6', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'IMG'
    union all select '10', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code in ('RCS', 'IMG')
    union all select '9', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'SR'
  )
  select box, sum(amount)::bigint, sum(vat)::bigint from x group by box
$$;

create type public.vat_return_status as enum ('draft', 'in_review', 'approved', 'filed');

create table public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tax_period_id uuid not null unique references public.tax_periods (id) on delete restrict,
  status public.vat_return_status not null default 'draft',
  prepared_by uuid references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  config_version_id uuid references public.config_versions (id) on delete restrict,   -- tax rules used (Principle 6)
  snapshot jsonb,
  snapshot_sha256 text check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  filed_on date,
  fta_reference text,
  unique (id, organization_id),
  check (approved_by <> prepared_by),
  check ((status in ('approved', 'filed')) = (approved_at is not null and snapshot is not null and snapshot_sha256 is not null and config_version_id is not null)),
  check ((status = 'filed') = (filed_on is not null and fta_reference is not null))
);
select app.setup_table('public.vat_returns');
create index vat_returns_org_idx on public.vat_returns (organization_id);
create index vat_returns_prepared_by_idx on public.vat_returns (prepared_by);
create index vat_returns_approved_by_idx on public.vat_returns (approved_by);
create index vat_returns_config_idx on public.vat_returns (config_version_id);

-- Every box is written at approval, 0 when empty (D-12).
create table public.vat_return_boxes (
  vat_return_id uuid not null,
  organization_id uuid not null,
  box_code text not null references public.vat_boxes (code) on delete restrict,
  amount bigint not null default 0,
  vat bigint not null default 0,
  adjustment bigint not null default 0,
  primary key (vat_return_id, box_code),
  foreign key (vat_return_id, organization_id) references public.vat_returns (id, organization_id) on delete restrict
);
select app.setup_table('public.vat_return_boxes');
create index vat_return_boxes_box_idx on public.vat_return_boxes (box_code);
create index vat_return_boxes_org_idx on public.vat_return_boxes (vat_return_id, organization_id);

-- D-43: manual entries only on the adjustment column of 1a–1g and 9, and on boxes 2 and 7 — always with a reason.
create table public.vat_return_adjustments (
  id uuid primary key default gen_random_uuid(),
  vat_return_id uuid not null,
  organization_id uuid not null,
  box_code text not null references public.vat_boxes (code) on delete restrict,
  amount bigint not null default 0,
  vat bigint not null default 0,
  adjustment bigint not null default 0,
  reason text not null check (btrim(reason) <> ''),
  legal_reference text,
  foreign key (vat_return_id, organization_id) references public.vat_returns (id, organization_id) on delete cascade,
  check (box_code in ('1a', '1b', '1c', '1d', '1e', '1f', '1g', '2', '7', '9')),
  check (case when box_code in ('2', '7') then adjustment = 0 and (amount <> 0 or vat <> 0)
              else amount = 0 and vat = 0 and adjustment <> 0 end)
);
select app.setup_table('public.vat_return_adjustments');
create index vat_return_adjustments_return_idx on public.vat_return_adjustments (vat_return_id, organization_id);
create index vat_return_adjustments_box_idx on public.vat_return_adjustments (box_code);

do $$
declare t text;
begin
  foreach t in array array['vat_returns', 'vat_return_boxes', 'vat_return_adjustments'] loop
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()))', t);
    execute format('create policy sel on public.%I for select to authenticated using (organization_id in (select app.orgs_with(''view'')))', t);
  end loop;
end $$;
grant select on public.vat_returns, public.vat_return_boxes, public.vat_return_adjustments to authenticated;

-- Approved and filed returns are frozen (Principle 9); boxes are written once; adjustments only while draft.
create or replace function app.vat_returns_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.vat_return_status;
begin
  if tg_table_name = 'vat_returns' then
    if tg_op = 'DELETE' then raise exception 'VAT returns are never deleted' using errcode = 'insufficient_privilege'; end if;
    if old.status in ('approved', 'filed') and not (app.ctx() = 'file_vat_return' and old.status = 'approved' and new.status = 'filed'
        and (to_jsonb(new) - 'status' - 'filed_on' - 'fta_reference' - 'updated_at' - 'updated_by')
          = (to_jsonb(old) - 'status' - 'filed_on' - 'fta_reference' - 'updated_at' - 'updated_by')) then
      raise exception 'An approved VAT return is frozen' using errcode = 'insufficient_privilege';
    end if;
    if app.ctx() not in ('vat_return', 'approve_vat_return', 'file_vat_return') then
      raise exception 'VAT returns change only through their functions' using errcode = 'insufficient_privilege';
    end if;
    return new;
  elsif tg_table_name = 'vat_return_boxes' then
    if tg_op <> 'INSERT' or app.ctx() <> 'approve_vat_return' then
      raise exception 'VAT return boxes are written once, at approval' using errcode = 'insufficient_privilege';
    end if;
    return new;
  else
    select status into v_status from public.vat_returns where id = case when tg_op = 'DELETE' then old.vat_return_id else new.vat_return_id end;
    if v_status is distinct from 'draft' or app.ctx() <> 'vat_return' then
      raise exception 'Adjustments can be changed only while the return is a draft' using errcode = 'insufficient_privilege';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
end $$;
create trigger guard before update or delete on public.vat_returns for each row execute function app.vat_returns_guard();
create trigger guard before insert or update or delete on public.vat_return_boxes for each row execute function app.vat_returns_guard();
create trigger guard before insert or update or delete on public.vat_return_adjustments for each row execute function app.vat_returns_guard();

-- All 20 boxes in FTA order: calculated figures + manual adjustments, then totals 8, 11, 12, 13, 14 (VAT-11).
create or replace function app.vat201_boxes(p_org uuid, p_from date, p_to date, p_return_id uuid)
returns table (box_code text, label text, sort smallint, amount bigint, vat bigint, adjustment bigint)
language sql stable security definer set search_path = '' as $$
  with base as (select * from app.vat201_base(p_org, p_from, p_to)),
  adj as (select a.box_code as box, sum(a.amount) amount, sum(a.vat) vat, sum(a.adjustment) adjustment
          from public.vat_return_adjustments a where a.vat_return_id = p_return_id group by a.box_code),
  rws as (
    select b.code, b.label, b.section, b.sort,
           (coalesce(base.amount, 0) + coalesce(adj.amount, 0))::bigint as amount,
           (coalesce(base.vat, 0) + coalesce(adj.vat, 0))::bigint as vat,
           coalesce(adj.adjustment, 0)::bigint as adjustment
    from public.vat_boxes b left join base on base.box = b.code left join adj on adj.box = b.code
    where not b.is_total
  ),
  o as (select coalesce(sum(amount), 0)::bigint a, coalesce(sum(vat), 0)::bigint v, coalesce(sum(adjustment), 0)::bigint d from rws where section = 'output'),
  i as (select coalesce(sum(amount), 0)::bigint a, coalesce(sum(vat), 0)::bigint v, coalesce(sum(adjustment), 0)::bigint d from rws where section = 'input')
  select code, label, sort, amount, vat, adjustment from rws
  union all select '8', b.label, b.sort, o.a, o.v, o.d from public.vat_boxes b, o where b.code = '8'
  union all select '11', b.label, b.sort, i.a, i.v, i.d from public.vat_boxes b, i where b.code = '11'
  union all select '12', b.label, b.sort, 0::bigint, (o.v + o.d)::bigint, 0::bigint from public.vat_boxes b, o where b.code = '12'
  union all select '13', b.label, b.sort, 0::bigint, (i.v + i.d)::bigint, 0::bigint from public.vat_boxes b, i where b.code = '13'
  union all select '14', b.label, b.sort, 0::bigint, (o.v + o.d - i.v - i.d)::bigint, 0::bigint from public.vat_boxes b, o, i where b.code = '14'
  order by 3
$$;

-- D-44: VAT lines posted into an already approved quarter after its approval (the period was reopened) — journals
-- numbered after the last journal number recorded in the approved snapshot.
create or replace function app.vat_prior_period_items(p_org uuid, p_before date)
returns table (entry_date date, journal_id uuid, journal_no text, memo text, tax_code text, amount bigint, vat bigint, period_end date)
language sql stable security definer set search_path = '' as $$
  select j.entry_date, j.id, j.journal_no, j.memo, l.tax_code,
         case when j.source = 'sale' then l.credit - l.debit else l.debit - l.credit end,
         case when j.source = 'sale' then sign(l.credit - l.debit) else sign(l.debit - l.credit) end::bigint * l.vat_amount,
         tp.end_date
  from public.vat_returns r
  join public.tax_periods tp on tp.id = r.tax_period_id
  join public.journals j on j.organization_id = r.organization_id and j.entry_date between tp.start_date and tp.end_date
                         and j.status in ('posted', 'reversed') and j.source in ('sale', 'purchase')
                         and (regexp_match(j.journal_no, '(\d+)$'))[1]::int > coalesce((r.snapshot ->> 'last_journal_seq')::int, 0)
  join public.journal_lines l on l.journal_id = j.id and l.tax_code is not null and l.tax_code not in ('OS', 'BLK')
  where r.organization_id = p_org and r.status in ('approved', 'filed') and tp.end_date < p_before
  order by j.entry_date, j.journal_no
$$;

-- ── Return workflow (P3-02 · VAT-13) ────────────────────────────────────────────────────
create or replace function app.vat_return_period(p_tax_period_id uuid) returns public.tax_periods
language plpgsql stable security definer set search_path = '' as $$
declare tp public.tax_periods;
begin
  select * into tp from public.tax_periods where id = p_tax_period_id;
  if tp.id is null or tp.kind <> 'vat' then raise exception 'VAT period not found' using errcode = 'no_data_found'; end if;
  return tp;
end $$;

-- What the screen shows: the live calculation (or the frozen snapshot once approved).
create or replace function app.vat_return_preview(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.vat_return_period(p_tax_period_id);
  r public.vat_returns;
begin
  perform app.require(tp.organization_id, 'view');
  select * into r from public.vat_returns where tax_period_id = tp.id;
  return jsonb_build_object(
    'period', jsonb_build_object('id', tp.id, 'start_date', tp.start_date, 'end_date', tp.end_date, 'due_date', tp.due_date),
    'return', case when r.id is null then null else to_jsonb(r) - 'snapshot' end,
    'frozen', coalesce(r.status in ('approved', 'filed'), false),
    'boxes', case when r.status in ('approved', 'filed') then r.snapshot -> 'boxes'
                  else (select jsonb_agg(to_jsonb(b) order by b.sort) from app.vat201_boxes(tp.organization_id, tp.start_date, tp.end_date, r.id) b) end,
    'adjustments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.vat_return_adjustments a where a.vat_return_id = r.id), '[]'),
    'prior_period_items', case when r.status in ('approved', 'filed') then '[]'::jsonb
                  else coalesce((select jsonb_agg(to_jsonb(x)) from app.vat_prior_period_items(tp.organization_id, tp.start_date) x), '[]') end);
end $$;

create or replace function app.start_vat_return(p_tax_period_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.vat_return_period(p_tax_period_id);
  v_uid uuid := app.require(tp.organization_id, 'prepare_vat');
  v_id uuid;
begin
  select id into v_id from public.vat_returns where tax_period_id = tp.id;
  if v_id is not null then return v_id; end if;
  perform app.set_ctx('vat_return');
  insert into public.vat_returns (organization_id, tax_period_id, prepared_by) values (tp.organization_id, tp.id, v_uid) returning id into v_id;
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.add_vat_adjustment(p_return_id uuid, p_box text, p_amount bigint, p_vat bigint, p_adjustment bigint,
  p_reason text, p_legal_reference text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.vat_returns; v_uid uuid; v_id uuid;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'prepare_vat');
  if r.status <> 'draft' then raise exception 'Adjustments can be changed only while the return is a draft' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required for every adjustment (D-43)' using errcode = 'check_violation'; end if;
  if p_box not in ('1a', '1b', '1c', '1d', '1e', '1f', '1g', '2', '7', '9') then
    raise exception 'Box % is calculated from the books only — adjustments are allowed on 1a–1g, 2, 7 and 9 (D-43)', p_box using errcode = 'check_violation';
  end if;
  perform app.set_ctx('vat_return');
  perform set_config('app.reason', p_reason, true);
  insert into public.vat_return_adjustments (vat_return_id, organization_id, box_code, amount, vat, adjustment, reason, legal_reference)
  values (r.id, r.organization_id, p_box, coalesce(p_amount, 0), coalesce(p_vat, 0), coalesce(p_adjustment, 0), btrim(p_reason), nullif(btrim(p_legal_reference), ''))
  returning id into v_id;
  update public.vat_returns set prepared_by = v_uid where id = r.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_id;
end $$;

create or replace function app.delete_vat_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.vat_return_adjustments;
begin
  select * into a from public.vat_return_adjustments where id = p_id;
  if a.id is null then raise exception 'Adjustment not found' using errcode = 'no_data_found'; end if;
  perform app.require(a.organization_id, 'prepare_vat');
  perform app.set_ctx('vat_return');
  delete from public.vat_return_adjustments where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.submit_vat_return(p_return_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.vat_returns; v_uid uuid;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'prepare_vat');
  if r.status <> 'draft' then raise exception 'Only a draft return can be sent for review' using errcode = 'check_violation'; end if;
  perform app.set_ctx('vat_return');
  update public.vat_returns set status = 'in_review', prepared_by = v_uid where id = r.id;
  perform app.set_ctx(null);
end $$;

create or replace function app.reject_vat_return(p_return_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.vat_returns;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'approve_vat');
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required to send it back' using errcode = 'check_violation'; end if;
  if r.status <> 'in_review' then raise exception 'Only a return in review can be sent back' using errcode = 'check_violation'; end if;
  perform app.set_ctx('vat_return');
  perform set_config('app.reason', p_reason, true);
  update public.vat_returns set status = 'draft' where id = r.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

-- Approval: recalculates, writes every box (D-12), freezes a snapshot with its SHA-256 and the tax-rule version
-- used (Principle 6), and locks the accounting periods of the quarter (D-44). Maker-checker (Principle 8).
create or replace function app.approve_vat_return(p_return_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.vat_returns;
  tp public.tax_periods;
  v_uid uuid;
  v_cfg public.config_versions;
  v_snap jsonb;
  v_hash text;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'approve_vat');
  if r.status <> 'in_review' then raise exception 'Only a return in review can be approved' using errcode = 'check_violation'; end if;
  if r.prepared_by = v_uid then
    raise exception 'You prepared this return, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;
  select * into tp from public.tax_periods where id = r.tax_period_id;
  select * into v_cfg from public.config_versions where status = 'approved' and effective_from <= tp.end_date order by effective_from desc limit 1;
  if v_cfg.id is null then raise exception 'No approved tax-rule version covers this period' using errcode = 'check_violation'; end if;

  v_snap := jsonb_build_object(
    'organization', (select jsonb_build_object('legal_name', legal_name, 'trn', trn, 'emirate', emirate_code) from public.organizations where id = r.organization_id),
    'period', jsonb_build_object('start_date', tp.start_date, 'end_date', tp.end_date, 'due_date', tp.due_date),
    'boxes', (select jsonb_agg(to_jsonb(b) order by b.sort) from app.vat201_boxes(r.organization_id, tp.start_date, tp.end_date, r.id) b),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('box_code', box_code, 'amount', amount, 'vat', vat, 'adjustment', adjustment,
                    'reason', reason, 'legal_reference', legal_reference) order by created_at) from public.vat_return_adjustments where vat_return_id = r.id), '[]'),
    'config_version', v_cfg.label,
    'last_journal_seq', (select coalesce(max((regexp_match(journal_no, '(\d+)$'))[1]::int), 0) from public.journals
                         where organization_id = r.organization_id and journal_no is not null),
    'prepared_by', r.prepared_by, 'approved_by', v_uid, 'approved_at', now());
  v_hash := encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex');

  perform app.set_ctx('approve_vat_return');
  insert into public.vat_return_boxes (vat_return_id, organization_id, box_code, amount, vat, adjustment)
  select r.id, r.organization_id, b ->> 'box_code', (b ->> 'amount')::bigint, (b ->> 'vat')::bigint, (b ->> 'adjustment')::bigint
  from jsonb_array_elements(v_snap -> 'boxes') b;
  update public.vat_returns set status = 'approved', approved_by = v_uid, approved_at = now(), config_version_id = v_cfg.id,
         snapshot = v_snap, snapshot_sha256 = v_hash where id = r.id;
  perform set_config('app.reason', 'VAT return approved for ' || to_char(tp.start_date, 'DD Mon YYYY') || ' – ' || to_char(tp.end_date, 'DD Mon YYYY'), true);
  update public.accounting_periods set status = 'locked', locked_by = v_uid, locked_at = now(),
         lock_reason = 'VAT return approved (' || to_char(tp.start_date, 'Mon YYYY') || ' – ' || to_char(tp.end_date, 'Mon YYYY') || ')'
   where organization_id = r.organization_id and status = 'open' and start_date >= tp.start_date and end_date <= tp.end_date;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_hash;
end $$;

-- After filing on EmaraTax: the FTA reference and date (the return itself stays frozen).
create or replace function app.mark_vat_return_filed(p_return_id uuid, p_fta_reference text, p_filed_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.vat_returns;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'file_vat');
  if r.status <> 'approved' then raise exception 'Only an approved return can be marked as filed' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_fta_reference), '') is null or p_filed_on is null then
    raise exception 'Enter the FTA reference and the filing date' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('file_vat_return');
  update public.vat_returns set status = 'filed', fta_reference = btrim(p_fta_reference), filed_on = p_filed_on where id = r.id;
  perform app.set_ctx(null);
end $$;

-- ── API ─────────────────────────────────────────────────────────────────────────────────
grant execute on function app.vat_return_preview(uuid), app.start_vat_return(uuid), app.add_vat_adjustment(uuid, text, bigint, bigint, bigint, text, text),
  app.delete_vat_adjustment(uuid), app.submit_vat_return(uuid), app.reject_vat_return(uuid, text), app.approve_vat_return(uuid),
  app.mark_vat_return_filed(uuid, text, date) to authenticated;
create function public.vat_return_preview(p_tax_period_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select app.vat_return_preview(p_tax_period_id) $$;
create function public.start_vat_return(p_tax_period_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select app.start_vat_return(p_tax_period_id) $$;
create function public.add_vat_adjustment(p_return_id uuid, p_box text, p_amount bigint, p_vat bigint, p_adjustment bigint, p_reason text,
  p_legal_reference text default null) returns uuid
language sql security invoker set search_path = '' as $$ select app.add_vat_adjustment(p_return_id, p_box, p_amount, p_vat, p_adjustment, p_reason, p_legal_reference) $$;
create function public.delete_vat_adjustment(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_vat_adjustment(p_id) $$;
create function public.submit_vat_return(p_return_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.submit_vat_return(p_return_id) $$;
create function public.reject_vat_return(p_return_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.reject_vat_return(p_return_id, p_reason) $$;
create function public.approve_vat_return(p_return_id uuid) returns text
language sql security invoker set search_path = '' as $$ select app.approve_vat_return(p_return_id) $$;
create function public.mark_vat_return_filed(p_return_id uuid, p_fta_reference text, p_filed_on date) returns void
language sql security invoker set search_path = '' as $$ select app.mark_vat_return_filed(p_return_id, p_fta_reference, p_filed_on) $$;
revoke all on function public.vat_return_preview(uuid), public.start_vat_return(uuid), public.add_vat_adjustment(uuid, text, bigint, bigint, bigint, text, text),
  public.delete_vat_adjustment(uuid), public.submit_vat_return(uuid), public.reject_vat_return(uuid, text), public.approve_vat_return(uuid),
  public.mark_vat_return_filed(uuid, text, date) from public, anon;
grant execute on function public.vat_return_preview(uuid), public.start_vat_return(uuid), public.add_vat_adjustment(uuid, text, bigint, bigint, bigint, text, text),
  public.delete_vat_adjustment(uuid), public.submit_vat_return(uuid), public.reject_vat_return(uuid, text), public.approve_vat_return(uuid),
  public.mark_vat_return_filed(uuid, text, date) to authenticated;
