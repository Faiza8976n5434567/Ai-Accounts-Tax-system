-- P2-07 · Contacts import from the Excel template (Spec 05: one template).
-- All-or-nothing: if any row is invalid nothing is imported and every problem is listed with its row number.
-- Contacts that already exist (same TRN, or same name) are skipped and listed — never changed (Faizan, 2026-10-08).
-- Opening balances and open invoices/bills from an old system wait for the data-migration rules (Q-25).

-- p_rows: [{row, kind, name, trn?, country_code?, emirate_code?, email?, phone?, address?, payment_terms_days?,
--           default_account_code?, default_tax_code?, is_related_party?}]
create or replace function app.import_contacts(p_organization_id uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_row int;
  v_kind text; v_name text; v_trn text; v_cc text; v_em text; v_email text; v_terms text; v_acc_code text; v_tax text;
  v_acc public.accounts;
  v_errors text[] := '{}';
  v_skipped jsonb := '[]';
  v_seen_names text[] := '{}'; v_seen_trns text[] := '{}';
  v_existing uuid;
  v_n int := 0;
begin
  perform app.require(p_organization_id, 'prepare');
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The Contacts sheet has no rows' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'At most 5,000 contacts per import' using errcode = 'check_violation';
  end if;

  -- 1. Check every row first
  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := coalesce((r ->> 'row')::int, 0);
    v_kind := lower(btrim(coalesce(r ->> 'kind', '')));
    v_name := btrim(coalesce(r ->> 'name', ''));
    v_trn := nullif(btrim(coalesce(r ->> 'trn', '')), '');
    v_cc := upper(coalesce(nullif(btrim(r ->> 'country_code'), ''), 'AE'));
    v_em := upper(nullif(btrim(coalesce(r ->> 'emirate_code', '')), ''));
    v_email := nullif(btrim(coalesce(r ->> 'email', '')), '');
    v_terms := nullif(btrim(coalesce(r ->> 'payment_terms_days', '')), '');
    v_acc_code := nullif(btrim(coalesce(r ->> 'default_account_code', '')), '');
    v_tax := upper(nullif(btrim(coalesce(r ->> 'default_tax_code', '')), ''));
    if v_name = '' then v_errors := v_errors || format('Row %s: the name is missing', v_row); end if;
    if v_kind not in ('customer', 'supplier', 'both') then v_errors := v_errors || format('Row %s: type must be Customer, Supplier or Both', v_row); end if;
    if v_trn is not null and v_trn !~ '^1[0-9]{14}$' then v_errors := v_errors || format('Row %s: TRN must be 15 digits starting with 1', v_row); end if;
    if v_cc !~ '^[A-Z]{2}$' then v_errors := v_errors || format('Row %s: country must be a 2-letter code (e.g. AE)', v_row); end if;
    if v_em is not null and (v_cc <> 'AE' or not exists (select 1 from public.emirates where code = v_em)) then
      v_errors := v_errors || format('Row %s: emirate must be AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ (UAE contacts only)', v_row);
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_errors := v_errors || format('Row %s: the email address is not valid', v_row); end if;
    if v_terms is not null and (v_terms !~ '^[0-9]{1,3}$' or v_terms::int > 365) then v_errors := v_errors || format('Row %s: payment terms must be 0–365 days', v_row); end if;
    if v_tax is not null and not exists (select 1 from public.tax_codes where code = v_tax) then v_errors := v_errors || format('Row %s: unknown tax code %s', v_row, v_tax); end if;
    if v_acc_code is not null then
      select * into v_acc from public.accounts where organization_id = p_organization_id and code = v_acc_code;
      if v_acc.id is null or not v_acc.is_active or v_acc.is_control
         or (v_kind = 'customer' and v_acc.type <> 'revenue') or (v_kind = 'supplier' and v_acc.type not in ('expense', 'asset')) then
        v_errors := v_errors || format('Row %s: default account %s is not an active %s account of this client', v_row, v_acc_code,
                                       case v_kind when 'customer' then 'income' when 'supplier' then 'expense or asset' else 'income, expense or asset' end);
      end if;
    end if;
    if v_name <> '' and lower(v_name) = any (v_seen_names) then v_errors := v_errors || format('Row %s: %s appears twice in the file', v_row, v_name); end if;
    if v_trn is not null and v_trn = any (v_seen_trns) then v_errors := v_errors || format('Row %s: TRN %s appears twice in the file', v_row, v_trn); end if;
    v_seen_names := v_seen_names || lower(v_name);
    if v_trn is not null then v_seen_trns := v_seen_trns || v_trn; end if;
  end loop;
  if cardinality(v_errors) > 0 then
    raise exception 'Nothing was imported — please correct: %', array_to_string(v_errors[1:15], '; ')
      || case when cardinality(v_errors) > 15 then format(' (and %s more)', cardinality(v_errors) - 15) else '' end
      using errcode = 'check_violation';
  end if;

  -- 2. Insert the new ones; skip (never change) existing contacts
  perform set_config('app.reason', 'Contacts import (P2-07)', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := btrim(r ->> 'name');
    v_trn := nullif(btrim(coalesce(r ->> 'trn', '')), '');
    select id into v_existing from public.contacts
     where organization_id = p_organization_id and (lower(btrim(name)) = lower(v_name) or (v_trn is not null and trn = v_trn)) limit 1;
    if v_existing is not null then
      v_skipped := v_skipped || jsonb_build_object('row', (r ->> 'row')::int, 'name', v_name,
        'reason', case when exists (select 1 from public.contacts where id = v_existing and lower(btrim(name)) = lower(v_name)) then 'already exists (same name)' else 'already exists (same TRN)' end);
      continue;
    end if;
    v_cc := upper(coalesce(nullif(btrim(r ->> 'country_code'), ''), 'AE'));
    insert into public.contacts (organization_id, kind, name, trn, country_code, emirate_code, email, phone, address, payment_terms_days,
           default_account_id, default_tax_code, is_related_party)
    values (p_organization_id, lower(btrim(r ->> 'kind'))::public.contact_kind, v_name, v_trn, v_cc,
            upper(nullif(btrim(coalesce(r ->> 'emirate_code', '')), '')), nullif(btrim(coalesce(r ->> 'email', '')), ''),
            nullif(btrim(coalesce(r ->> 'phone', '')), ''), nullif(btrim(coalesce(r ->> 'address', '')), ''),
            nullif(btrim(coalesce(r ->> 'payment_terms_days', '')), '')::smallint,
            (select id from public.accounts where organization_id = p_organization_id and code = nullif(btrim(coalesce(r ->> 'default_account_code', '')), '')),
            upper(nullif(btrim(coalesce(r ->> 'default_tax_code', '')), '')),
            coalesce(lower(btrim(r ->> 'is_related_party')) in ('yes', 'y', 'true', '1'), false));
    v_n := v_n + 1;
  end loop;
  perform set_config('app.reason', '', true);
  return jsonb_build_object('imported', v_n, 'skipped', v_skipped);
end $$;

grant execute on function app.import_contacts(uuid, jsonb) to authenticated;
create function public.import_contacts(p_organization_id uuid, p_rows jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select app.import_contacts(p_organization_id, p_rows) $$;
revoke all on function public.import_contacts(uuid, jsonb) from public, anon;
grant execute on function public.import_contacts(uuid, jsonb) to authenticated;
