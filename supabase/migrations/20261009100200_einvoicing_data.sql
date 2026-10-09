-- P4-02 → P4-05 · E-invoicing data for PINT AE Billing 1.0.4 (UAE Peppol Authority) · D-59, D-60.
-- Only data is added here; documents are still saved and posted exactly as before. What PINT AE needs and is missing
-- is shown by the "E-invoice ready?" check (poc/src/lib/einvoice-ready.ts); the official rules make the final check.
--   • Client: structured address (line 1/2, city; emirate already), legal registration type (TL/EID/PAS/CD — IBR-173-AE;
--     licence_no and licence_authority are the identifier and its authority), IBAN and default payment means (UNCL4461).
--   • Customer: customer type — business / government / consumer (consumers are B2C: not e-invoiced, D-59); structured
--     address (region for foreign customers); registration type / ID / authority / passport country; Peppol endpoint (default: TIN from the TRN, scheme
--     0235) or "not yet on Peppol" (predefined endpoint 9900000098, MoF guidelines).
--   • Items list (D-60): goods / services / both with HS code and/or service accounting code (IBR-184/185/186-AE),
--     unit (UN/ECE Rec 20), default price, tax code (+ exemption reason for EX, IBR-167-AE), income account.
--   • Invoice lines keep the item's codes as they were when the invoice was saved (the item may change later).
--   • Invoices / credit notes: UUID (BTAE-07), transaction type (BTAE-02, 8 flags), payment means, credit note reason
--     (BTAE-03, IBR-001-AE list), Incoterms (exports, BTAE-22).

-- ── Client e-invoicing profile (P4-02) ──────────────────────────────────────────────────
alter table public.organizations
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column reg_type text not null default 'TL' check (reg_type in ('TL', 'EID', 'PAS', 'CD')),
  add column iban text check (iban is null or iban ~ '^AE[0-9]{21}$'),
  add column bank_name text,
  add column payment_means_code text not null default '30' check (payment_means_code ~ '^[0-9A-Z]{1,3}$');
grant update (address_line1, address_line2, city, reg_type, iban, bank_name, payment_means_code) on public.organizations to authenticated;

-- ── Customer e-invoicing data (P4-03) ───────────────────────────────────────────────────
alter table public.contacts
  add column customer_type text not null default 'business' check (customer_type in ('business', 'government', 'consumer')),
  add column address_line1 text,
  add column city text,
  add column region text,                                      -- state / province of a foreign customer (IBR-144-AE)
  add column reg_type text check (reg_type in ('TL', 'CL', 'EID', 'PAS', 'CD')),
  add column reg_id text,
  add column reg_authority text,
  add column passport_country char(2) check (passport_country ~ '^[A-Z]{2}$'),
  add column peppol_scheme text not null default '0235' check (peppol_scheme ~ '^[0-9]{4}$'),
  add column peppol_id text check (peppol_id is null or btrim(peppol_id) <> ''),
  add column einv_not_onboarded boolean not null default false;
grant insert (customer_type, address_line1, city, region, reg_type, reg_id, reg_authority, passport_country, peppol_scheme, peppol_id, einv_not_onboarded)
  on public.contacts to authenticated;
grant update (customer_type, address_line1, city, region, reg_type, reg_id, reg_authority, passport_country, peppol_scheme, peppol_id, einv_not_onboarded)
  on public.contacts to authenticated;

-- ── Items list (P4-04, D-60) ────────────────────────────────────────────────────────────
create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text,                                                   -- the seller's own item code (optional, IBT-155)
  name text not null check (btrim(name) <> ''),
  description text,
  item_type char(1) not null default 'S' check (item_type in ('G', 'S', 'B')),
  hs_code text check (hs_code is null or hs_code ~ '^[0-9A-Za-z.]{1,20}$'),
  sac_code text check (sac_code is null or sac_code ~ '^[0-9A-Za-z.]{1,20}$'),
  unit_code text not null default 'H87' check (unit_code ~ '^[A-Z0-9]{2,3}$'),
  default_price bigint check (default_price is null or default_price > 0),
  tax_code text not null default 'SR' references public.tax_codes (code) on delete restrict,
  exemption_reason text check (exemption_reason in ('DL8.46.1', 'DL8.46.2', 'DL8.46.3', 'DL8.46.4')),
  income_account_id uuid,
  is_active boolean not null default true,
  unique (id, organization_id),
  foreign key (income_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  check (tax_code in ('SR', 'ZR', 'EX', 'OS')),
  check (item_type = 'S' or hs_code is not null),              -- goods need an HS code (IBR-184/186-AE)
  check (item_type = 'G' or sac_code is not null),             -- services need a service accounting code (IBR-185/186-AE)
  check (tax_code <> 'EX' or exemption_reason is not null)     -- IBR-167-AE
);
select app.setup_table('public.items');
create unique index items_unique_name on public.items (organization_id, lower(btrim(name)));
create index items_income_account_idx on public.items (income_account_id, organization_id);
create index items_tax_code_idx on public.items (tax_code);
create policy mfa on public.items as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.items for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.items for insert to authenticated with check (organization_id in (select app.orgs_with('prepare')));
create policy upd on public.items for update to authenticated
  using (organization_id in (select app.orgs_with('prepare'))) with check (organization_id in (select app.orgs_with('prepare')));
grant select on public.items to authenticated;
grant insert (id, organization_id, code, name, description, item_type, hs_code, sac_code, unit_code, default_price, tax_code, exemption_reason,
  income_account_id, is_active) on public.items to authenticated;
grant update (code, name, description, item_type, hs_code, sac_code, unit_code, default_price, tax_code, exemption_reason,
  income_account_id, is_active) on public.items to authenticated;

-- ── Document fields (P4-05) ─────────────────────────────────────────────────────────────
alter table public.sales_invoice_lines
  add column item_id uuid,
  add column unit_code text check (unit_code ~ '^[A-Z0-9]{2,3}$'),
  add column item_type char(1) check (item_type in ('G', 'S', 'B')),
  add column hs_code text,
  add column sac_code text,
  add column exemption_reason text check (exemption_reason in ('DL8.46.1', 'DL8.46.2', 'DL8.46.3', 'DL8.46.4')),
  add constraint sales_invoice_lines_item_fk foreign key (item_id, organization_id) references public.items (id, organization_id) on delete restrict;
create index sales_invoice_lines_item_idx on public.sales_invoice_lines (item_id, organization_id);

alter table public.sales_invoices
  add column einv_uuid uuid not null default gen_random_uuid() unique,
  add column transaction_type text not null default '00000000' check (transaction_type ~ '^[01]{8}$'),
  add column payment_means_code text check (payment_means_code is null or payment_means_code ~ '^[0-9A-Z]{1,3}$'),
  add column credit_reason_code text check (credit_reason_code in ('DL8.61.1.A', 'DL8.61.1.B', 'DL8.61.1.C', 'DL8.61.1.D', 'DL8.61.1.E', 'VD')),
  add column incoterms text check (incoterms is null or incoterms ~ '^[A-Z]{3}$'),
  add constraint sales_invoices_credit_reason check (credit_reason_code is null or doc_type = 'credit_note');

-- ── Saving an invoice keeps the e-invoicing fields and the item's codes ─────────────────
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
  v_item public.items;
  v_tt text := coalesce(nullif(p_doc ->> 'transaction_type', ''), '00000000');
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
           supply_emirate, currency, fx_rate, customer_reference, notes, prepared_by, prices_include_vat,
           transaction_type, payment_means_code, credit_reason_code, incoterms)
    values (p_organization_id, v_type, v_orig.id, v_contact.id, v_issue, v_due, (p_doc ->> 'supply_date')::date,
            v_emirate, v_currency, app.fx_rate(v_currency, v_issue), nullif(btrim(p_doc ->> 'customer_reference'), ''),
            nullif(btrim(p_doc ->> 'notes'), ''), v_uid, v_incl,
            v_tt, nullif(p_doc ->> 'payment_means_code', ''), nullif(p_doc ->> 'credit_reason_code', ''), nullif(upper(btrim(p_doc ->> 'incoterms')), ''))
    returning id into v_id;
  else
    update public.sales_invoices set doc_type = v_type, original_invoice_id = v_orig.id, contact_id = v_contact.id, issue_date = v_issue,
           due_date = v_due, supply_date = (p_doc ->> 'supply_date')::date, supply_emirate = v_emirate, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_issue), customer_reference = nullif(btrim(p_doc ->> 'customer_reference'), ''),
           notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid,
           prices_include_vat = v_incl, transaction_type = v_tt, payment_means_code = nullif(p_doc ->> 'payment_means_code', ''),
           credit_reason_code = nullif(p_doc ->> 'credit_reason_code', ''), incoterms = nullif(upper(btrim(p_doc ->> 'incoterms')), '')
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Invoice not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.sales_invoice_lines where sales_invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_doc -> 'lines') loop
    v_n := v_n + 1;
    v_item := null;
    if nullif(v_line ->> 'item_id', '') is not null then                                         -- P4-04: codes from the item
      select * into v_item from public.items where id = (v_line ->> 'item_id')::uuid and organization_id = p_organization_id;
      if v_item.id is null or not v_item.is_active then
        raise exception 'Line %: choose an active item of this client', v_n using errcode = 'check_violation';
      end if;
    end if;
    select * into v_acc from public.accounts where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id;
    if v_acc.id is null or v_acc.type <> 'revenue' or v_acc.is_control or not v_acc.is_active then
      raise exception 'Line %: choose an active income account', v_n using errcode = 'check_violation';
    end if;
    insert into public.sales_invoice_lines (sales_invoice_id, organization_id, line_no, description, quantity, unit_price, account_id, tax_code,
           item_id, unit_code, item_type, hs_code, sac_code, exemption_reason)
    values (v_id, p_organization_id, v_n, btrim(v_line ->> 'description'), (v_line ->> 'quantity')::numeric,
            (v_line ->> 'unit_price')::bigint, v_acc.id, v_line ->> 'tax_code',
            v_item.id, coalesce(nullif(v_line ->> 'unit_code', ''), v_item.unit_code), v_item.item_type, v_item.hs_code, v_item.sac_code,
            coalesce(nullif(v_line ->> 'exemption_reason', ''), case when v_line ->> 'tax_code' = 'EX' then v_item.exemption_reason end));                          -- "100.5" fils is refused
  end loop;
  perform app.recalc_sales_invoice(v_id);
  perform app.set_ctx(null);
  return v_id;
end $$;
