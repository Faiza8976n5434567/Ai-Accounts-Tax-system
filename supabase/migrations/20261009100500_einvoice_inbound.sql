-- P4-08 · Received e-invoices → draft purchase bills (manual for every ASP, D-63). Staff download the supplier's PINT AE
-- file from the client's ASP portal and upload it; the app reads it, the preparer reviews it, and this function creates
-- the draft bill (or debit note, for a supplier's credit note) and keeps the original file permanently, once per e-invoice
-- UUID. The bill then follows the normal review → maker-checker approval → posting (D-31 … D-33, D-46).

create table public.einvoice_inbound (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  purchase_bill_id uuid not null,
  einv_uuid uuid not null,                                    -- BTAE-07 of the supplier's document
  doc_kind text not null check (doc_kind in ('invoice', 'creditnote')),
  document_number text not null,
  supplier_trn text,
  xml text not null check (octet_length(xml) <= 2000000),
  xml_sha256 text not null check (xml_sha256 ~ '^[0-9a-f]{64}$'),
  imported_by uuid not null references public.profiles (id) on delete restrict,
  imported_at timestamptz not null default now(),
  unique (organization_id, einv_uuid),
  foreign key (purchase_bill_id, organization_id) references public.purchase_bills (id, organization_id) on delete restrict
);
select app.setup_table('public.einvoice_inbound');
create index einvoice_inbound_bill_idx on public.einvoice_inbound (purchase_bill_id, organization_id);
create index einvoice_inbound_imported_by_idx on public.einvoice_inbound (imported_by);
create policy mfa on public.einvoice_inbound as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.einvoice_inbound for select to authenticated using (organization_id in (select app.orgs_with('view')));
grant select on public.einvoice_inbound to authenticated;

create or replace function app.einvoice_inbound_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Received e-invoices are a permanent record' using errcode = 'insufficient_privilege'; end if;
  if app.ctx() is distinct from 'einvoice_inbound' then raise exception 'Use Purchase bills → Import e-invoice' using errcode = 'insufficient_privilege'; end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.einvoice_inbound for each row execute function app.einvoice_inbound_guard();

-- p_meta: {einv_uuid, doc_kind, document_number, supplier_trn, buyer_trn} as read from the file; p_bill: the save_purchase_bill document.
create or replace function app.import_einvoice(p_organization_id uuid, p_xml text, p_meta jsonb, p_bill jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.require(p_organization_id, 'prepare'); v_bill uuid; v_prev text; v_trn text;
begin
  select trn into v_trn from public.organizations where id = p_organization_id;
  if nullif(p_meta ->> 'buyer_trn', '') is distinct from v_trn then
    raise exception 'This e-invoice is addressed to TRN % — not to this client (%)', coalesce(p_meta ->> 'buyer_trn', 'none'), coalesce(v_trn, 'no TRN') using errcode = 'check_violation';
  end if;
  select b.supplier_invoice_no into v_prev from public.einvoice_inbound i join public.purchase_bills b on b.id = i.purchase_bill_id
   where i.organization_id = p_organization_id and i.einv_uuid = (p_meta ->> 'einv_uuid')::uuid;
  if v_prev is not null then raise exception 'This e-invoice was already imported (supplier document %)', v_prev using errcode = 'unique_violation'; end if;
  v_bill := app.save_purchase_bill(null, p_organization_id, p_bill || jsonb_build_object('shows_recipient_details', true, 'has_tax_invoice_heading', true));
  perform app.set_ctx('einvoice_inbound');
  insert into public.einvoice_inbound (organization_id, purchase_bill_id, einv_uuid, doc_kind, document_number, supplier_trn, xml, xml_sha256, imported_by)
  values (p_organization_id, v_bill, (p_meta ->> 'einv_uuid')::uuid, p_meta ->> 'doc_kind', p_meta ->> 'document_number', nullif(p_meta ->> 'supplier_trn', ''),
          p_xml, encode(sha256(convert_to(p_xml, 'UTF8')), 'hex'), v_uid);
  perform app.set_ctx(null);
  return v_bill;
end $$;

grant execute on function app.import_einvoice(uuid, text, jsonb, jsonb) to authenticated;
create function public.import_einvoice(p_organization_id uuid, p_xml text, p_meta jsonb, p_bill jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app.import_einvoice(p_organization_id, p_xml, p_meta, p_bill) $$;
revoke all on function public.import_einvoice(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_einvoice(uuid, text, jsonb, jsonb) to authenticated;
