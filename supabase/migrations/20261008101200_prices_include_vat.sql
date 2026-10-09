-- D-54 · "Prices include VAT" on sales invoices and credit notes (retail clients: the customer pays a round amount
-- that already contains VAT). Formula F-02 (Spec 03): per line, gross = round-half-up(quantity × unit price);
-- VAT = round-half-up(gross × rate ÷ (10,000 + rate)); net = gross − VAT. A USD line converts the gross to AED
-- first (F-24), then F-02 on the AED gross. Switch off (the default) = unchanged behaviour (F-01 on the net).
-- A credit note follows its invoice unless the draft says otherwise.

alter table public.sales_invoices add column prices_include_vat boolean not null default false;

create or replace function app.sales_line_amounts_gross(p_quantity numeric, p_unit_price bigint, p_tax_code text,
  p_currency text, p_fx numeric, p_on date, out net_fcy bigint, out vat_fcy bigint, out net bigint, out vat bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_rate int := 0; v_key text; v_gross_fcy bigint; v_gross bigint;
begin
  select rate_key into v_key from public.tax_codes where code = p_tax_code;
  if v_key is not null then v_rate := (app.config_value(v_key, p_on) #>> '{}')::int; end if;
  v_gross_fcy := app.round_half_up(p_quantity * p_unit_price);
  vat_fcy := app.round_half_up(v_gross_fcy * v_rate / (10000.0 + v_rate));                         -- F-02
  net_fcy := v_gross_fcy - vat_fcy;
  v_gross := case when p_currency = 'AED' then v_gross_fcy else app.round_half_up(v_gross_fcy * p_fx) end;   -- F-24
  vat := app.round_half_up(v_gross * v_rate / (10000.0 + v_rate));                                -- F-02 on the AED gross
  net := v_gross - vat;
end $$;
revoke all on function app.sales_line_amounts_gross(numeric, bigint, text, text, numeric, date) from public;

create or replace function app.recalc_sales_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices;
begin
  select * into inv from public.sales_invoices where id = p_id;
  update public.sales_invoice_lines l set net_fcy = a.net_fcy, vat_fcy = a.vat_fcy, net = a.net, vat = a.vat
    from public.sales_invoice_lines l2,
         lateral (select * from app.sales_line_amounts(l2.quantity, l2.unit_price, l2.tax_code, inv.currency, inv.fx_rate, inv.issue_date)
                   where not inv.prices_include_vat
                  union all
                  select * from app.sales_line_amounts_gross(l2.quantity, l2.unit_price, l2.tax_code, inv.currency, inv.fx_rate, inv.issue_date)
                   where inv.prices_include_vat) a
   where l.id = l2.id and l.sales_invoice_id = p_id;
  update public.sales_invoices s set
    net_total = coalesce(t.net, 0), vat_total = coalesce(t.vat, 0), gross_total = coalesce(t.net, 0) + coalesce(t.vat, 0),
    gross_total_fcy = coalesce(t.net_fcy, 0) + coalesce(t.vat_fcy, 0)
  from (select sum(net) net, sum(vat) vat, sum(net_fcy) net_fcy, sum(vat_fcy) vat_fcy from public.sales_invoice_lines where sales_invoice_id = p_id) t
  where s.id = p_id;
end $$;

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
  v_incl boolean;
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
  v_incl := coalesce((p_doc ->> 'prices_include_vat')::boolean, v_orig.prices_include_vat, false);   -- D-54
  v_due := coalesce((p_doc ->> 'due_date')::date, v_issue + v_contact.payment_terms_days);                   -- F-13
  if jsonb_typeof(p_doc -> 'lines') is distinct from 'array' or jsonb_array_length(p_doc -> 'lines') = 0 then
    raise exception 'Add at least one line' using errcode = 'check_violation';
  end if;

  perform app.set_ctx('save_sales_invoice');
  if v_id is null then
    insert into public.sales_invoices (organization_id, doc_type, original_invoice_id, contact_id, issue_date, due_date, supply_date,
           supply_emirate, currency, fx_rate, customer_reference, notes, prepared_by, prices_include_vat)
    values (p_organization_id, v_type, v_orig.id, v_contact.id, v_issue, v_due, (p_doc ->> 'supply_date')::date,
            v_emirate, v_currency, app.fx_rate(v_currency, v_issue), nullif(btrim(p_doc ->> 'customer_reference'), ''),
            nullif(btrim(p_doc ->> 'notes'), ''), v_uid, v_incl)
    returning id into v_id;
  else
    update public.sales_invoices set doc_type = v_type, original_invoice_id = v_orig.id, contact_id = v_contact.id, issue_date = v_issue,
           due_date = v_due, supply_date = (p_doc ->> 'supply_date')::date, supply_emirate = v_emirate, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_issue), customer_reference = nullif(btrim(p_doc ->> 'customer_reference'), ''),
           notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid,
           prices_include_vat = v_incl
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
