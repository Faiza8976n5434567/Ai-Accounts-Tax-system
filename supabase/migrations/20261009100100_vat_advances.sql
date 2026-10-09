-- VAT-17 · D-58 (Faizan, 2026-10-09) · Advances for a specific supply — Federal Decree-Law No. 8 of 2017, Art 25–26
-- (date of supply; Q-08). A customer receipt ticked "Advance for a specific supply" declares output VAT on receipt:
--   VAT = advance × rate ÷ (10,000 + rate), half-up (F-02), in the emirate chosen (default head office).
--   Journal: Dr Bank / Cr 2150 Customer credits (full amount, so credits still = 2150) and Dr 1170 / Cr 2100 for the VAT.
--   The 2150 line carries the VAT tag (SR, net, VAT, emirate) so the advance shows in box 1x of its period.
-- When the advance is applied to the customer's invoice (automatically, D-11) the invoice keeps its full VAT and the
-- advance's VAT share is taken back in that journal (Dr 2100 / Cr 1170, tagged −net / −VAT) — VAT is never counted twice.
-- A refund of the advance takes the VAT back in the refund's period the same way. Plain receipts are unchanged (D-11).
-- The VAT return, its drill-down and reconciliation read these tagged receipt/refund lines (and their D-40 reversals).

-- ── Account 1170 (template and every client) ────────────────────────────────────────────
insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, '1170', 'VAT on customer advances', 'asset', 'vat_advance', 'Receivables', null, true
from public.coa_templates t where t.code = 'uae-sme'
on conflict (template_id, code) do nothing;
insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
select o.id, '1170', 'VAT on customer advances', 'asset', 'vat_advance', 'Receivables', null, true
from public.organizations o
where not exists (select 1 from public.accounts a where a.organization_id = o.id and (a.code = '1170' or a.subtype = 'vat_advance'));

-- ── Columns ─────────────────────────────────────────────────────────────────────────────
alter table public.payments
  add column vat_advance boolean not null default false,
  add column advance_emirate text references public.emirates (code) on delete restrict,
  add column advance_vat bigint not null default 0 check (advance_vat >= 0),
  add constraint payments_vat_advance_kind check (not vat_advance or (kind = 'customer_receipt' and advance_emirate is not null));
create index payments_advance_emirate_idx on public.payments (advance_emirate);
alter table public.payment_allocations add column advance_vat bigint not null default 0 check (advance_vat >= 0);

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────
-- The standard rate in force on a date (basis points), from the SR tax code's rule (Principle 6).
create or replace function app.sr_rate(p_on date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((app.config_value((select rate_key from public.tax_codes where code = 'SR'), p_on) #>> '{}')::int, 0)
$$;

-- A journal line with a VAT tag: SR, its VAT and emirate (signed AED amount: + debit, − credit).
create or replace function app.add_vat_line(p_j uuid, p_org uuid, p_account uuid, p_amount bigint, p_contact uuid, p_desc text,
  p_emirate text, p_vat bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_amount = 0 then return; end if;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit, contact_id, description, tax_code, vat_amount, supply_emirate)
  values (p_j, p_org, coalesce((select max(line_no) from public.journal_lines where journal_id = p_j), 0) + 1, p_account,
          greatest(p_amount, 0), greatest(-p_amount, 0), p_contact, p_desc, 'SR', p_vat, p_emirate);
end $$;

-- VAT of an advance not yet taken back (applications to invoices and refunds counted like credit_left).
create or replace function app.advance_vat_left(p_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(max(p.advance_vat) - coalesce(sum(a.advance_vat), 0), 0)::bigint
  from public.payments p
  left join public.payment_allocations a on a.payment_id = p.id and a.credit_amount is not null
       and (a.refund_id is null or app.payment_live(a.refund_id))
  where p.id = p_id and p.vat_advance and app.payment_live(p.id)
    and not exists (select 1 from public.journals r where r.reversal_of = p.journal_id)
$$;

-- The VAT share of p_taken (AED of the credit being used): proportional, the rest when the advance is used up.
create or replace function app.advance_vat_share(p_id uuid, p_taken bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_vat bigint := app.advance_vat_left(p_id); v_left bigint;
begin
  if v_vat <= 0 or coalesce(p_taken, 0) <= 0 then return 0; end if;
  select left_aed into v_left from app.credit_left(p_id);
  if v_left is null or v_left <= 0 then return 0; end if;
  if p_taken >= v_left then return v_vat; end if;
  return app.round_half_up(p_taken::numeric * v_vat / v_left);
end $$;

-- The source that decides a line's VAT box: a reversal counts as the journal it reverses (D-40).
create or replace function app.vat_source(p_source public.journal_source, p_reversal_of uuid) returns public.journal_source
language sql stable security definer set search_path = '' as $$
  select case when p_source = 'reversal' then (select source from public.journals where id = p_reversal_of) else p_source end
$$;

-- ── Receipts: tick, VAT on receipt, VAT taken back on refund ─────────────────────────────

create or replace function app.save_payment(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'record_payment');
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
  v_adv boolean := coalesce((p_doc ->> 'vat_advance')::boolean, false);
  v_adv_emirate text;
begin
  if v_kind is null then raise exception 'Choose what kind of payment this is' using errcode = 'check_violation'; end if;
  if v_date is null then raise exception 'Enter the payment date' using errcode = 'check_violation'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = 'check_violation'; end if;
  if v_charges < 0 or v_charges >= v_amount then raise exception 'Bank charges must be less than the amount' using errcode = 'check_violation'; end if;
  v_customer := v_kind in ('customer_receipt', 'customer_refund');
  if v_adv then                                                                              -- D-58
    if v_kind <> 'customer_receipt' then
      raise exception 'Only a customer receipt can be an advance for a specific supply' using errcode = 'check_violation';
    end if;
    if not v_auto then
      raise exception 'An advance for a specific supply is not allocated to invoices — it is applied when the invoice is issued (D-58)' using errcode = 'check_violation';
    end if;
    v_adv_emirate := coalesce(nullif(p_doc ->> 'advance_emirate', ''), (select emirate_code from public.organizations where id = p_organization_id));
    if not exists (select 1 from public.emirates where code = v_adv_emirate) then
      raise exception 'Choose the emirate of the supply' using errcode = 'check_violation';
    end if;
  end if;
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
           auto_allocate, reference, notes, prepared_by, vat_advance, advance_emirate)
    values (p_organization_id, v_kind, v_contact.id, v_bank.id, v_date, v_currency, app.fx_rate(v_currency, v_date), v_amount, v_charges,
            v_auto, nullif(btrim(p_doc ->> 'reference'), ''), nullif(btrim(p_doc ->> 'notes'), ''), v_uid, v_adv, v_adv_emirate)
    returning id into v_id;
  else
    update public.payments set kind = v_kind, contact_id = v_contact.id, bank_account_id = v_bank.id, payment_date = v_date, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_date), amount_fcy = v_amount, bank_charges_fcy = v_charges, auto_allocate = v_auto,
           reference = nullif(btrim(p_doc ->> 'reference'), ''), notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid,
           vat_advance = v_adv, advance_emirate = v_adv_emirate
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
  v_av bigint;
  v_av_total bigint := 0;
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
    if p.auto_allocate and not p.vat_advance then                -- an advance stays unallocated (D-58)
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
    for r in select a.id, a.payment_id, a.credit_amount, s.advance_emirate, s.payment_no from public.payment_allocations a
             join public.payments s on s.id = a.payment_id where a.refund_id = p_id order by a.created_at, a.id loop
      v_av := case when v_customer then app.advance_vat_share(r.payment_id, r.credit_amount) else 0 end;
      if v_av > 0 then                                                                       -- D-58: VAT taken back on refund
        update public.payment_allocations set advance_vat = v_av where id = r.id;
        perform app.add_vat_line(v_j, p.organization_id, v_side, -v_sign * (r.credit_amount - v_av), p.contact_id,
                                 'Advance ' || r.payment_no || ' refunded (D-58)', r.advance_emirate, v_av);
        perform app.add_line(v_j, p.organization_id, v_side, -v_sign * v_av, p.contact_id, 'VAT element of advance ' || r.payment_no);
        v_av_total := v_av_total + v_av;
      else
        perform app.add_line(v_j, p.organization_id, v_side, -v_sign * r.credit_amount, p.contact_id,
                             case when v_customer then 'Customer credit refunded' else 'Supplier advance refunded' end);
      end if;
    end loop;
    if v_av_total > 0 then
      perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'vat_output'), v_av_total, p.contact_id, 'Advance VAT taken back on refund (D-58)');
      perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'vat_advance'), -v_av_total, p.contact_id, 'Advance VAT taken back on refund (D-58)');
    end if;
  else
    for r in select a.amount, coalesce(i.invoice_no, b.supplier_invoice_no) no from public.payment_allocations a
             left join public.sales_invoices i on i.id = a.sales_invoice_id left join public.purchase_bills b on b.id = a.purchase_bill_id
             where a.payment_id = p_id order by a.created_at, a.id loop
      perform app.add_line(v_j, p.organization_id, v_side, -v_sign * r.amount, p.contact_id, r.no);
    end loop;
    if p.vat_advance and p.credit_aed > 0 then                                             -- D-58: VAT due on receipt
      v_av := app.round_half_up(p.credit_aed::numeric * app.sr_rate(p.payment_date) / (10000 + app.sr_rate(p.payment_date)));
      perform app.add_vat_line(v_j, p.organization_id, v_credit_acc, -(p.credit_aed - v_av), p.contact_id,
                               'Advance for a specific supply (D-58)', p.advance_emirate, v_av);
      perform app.add_line(v_j, p.organization_id, v_credit_acc, -v_av, p.contact_id, 'VAT element of the advance');
      perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'vat_advance'), v_av, p.contact_id, 'VAT declared on the advance (D-58)');
      perform app.add_line(v_j, p.organization_id, app.subtype_account(p.organization_id, 'vat_output'), -v_av, p.contact_id, 'Output VAT on the advance (D-58)');
      update public.payments set advance_vat = v_av where id = p_id;
    else
      perform app.add_line(v_j, p.organization_id, v_credit_acc, -v_sign * p.credit_aed, p.contact_id,
                           case when v_customer then 'Customer credit (D-11)' else 'Supplier advance (D-36)' end);
    end if;
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

-- ── Credits applied to invoices: VAT taken back ─────────────────────────────────────────

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
  v_av bigint;
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
    v_av := case when v_customer then app.advance_vat_share(r.id, v_credit_aed) else 0 end;
    if v_customer and v_av > 0 then                                                          -- D-58: advance VAT taken back
      perform app.add_vat_line(v_j, v_org, v_credit_acc, v_credit_aed - v_av, v_contact,
                               'Advance ' || r.payment_no || ' applied — VAT already declared (D-58)', (select advance_emirate from public.payments where id = r.id), v_av);
      perform app.add_line(v_j, v_org, v_credit_acc, v_av, v_contact, 'VAT element of advance ' || r.payment_no);
      perform app.add_line(v_j, v_org, app.subtype_account(v_org, 'vat_output'), v_av, v_contact, 'Advance VAT taken back (D-58)');
      perform app.add_line(v_j, v_org, app.subtype_account(v_org, 'vat_advance'), -v_av, v_contact, 'Advance VAT taken back (D-58)');
      perform app.add_line(v_j, v_org, v_side, -v_doc_aed, v_contact, v_no);
    elsif v_customer then
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
    insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, purchase_bill_id, amount_fcy, amount, credit_amount, applied_on, journal_id, advance_vat)
    values (v_org, r.id, case when v_customer then p_doc_id end, case when not v_customer then p_doc_id end,
            v_take, v_doc_aed, v_credit_aed, greatest(v_date, r.payment_date), v_j, v_av);
    v_open_fcy := v_open_fcy - v_take;
    v_open_aed := v_open_aed - v_doc_aed;
  end loop;
  perform app.set_ctx(v_prev_ctx);
  perform set_config('app.reason', v_prev_reason, true);
end $$;

-- ── VAT return, drill-down and reconciliation read advance lines ───────────────────────

create or replace function app.vat201_base(p_org uuid, p_from date, p_to date)
returns table (box text, amount bigint, vat bigint)
language sql stable security definer set search_path = '' as $$
  with l as (
    select app.vat_source(j.source, j.reversal_of) as source, ln.tax_code, coalesce(ln.supply_emirate, o.emirate_code) as emirate, ln.debit, ln.credit, ln.vat_amount
    from public.journal_lines ln
    join public.journals j on j.id = ln.journal_id
    join public.organizations o on o.id = ln.organization_id
    where ln.organization_id = p_org and j.status in ('posted', 'reversed') and j.entry_date between p_from and p_to
      and ln.tax_code is not null and app.vat_source(j.source, j.reversal_of) in ('sale', 'purchase', 'receipt', 'payment')
  ), x as (
    select e.vat_box as box, l.credit - l.debit as amount, sign(l.credit - l.debit)::bigint * l.vat_amount as vat
      from l join public.emirates e on e.code = l.emirate where l.source in ('sale', 'receipt', 'payment') and l.tax_code = 'SR'
    union all select '4', credit - debit, 0 from l where source = 'sale' and tax_code = 'ZR'
    union all select '5', credit - debit, 0 from l where source = 'sale' and tax_code = 'EX'
    union all select '3', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'RCS'
    union all select '6', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'IMG'
    union all select '10', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code in ('RCS', 'IMG')
    union all select '9', debit - credit, sign(debit - credit)::bigint * vat_amount from l where source = 'purchase' and tax_code = 'SR'
  )
  select box, sum(amount)::bigint, sum(vat)::bigint from x group by box
$$;

create or replace function app.vat_box_lines(p_tax_period_id uuid, p_box text)
returns table (entry_date date, journal_id uuid, journal_no text, source public.journal_source, memo text, description text,
               tax_code text, amount bigint, vat bigint)
language plpgsql stable security definer set search_path = '' as $$
declare tp public.tax_periods := app.vat_return_period(p_tax_period_id);
begin
  perform app.require(tp.organization_id, 'view');
  return query
  with l as (
    select j.entry_date, j.id, j.journal_no, app.vat_source(j.source, j.reversal_of) as source, j.memo, ln.description, ln.tax_code, ln.line_no,
           coalesce(ln.supply_emirate, o.emirate_code) as emirate, ln.debit, ln.credit, ln.vat_amount
    from public.journal_lines ln
    join public.journals j on j.id = ln.journal_id
    join public.organizations o on o.id = ln.organization_id
    where ln.organization_id = tp.organization_id and j.status in ('posted', 'reversed') and j.entry_date between tp.start_date and tp.end_date
      and ln.tax_code is not null and app.vat_source(j.source, j.reversal_of) in ('sale', 'purchase', 'receipt', 'payment')
  )
  select l.entry_date, l.id, l.journal_no, l.source, l.memo, l.description, l.tax_code,
         (case when l.source in ('sale', 'receipt', 'payment') then l.credit - l.debit else l.debit - l.credit end)::bigint,
         (case when l.tax_code in ('ZR', 'EX') then 0
               else (case when l.source in ('sale', 'receipt', 'payment') then sign(l.credit - l.debit) else sign(l.debit - l.credit) end)::bigint * l.vat_amount end)::bigint
  from l left join public.emirates e on e.code = l.emirate
  where (l.source in ('sale', 'receipt', 'payment') and ((l.tax_code = 'SR' and e.vat_box = p_box) or (l.tax_code = 'ZR' and p_box = '4') or (l.tax_code = 'EX' and p_box = '5')))
     or (l.source = 'purchase' and ((l.tax_code = 'RCS' and p_box in ('3', '10')) or (l.tax_code = 'IMG' and p_box in ('6', '10'))
                                    or (l.tax_code = 'SR' and p_box = '9')))
  order by l.entry_date, l.journal_no, l.line_no;
end $$;

create or replace function app.vat_reconciliation(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.vat_return_period(p_tax_period_id);
  r public.vat_returns;
  v_boxes jsonb;
  mv record;
begin
  perform app.require(tp.organization_id, 'view');
  select * into r from public.vat_returns where tax_period_id = tp.id;
  v_boxes := case when r.status in ('approved', 'filed') then r.snapshot -> 'boxes'
                  else (select jsonb_agg(to_jsonb(b)) from app.vat201_boxes(tp.organization_id, tp.start_date, tp.end_date, r.id) b) end;
  select
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_output'), 0)::bigint as out_,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_output_rc'), 0)::bigint as out_rc,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_input'), 0)::bigint as in_,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_input_rc'), 0)::bigint as in_rc
  into mv
  from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
  where l.organization_id = tp.organization_id and j.status in ('posted', 'reversed') and j.source <> 'vat'
    and j.entry_date between tp.start_date and tp.end_date;
  return jsonb_build_object(
    'rows', jsonb_build_array(
      jsonb_build_object('group', 'Output VAT — boxes 1a–1g', 'account', '2100',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' ~ '^1[a-g]$'), 'ledger', -mv.out_),
      jsonb_build_object('group', 'Reverse charge output — boxes 3 + 6', 'account', '2110',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' in ('3', '6')), 'ledger', -mv.out_rc),
      jsonb_build_object('group', 'Input VAT — box 9', 'account', '1300',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '9'), 'ledger', mv.in_),
      jsonb_build_object('group', 'Reverse charge input — box 10', 'account', '1310',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '10'), 'ledger', mv.in_rc)),
    'box14', (select (b ->> 'vat')::bigint from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '14'),
    'ledger_net', -(mv.out_ + mv.out_rc + mv.in_ + mv.in_rc),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('box_code', box_code, 'amount', amount, 'vat', vat, 'adjustment', adjustment, 'reason', reason))
                             from public.vat_return_adjustments where vat_return_id = r.id), '[]'),
    'other_postings', coalesce((select jsonb_agg(jsonb_build_object('entry_date', j.entry_date, 'journal_no', j.journal_no, 'source', j.source, 'memo', j.memo,
                                  'account', a.code, 'amount', l.debit - l.credit) order by j.entry_date, j.journal_no)
                                from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
                                where l.organization_id = tp.organization_id and j.status in ('posted', 'reversed') and j.source not in ('sale', 'purchase', 'vat')
                                  and j.entry_date between tp.start_date and tp.end_date
                                  and not (app.vat_source(j.source, j.reversal_of) in ('receipt', 'payment')     -- advance VAT is in the boxes (D-58)
                                           and exists (select 1 from public.journal_lines t where t.journal_id = j.id and t.tax_code is not null))
                                  and a.subtype in ('vat_output', 'vat_output_rc', 'vat_input', 'vat_input_rc')), '[]'),
    'clearing_journal', (select jsonb_build_object('id', j.id, 'journal_no', j.journal_no, 'entry_date', j.entry_date,
                           'amount', (select sum(l.credit - l.debit) from public.journal_lines l join public.accounts a on a.id = l.account_id
                                      where l.journal_id = j.id and a.subtype = 'vat_payable'))
                         from public.journals j where j.id = r.clearing_journal_id));
end $$;

-- ── Integrity: 1170 ties to the advances ────────────────────────────────────────────────

create or replace function app.integrity_check_org(p_org uuid, p_trigger text, p_by uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid;
  v_today date := current_date;
  v_dr bigint; v_cr bigint;
  v_n int; v_a bigint; v_b bigint; v_txt text;
  r record;
begin
  create temp table if not exists _ic (code text, label text, status public.integrity_status, detail text) on commit drop;
  truncate _ic;

  -- 1. Trial balance and every posted journal balance (Principle 2)
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0) into v_dr, v_cr
    from public.journal_lines l join public.journals j on j.id = l.journal_id
   where l.organization_id = p_org and j.status in ('posted', 'reversed');
  insert into _ic values ('tb_balanced', 'Trial balance: total debits = total credits', case when v_dr = v_cr then 'ok' else 'error' end::public.integrity_status,
    case when v_dr <> v_cr then format('Debits %s, credits %s', app.aed_text(v_dr), app.aed_text(v_cr)) end);
  select count(*) into v_n from (select j.id from public.journals j join public.journal_lines l on l.journal_id = j.id
     where j.organization_id = p_org and j.status in ('posted', 'reversed') group by j.id having sum(l.debit) <> sum(l.credit) or count(*) < 2) x;
  insert into _ic values ('journals_balanced', 'Every posted journal balances and has 2+ lines', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s journal(s) out of balance', v_n) end);

  -- 2. Sub-ledgers = control accounts (ARAP-02/03, D-11, D-36)
  select coalesce(sum(open_aed), 0) into v_a from public.ageing(p_org, 'customer', v_today);
  v_b := app.gl_subtype_balance(p_org, 'receivable', v_today);
  insert into _ic values ('ar_control', 'Open customer invoices = Trade receivables account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Open invoices %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  select coalesce(sum(open_aed), 0) into v_a from public.ageing(p_org, 'supplier', v_today);
  v_b := -app.gl_subtype_balance(p_org, 'payable', v_today);
  insert into _ic values ('ap_control', 'Open supplier bills = Trade payables account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Open bills %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  v_a := app.credits_total(p_org, 'customer_receipt');
  v_b := -app.gl_subtype_balance(p_org, 'customer_credits', v_today);
  insert into _ic values ('credits_control', 'Unused customer credits = Customer Credits account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Credits %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);
  v_a := app.credits_total(p_org, 'supplier_payment');
  v_b := app.gl_subtype_balance(p_org, 'supplier_advances', v_today);
  insert into _ic values ('advances_control', 'Unused supplier advances = Supplier advances account', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Advances %s, ledger %s', app.aed_text(v_a), app.aed_text(v_b)) end);

  -- 3. Every posted document has its posted journal, with the same total on the control account
  select count(*) into v_n from public.sales_invoices i
   where i.organization_id = p_org and i.status = 'posted'
     and coalesce((select sum(l.debit + l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
                    join public.accounts a on a.id = l.account_id
                   where l.journal_id = i.journal_id and a.subtype = 'receivable' and j.status in ('posted', 'reversed')), -1) <> i.gross_total;
  insert into _ic values ('sales_journals', 'Every posted sales invoice / credit note matches its journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s document(s) differ from their journal', v_n) end);
  select count(*) into v_n from public.purchase_bills b
   where b.organization_id = p_org and b.status = 'posted'
     and coalesce((select sum(l.debit + l.credit) from public.journal_lines l join public.journals j on j.id = l.journal_id
                    join public.accounts a on a.id = l.account_id
                   where l.journal_id = b.journal_id and a.subtype = 'payable' and j.status in ('posted', 'reversed')), -1) <> b.payable_total;
  insert into _ic values ('purchase_journals', 'Every posted bill / debit note matches its journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s document(s) differ from their journal', v_n) end);
  select count(*) into v_n from public.payments p left join public.journals j on j.id = p.journal_id
   where p.organization_id = p_org and p.status = 'posted' and (j.id is null or j.status not in ('posted', 'reversed'));
  insert into _ic values ('payment_journals', 'Every posted receipt / payment has its posted journal', case when v_n = 0 then 'ok' else 'error' end::public.integrity_status,
    case when v_n > 0 then format('%s receipt(s)/payment(s) without a posted journal', v_n) end);

  -- 4. Sequential numbering without gaps (D-22 · FTA)
  v_txt := concat_ws('; ',
    'Invoices: ' || app.number_gaps(array(select invoice_no from public.sales_invoices where organization_id = p_org and doc_type = 'invoice' and invoice_no is not null and not is_opening)),
    'Credit notes: ' || app.number_gaps(array(select invoice_no from public.sales_invoices where organization_id = p_org and doc_type = 'credit_note' and invoice_no is not null)),
    'Journals: ' || app.number_gaps(array(select journal_no from public.journals where organization_id = p_org and journal_no is not null)),
    'Receipts: ' || app.number_gaps(array(select payment_no from public.payments where organization_id = p_org and payment_no like 'RCPT%')),
    'Payments: ' || app.number_gaps(array(select payment_no from public.payments where organization_id = p_org and payment_no like 'PAY%')));
  insert into _ic values ('numbering', 'Document numbers run without gaps', case when v_txt = '' then 'ok' else 'error' end::public.integrity_status, nullif(v_txt, ''));

  -- 5. Bank (warnings): lines waiting to be matched for over 30 days; last month-end not reconciled
  select count(*) into v_n from public.bank_transactions where organization_id = p_org and status = 'unmatched' and txn_date < v_today - 30;
  insert into _ic values ('bank_unmatched', 'No bank lines left unmatched for more than 30 days', case when v_n = 0 then 'ok' else 'warning' end::public.integrity_status,
    case when v_n > 0 then format('%s bank line(s) older than 30 days are not matched', v_n) end);
  v_txt := null;
  for r in select ba.name, (select max(period_end) from public.bank_reconciliations rc where rc.bank_account_id = ba.id and rc.status = 'posted') as rec_to
             from public.bank_accounts ba
            where ba.organization_id = p_org and ba.is_active
              and exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.txn_date <= (date_trunc('month', v_today) - interval '1 day')::date) loop
    if r.rec_to is null or r.rec_to < (date_trunc('month', v_today) - interval '1 day')::date then
      v_txt := concat_ws('; ', v_txt, format('%s: %s', r.name, coalesce('reconciled to ' || to_char(r.rec_to, 'DD Mon YYYY'), 'never reconciled')));
    end if;
  end loop;
  -- D-52: the opening balance clearing account must be emptied by the opening documents
  v_a := (select coalesce(sum(app.advance_vat_left(p.id)), 0) from public.payments p where p.organization_id = p_org and p.vat_advance)::bigint;
  v_b := app.gl_subtype_balance(p_org, 'vat_advance', '9999-12-31');
  insert into _ic values ('advance_vat', 'VAT on customer advances (1170) = VAT on advances not yet used (D-58)', case when v_a = v_b then 'ok' else 'error' end::public.integrity_status,
    case when v_a <> v_b then format('Advances %s, account 1170 %s', app.aed_text(v_a), app.aed_text(v_b)) end);

  v_b := app.gl_subtype_balance(p_org, 'opening_clearing', '9999-12-31');
  insert into _ic values ('opening_clearing', 'Opening balance clearing (3999) is zero', case when v_b = 0 then 'ok' else 'warning' end::public.integrity_status,
    case when v_b <> 0 then format('3999 still holds %s — enter the remaining opening invoices/bills or correct the opening journal', app.aed_text(v_b)) end);
  insert into _ic values ('bank_reconciled', 'Bank accounts reconciled to the last month-end', case when v_txt is null then 'ok' else 'warning' end::public.integrity_status, v_txt);

  insert into public.integrity_runs (organization_id, trigger, triggered_by, status, errors, warnings)
  select p_org, p_trigger, p_by,
         case when count(*) filter (where status = 'error') > 0 then 'error' when count(*) filter (where status = 'warning') > 0 then 'warning' else 'ok' end::public.integrity_status,
         count(*) filter (where status = 'error'), count(*) filter (where status = 'warning')
  from _ic
  returning id into v_run;
  insert into public.integrity_results (run_id, organization_id, check_code, label, status, detail)
  select v_run, p_org, code, label, status, detail from _ic;
  return v_run;
end $$;

grant execute on function app.sr_rate(date), app.advance_vat_left(uuid), app.advance_vat_share(uuid, bigint), app.vat_source(public.journal_source, uuid) to authenticated;
