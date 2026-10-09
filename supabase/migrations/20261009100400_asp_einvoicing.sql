-- D-63 (Faizan, 2026-10-09) · Any accredited ASP, chosen per client. The app produces and validates the PINT AE file
-- (P4-06); every accredited ASP must accept that standard file. Today the hand-off is manual for every ASP: staff upload
-- the file to the client's ASP portal and record the ASP's reference and its answer here (sent → accepted / rejected,
-- with the reason). Rejected documents form the rejection queue; after fixing the data they are sent again (a new
-- attempt). Automatic API connectors are added one ASP at a time later (asp_providers.connector 'api:<name>').
-- D-64 · The e-invoice fields of a line (goods / services, HS or service code, unit, exemption reason) fill in from the
-- item but may be set or changed on the line itself — an item is optional.

-- ── The official list (MoF eInvoicing Accredited Service Providers page, read 2026-10-09) ──────────
create table public.asp_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  accreditation_no text unique,
  website text,
  status text not null check (status in ('accredited', 'final_assessment', 'withdrawn')),
  connector text not null default 'manual' check (connector ~ '^(manual|api:[a-z0-9_-]+)$'),
  verified_on date not null default '2026-10-09',
  check (status <> 'accredited' or accreditation_no is not null)
);
select app.setup_table('public.asp_providers');
create policy mfa on public.asp_providers as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.asp_providers for select to authenticated using (true);
create policy ins on public.asp_providers for insert to authenticated with check ((select app.is_super_admin()));
create policy upd on public.asp_providers for update to authenticated using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
grant select on public.asp_providers to authenticated;
grant insert (name, accreditation_no, website, status, connector, verified_on) on public.asp_providers to authenticated;
grant update (name, accreditation_no, website, status, connector, verified_on) on public.asp_providers to authenticated;

insert into public.asp_providers (name, accreditation_no, website, status) values
  ('Advintek Consulting Services LLC', '196766', 'https://www.einvoice.advintek.ae', 'accredited'),
  ('Ardentax IT Solutions - FZCO', '189050', 'https://www.ardentaxit.tax', 'accredited'),
  ('Azentio Software Orion (Middle East) FZ-LLC', '141846', 'https://www.azentio.com', 'accredited'),
  ('BBIT Accqrate Technology FZCO', '101071', 'https://www.bbit-accqrate.com/ae/en', 'accredited'),
  ('BDO Digital Solutions FZ-LLC', '185520', 'https://www.bdo.ae', 'accredited'),
  ('Bee Aura Tech FZ LLC', '179804', 'https://www.bauratec.com', 'accredited'),
  ('Casim L.L.C-FZ', '178533', 'https://www.casim.ae', 'accredited'),
  ('Citytech Software', '164921', 'https://www.citytechme.com', 'accredited'),
  ('Cloud Consulting LLC-FZ (DocFlow)', '181172', 'https://www.docflow.ae', 'accredited'),
  ('Comarch Middle East FZ LLC', '110668', 'https://www.comarch.com', 'accredited'),
  ('Complyance Electronics L.L.C', '112219', 'https://www.complyance.io', 'accredited'),
  ('Covoro AI – FZCO', '142208', 'https://www.covoro.ai/uae', 'accredited'),
  ('Cygnet Digital IT Solutions L.L.C', '101139', 'https://www.cygnet.one', 'accredited'),
  ('Dariba Technologies LLC', '158550', 'https://www.daribatech.com', 'accredited'),
  ('Data Hub Integrated Solutions Moro LLC', '129478', 'https://www.morohub.com/en', 'accredited'),
  ('Defmacro Software DMCC (ClearTax)', '163162', 'https://www.cleartax.com/ae', 'accredited'),
  ('Deloitte & Touche - M E', '123513', 'https://www.deloitte.com/middle-east/en.html', 'accredited'),
  ('DP World Digital GCC FZE', '117846', 'https://www.einvoicing.dpworld.com', 'accredited'),
  ('EDICOM Middle East Services', '102434', 'https://www.edicomgroup.com', 'accredited'),
  ('EY Consulting LLC', '165308', 'https://www.ey.com', 'accredited'),
  ('Flick Network L.L.C', '138271', 'https://www.flick.network/en', 'accredited'),
  ('Focus Softnet', '134577', 'https://www.focussoftnet.com', 'accredited'),
  ('Fynamics Techno Solutions – FZCO', '159905', 'https://www.fynamicstax.com/uae', 'accredited'),
  ('Hamt Information Technology L.L.C (EVATRA)', '144576', 'https://www.hlbhamt.com', 'accredited'),
  ('Hamwi Computer Software', '131375', 'https://www.fatorly.com', 'accredited'),
  ('Infinite IT Solutions FZCO', '171157', 'https://www.infinite-it.com', 'accredited'),
  ('Information Dynamics LLC', '187021', 'https://www.infodynamic.net', 'accredited'),
  ('InvoiceNow biz - F.Z.C', '184465', 'https://www.invoicenow.biz', 'accredited'),
  ('InvoiceQ For Information Technology Limited', '114413', 'https://www.ae.invoiceq.com', 'accredited'),
  ('KGRN Chartered Accountants', '120915', 'https://www.kgrnaudit.com', 'accredited'),
  ('KPI Suitetech DMCC', '142349', 'https://www.kpi.co', 'accredited'),
  ('LightIdea Information Technology L.L.C', '111062', 'https://www.lightidea.org', 'accredited'),
  ('Mac & Ross Chartered Accountants LLC', '130476', 'https://www.macnross.com', 'accredited'),
  ('Marmin AI Software Design LLC', '160945', 'https://www.marmin.ai', 'accredited'),
  ('McBitss Technologies CO LLC SOC', '143578', 'https://www.mcbitss.com', 'accredited'),
  ('Microvista Technologies LLC', '157529', 'https://www.microvistatech.com', 'accredited'),
  ('Moore JFC Consulting LLC', '158006', 'https://www.moorejfcgroup.com', 'accredited'),
  ('Namiri Technology Services L.L.C', '104802', 'https://www.digitax.tech', 'accredited'),
  ('New Age Software Limited', '100511', 'https://www.newage-global.com', 'accredited'),
  ('Orchida Soft Computer Systems LLC', '194498', 'https://www.orchidatax.com', 'accredited'),
  ('Oxinus Holding Limited', '198978', 'https://www.oxinus.holdings', 'accredited'),
  ('PACT Software Services LLC', '129353', 'https://www.pactsoft.com', 'accredited'),
  ('Pagero Gulf FZ-LLC', '153759', 'https://www.pagero.com', 'accredited'),
  ('Ravera EInvoicing Services - FZCO', '199307', 'https://www.ravera.ae', 'accredited'),
  ('RTC Novatech Solutions', '139410', 'https://www.rtcsuite.com', 'accredited'),
  ('SAP Middle East & North Africa LLC', '197202', 'https://www.sap.com', 'accredited'),
  ('Skill Quotient Technologies', '193219', 'https://www.skillquotientgroup.com', 'accredited'),
  ('Spendconsole FZ LLC', '152306', 'https://www.spendconsole.ai', 'accredited'),
  ('SunTec (Xelerate) Business Solutions DMCC', '180240', 'https://www.suntecgroup.com', 'accredited'),
  ('Suntech Business Solutions DMCC', '106799', 'https://www.suntech-global.com', 'accredited'),
  ('Tally Software Solutions FZCO', '162503', 'https://www.tallysolutions.com', 'accredited'),
  ('TAXILLA FINOPS 360 – FZCO', '128546', 'https://www.taxilla.com', 'accredited'),
  ('Tax Star L.L.C-FZ', '175257', 'https://www.taxstar.app', 'accredited'),
  ('Taxlabs.ai', '166926', 'https://www.taxlab.ai', 'accredited'),
  ('Techventures Information Technology Services', '105700', 'https://www.techventuresglobal.com', 'accredited'),
  ('TronStride FZC', '182493', 'https://www.tronstride.com', 'accredited'),
  ('Unified SSK Information Technology L.L.C', '163006', 'https://www.unifiedssk.com', 'accredited'),
  ('VATit Consultant Gulf Ltd', '106062', 'https://www.eezi.io', 'accredited'),
  ('Veutel International FZC LLC', '149302', 'https://www.veutel.com', 'accredited'),
  ('Victorian Fin Technology L.L.C', '126326', 'https://www.victorianuae.com', 'accredited'),
  ('Vostok Trading LLC', '194753', 'https://www.vostok.ae', 'accredited'),
  ('Wafeq FZ-LLC', '129932', 'https://www.wafeq.com/en-ae', 'accredited'),
  ('Webtel Technologies solutions- FZCO', '133108', 'https://www.webtel.in', 'accredited'),
  ('Zennovate IT Solutions', '116145', 'https://www.zennovatesystems.com', 'accredited'),
  ('Zoho Software Trading LLC', '121988', 'https://www.zoho.com', 'accredited'),
  ('Avalara Gulf Technologies LLC', null, 'https://www.avalara.com', 'final_assessment'),
  ('Fyient Line Technology LLC', null, 'https://www.fyient.com', 'final_assessment'),
  ('Global Experts of Information Technology Consultants', null, 'https://www.global-experts.co.uk', 'final_assessment'),
  ('SNB Accounting Management & Tax Consultancy LLC', null, 'https://www.snbconsulting.ae', 'final_assessment'),
  ('UHY James Advisory LLC', null, 'https://www.uhy-ae.com', 'final_assessment');

-- ── The client's ASP (Firm Admin, Edit details / E-invoicing) ──────────────────────────────
alter table public.organizations
  add column asp_provider_id uuid references public.asp_providers (id) on delete restrict,
  add column asp_account_ref text,
  add column asp_status text not null default 'not_started' check (asp_status in ('not_started', 'onboarding', 'sandbox', 'live')),
  add column asp_live_from date;
create index organizations_asp_idx on public.organizations (asp_provider_id);
grant update (asp_provider_id, asp_account_ref, asp_status, asp_live_from) on public.organizations to authenticated;

-- ── Hand-offs to the ASP (one row per attempt; never deleted) ──────────────────────────────
create type public.einvoice_status as enum ('sent', 'accepted', 'rejected');
create table public.einvoice_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  sales_invoice_id uuid not null,
  attempt smallint not null check (attempt > 0),
  channel text not null default 'manual' check (channel in ('manual', 'api')),
  asp_provider_id uuid not null references public.asp_providers (id) on delete restrict,
  xml_sha256 text not null check (xml_sha256 ~ '^[0-9a-f]{64}$'),            -- fingerprint of the exact file handed over
  asp_reference text,
  status public.einvoice_status not null default 'sent',
  rejection_reason text,
  sent_at timestamptz not null default now(),
  sent_by uuid not null references public.profiles (id) on delete restrict,
  result_at timestamptz,
  result_by uuid references public.profiles (id) on delete restrict,
  unique (sales_invoice_id, attempt),
  foreign key (sales_invoice_id, organization_id) references public.sales_invoices (id, organization_id) on delete restrict,
  check ((status = 'rejected') = (rejection_reason is not null)),
  check ((status = 'sent') = (result_at is null))
);
select app.setup_table('public.einvoice_submissions');
create index einvoice_submissions_org_idx on public.einvoice_submissions (organization_id, status);
create index einvoice_submissions_invoice_idx on public.einvoice_submissions (sales_invoice_id, organization_id);
create index einvoice_submissions_asp_idx on public.einvoice_submissions (asp_provider_id);
create index einvoice_submissions_sent_by_idx on public.einvoice_submissions (sent_by);
create index einvoice_submissions_result_by_idx on public.einvoice_submissions (result_by);
create policy mfa on public.einvoice_submissions as restrictive for all to authenticated using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.einvoice_submissions for select to authenticated using (organization_id in (select app.orgs_with('view')));
grant select on public.einvoice_submissions to authenticated;

-- Changed only by the functions below; never deleted (the audit trail of what was handed to the ASP).
create or replace function app.einvoice_submissions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'E-invoice hand-offs are a permanent record' using errcode = 'insufficient_privilege'; end if;
  if app.ctx() is distinct from 'einvoice' then raise exception 'Use the E-invoicing screen to record hand-offs' using errcode = 'insufficient_privilege'; end if;
  if tg_op = 'UPDATE' and old.status <> 'sent' then raise exception 'This answer from the ASP is already recorded' using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.einvoice_submissions for each row execute function app.einvoice_submissions_guard();

-- Records that a posted document's PINT AE file was handed to the client's ASP.
create or replace function app.record_einvoice_sent(p_invoice_id uuid, p_xml_sha256 text, p_asp_reference text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices; o public.organizations; v_uid uuid; v_id uuid;
begin
  select * into inv from public.sales_invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Document not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(inv.organization_id, 'prepare');
  if inv.status <> 'posted' then raise exception 'Approve the document first — only posted documents are e-invoiced' using errcode = 'check_violation'; end if;
  if (select customer_type from public.contacts where id = inv.contact_id) = 'consumer' then
    raise exception 'Consumer (B2C) documents are not e-invoiced (D-59)' using errcode = 'check_violation';
  end if;
  select * into o from public.organizations where id = inv.organization_id;
  if o.asp_provider_id is null then raise exception 'Choose the client''s ASP first (E-invoicing → ASP)' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.einvoice_submissions where sales_invoice_id = inv.id and status in ('sent', 'accepted')) then
    raise exception 'Already handed to the ASP — record its answer, or resend only after a rejection' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('einvoice');
  insert into public.einvoice_submissions (organization_id, sales_invoice_id, attempt, asp_provider_id, xml_sha256, asp_reference, sent_by)
  values (inv.organization_id, inv.id, coalesce((select max(attempt) from public.einvoice_submissions where sales_invoice_id = inv.id), 0) + 1,
          o.asp_provider_id, lower(p_xml_sha256), nullif(btrim(p_asp_reference), ''), v_uid)
  returning id into v_id;
  perform app.set_ctx(null);
  return v_id;
end $$;

-- Records the ASP's answer: accepted (with its reference) or rejected (with the reason).
create or replace function app.record_einvoice_result(p_submission_id uuid, p_status text, p_reason text default null, p_asp_reference text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.einvoice_submissions; v_uid uuid;
begin
  select * into s from public.einvoice_submissions where id = p_submission_id;
  if s.id is null then raise exception 'Hand-off not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(s.organization_id, 'prepare');
  if p_status not in ('accepted', 'rejected') then raise exception 'The answer is accepted or rejected' using errcode = 'check_violation'; end if;
  if p_status = 'rejected' and nullif(btrim(p_reason), '') is null then
    raise exception 'Enter the reason the ASP gave for the rejection' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('einvoice');
  update public.einvoice_submissions set status = p_status::public.einvoice_status, rejection_reason = case when p_status = 'rejected' then btrim(p_reason) end,
         asp_reference = coalesce(nullif(btrim(p_asp_reference), ''), asp_reference), result_at = now(), result_by = v_uid
   where id = s.id;
  perform app.set_ctx(null);
end $$;

grant execute on function app.record_einvoice_sent(uuid, text, text), app.record_einvoice_result(uuid, text, text, text) to authenticated;
create function public.record_einvoice_sent(p_invoice_id uuid, p_xml_sha256 text, p_asp_reference text default null) returns uuid
language sql security invoker set search_path = '' as $$ select app.record_einvoice_sent(p_invoice_id, p_xml_sha256, p_asp_reference) $$;
create function public.record_einvoice_result(p_submission_id uuid, p_status text, p_reason text default null, p_asp_reference text default null) returns void
language sql security invoker set search_path = '' as $$ select app.record_einvoice_result(p_submission_id, p_status, p_reason, p_asp_reference) $$;
revoke all on function public.record_einvoice_sent(uuid, text, text), public.record_einvoice_result(uuid, text, text, text) from public, anon;
grant execute on function public.record_einvoice_sent(uuid, text, text), public.record_einvoice_result(uuid, text, text, text) to authenticated;

-- ── D-64: saving keeps line-level e-invoice fields (item values unless the line sets its own) ──
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
            v_item.id, coalesce(nullif(v_line ->> 'unit_code', ''), v_item.unit_code),                      -- D-64: the line may set or change
            coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type),
            case when coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type) = 'S' then null else coalesce(nullif(btrim(v_line ->> 'hs_code'), ''), v_item.hs_code) end,
            case when coalesce(nullif(v_line ->> 'item_type', ''), v_item.item_type) = 'G' then null else coalesce(nullif(btrim(v_line ->> 'sac_code'), ''), v_item.sac_code) end,
            coalesce(nullif(v_line ->> 'exemption_reason', ''), case when v_line ->> 'tax_code' = 'EX' then v_item.exemption_reason end));                          -- "100.5" fils is refused
  end loop;
  perform app.recalc_sales_invoice(v_id);
  perform app.set_ctx(null);
  return v_id;
end $$;
