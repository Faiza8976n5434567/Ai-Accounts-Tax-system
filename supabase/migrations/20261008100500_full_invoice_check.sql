-- D-46 · Full tax invoice check on bills (F-07 · Exec. Reg. Art 59, threshold `vat.full_invoice_threshold`, VERIFY).
-- Above the threshold a supplier's tax invoice must show the recipient's (our client's) name, address and TRN.
-- The preparer ticks "Shows our name, address and TRN"; if not ticked a WARNING is raised (risk +10). Input VAT
-- recovery is not stopped automatically — the approver decides (Faizan, 2026-10-08). The amount compared is the
-- supplier's total (net + VAT charged).

alter table public.purchase_bills add column shows_recipient_details boolean not null default false;

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
    ('recipient', 'Full tax invoice shows our name, address and TRN (over the full-invoice threshold)',
       b.is_foreign_supplier or not v_charges_vat or b.shows_recipient_details
       or (select coalesce(sum(net + case when tax_code in ('SR', 'BLK') then vat else 0 end), 0) from public.purchase_bill_lines where purchase_bill_id = p_id)
          <= coalesce((app.config_value('vat.full_invoice_threshold', b.bill_date) #>> '{}')::bigint, 1000000),
       'warn',
       case when not b.is_foreign_supplier and v_charges_vat and not b.shows_recipient_details
            then 'Above the threshold a full tax invoice must show the recipient''s name, address and TRN (Exec. Reg. Art 59) — check the document' end),
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
           currency, fx_rate, supplier_trn_on_invoice, has_tax_invoice_heading, shows_recipient_details, is_foreign_supplier, notes, prepared_by)
    values (p_organization_id, v_type, btrim(p_doc ->> 'supplier_invoice_no'), v_orig.id, v_contact.id, v_date,
            coalesce((p_doc ->> 'due_date')::date, v_date + v_contact.payment_terms_days), v_currency, app.fx_rate(v_currency, v_date),
            nullif(btrim(p_doc ->> 'supplier_trn_on_invoice'), ''), coalesce((p_doc ->> 'has_tax_invoice_heading')::boolean, true),
            coalesce((p_doc ->> 'shows_recipient_details')::boolean, false), v_contact.country_code <> 'AE', nullif(btrim(p_doc ->> 'notes'), ''), v_uid)
    returning id into v_id;
  else
    update public.purchase_bills set doc_type = v_type, supplier_invoice_no = btrim(p_doc ->> 'supplier_invoice_no'), original_bill_id = v_orig.id,
           contact_id = v_contact.id, bill_date = v_date, due_date = coalesce((p_doc ->> 'due_date')::date, v_date + v_contact.payment_terms_days),
           currency = v_currency, fx_rate = app.fx_rate(v_currency, v_date), supplier_trn_on_invoice = nullif(btrim(p_doc ->> 'supplier_trn_on_invoice'), ''),
           has_tax_invoice_heading = coalesce((p_doc ->> 'has_tax_invoice_heading')::boolean, true),
           shows_recipient_details = coalesce((p_doc ->> 'shows_recipient_details')::boolean, false), is_foreign_supplier = v_contact.country_code <> 'AE',
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
