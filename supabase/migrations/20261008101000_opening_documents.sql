-- Q-25 → D-52 · Data migration: opening documents (D-53: anonymised names for the exit test).
--   • The opening journal (the old system's trial balance at the cut-off) posts receivables and payables to
--     3999 "Opening balance clearing" instead of 1100/2000.
--   • Each unpaid invoice/bill of the old system is entered as an OPENING DOCUMENT (old number, real dates, the
--     amount still open, no VAT — it was declared in the old system). It shows in ageing and statements and receipts
--     or payments settle it. Posting it moves the amount from 3999 to receivables/payables (Dr 1100 / Cr 3999, or
--     Dr 3999 / Cr 2000), dated the conversion date. When every document is in, 3999 is exactly zero — the built-in
--     proof that the list matches the trial balance (the nightly integrity check warns until it is).
--   • Maker-checker: anyone who may prepare enters them; a Firm Admin (post_journal) posts them, never their own.
--   • AED only for now (a USD open item can be added when needed).

insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, '3999', 'Opening balance clearing', 'equity', 'opening_clearing', 'Equity', null, false
from public.coa_templates t where t.code = 'uae-sme'
on conflict (template_id, code) do nothing;
insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
select o.id, '3999', 'Opening balance clearing', 'equity', 'opening_clearing', 'Equity', null, false
from public.organizations o
where not exists (select 1 from public.accounts a where a.organization_id = o.id and (a.code = '3999' or a.subtype = 'opening_clearing'));

alter table public.sales_invoices add column is_opening boolean not null default false;
alter table public.purchase_bills add column is_opening boolean not null default false;

-- p_rows: [{row, kind: 'customer'|'supplier', contact_id | contact_name, number, date, due_date, amount}] — amount in fils.
-- All-or-nothing; creates the documents as waiting for approval.
create or replace function app.save_opening_documents(p_organization_id uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'prepare');
  r jsonb;
  v_row int; v_kind text; v_contact public.contacts; v_no text; v_date date; v_due date; v_amount bigint;
  v_errors text[] := '{}';
  v_seen text[] := '{}';
  v_n int := 0;
  v_emirate text := (select emirate_code from public.organizations where id = p_organization_id);
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'There are no opening documents to save' using errcode = 'check_violation';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := coalesce((r ->> 'row')::int, 0);
    v_kind := lower(btrim(coalesce(r ->> 'kind', '')));
    v_no := nullif(btrim(coalesce(r ->> 'number', '')), '');
    begin v_date := (r ->> 'date')::date; v_due := coalesce((r ->> 'due_date')::date, (r ->> 'date')::date); v_amount := (r ->> 'amount')::bigint;
    exception when others then v_errors := v_errors || format('Row %s: date or amount is not valid', v_row); continue; end;
    select * into v_contact from public.contacts c where c.organization_id = p_organization_id
      and (c.id::text = coalesce(r ->> 'contact_id', '') or lower(btrim(c.name)) = lower(btrim(coalesce(r ->> 'contact_name', '')))) limit 1;
    if v_kind not in ('customer', 'supplier') then v_errors := v_errors || format('Row %s: type must be Customer or Supplier', v_row); end if;
    if v_contact.id is null then v_errors := v_errors || format('Row %s: %s is not a contact of this client — import the contacts first', v_row, coalesce(r ->> 'contact_name', 'the contact'));
    elsif (v_kind = 'customer' and v_contact.kind = 'supplier') or (v_kind = 'supplier' and v_contact.kind = 'customer') then
      v_errors := v_errors || format('Row %s: %s is not set up as a %s', v_row, v_contact.name, v_kind); end if;
    if v_no is null then v_errors := v_errors || format('Row %s: the old document number is missing', v_row); end if;
    if v_date is null then v_errors := v_errors || format('Row %s: the date is missing', v_row); end if;
    if v_due < v_date then v_errors := v_errors || format('Row %s: the due date is before the document date', v_row); end if;
    if v_amount is null or v_amount <= 0 then v_errors := v_errors || format('Row %s: the open amount must be above zero', v_row); end if;
    if v_no is not null and (v_kind || '|' || coalesce(v_contact.id::text, '') || '|' || lower(v_no)) = any (v_seen) then
      v_errors := v_errors || format('Row %s: %s appears twice in the file', v_row, v_no); end if;
    if v_kind = 'customer' and v_no is not null and exists (select 1 from public.sales_invoices where organization_id = p_organization_id and lower(invoice_no) = lower(v_no)) then
      v_errors := v_errors || format('Row %s: invoice number %s already exists in this client', v_row, v_no); end if;
    if v_kind = 'supplier' and v_no is not null and v_contact.id is not null and exists (select 1 from public.purchase_bills where organization_id = p_organization_id
         and contact_id = v_contact.id and doc_type = 'bill' and lower(btrim(supplier_invoice_no)) = lower(v_no)) then
      v_errors := v_errors || format('Row %s: bill %s already exists for %s', v_row, v_no, v_contact.name); end if;
    v_seen := v_seen || (v_kind || '|' || coalesce(v_contact.id::text, '') || '|' || lower(coalesce(v_no, '')));
  end loop;
  if cardinality(v_errors) > 0 then
    raise exception 'Nothing was saved — please correct: %', array_to_string(v_errors[1:15], '; ')
      || case when cardinality(v_errors) > 15 then format(' (and %s more)', cardinality(v_errors) - 15) else '' end using errcode = 'check_violation';
  end if;

  perform app.set_ctx('save_opening_documents');
  for r in select * from jsonb_array_elements(p_rows) loop
    v_kind := lower(btrim(r ->> 'kind'));
    select * into v_contact from public.contacts c where c.organization_id = p_organization_id
      and (c.id::text = coalesce(r ->> 'contact_id', '') or lower(btrim(c.name)) = lower(btrim(coalesce(r ->> 'contact_name', '')))) limit 1;
    v_amount := (r ->> 'amount')::bigint;
    if v_kind = 'customer' then
      insert into public.sales_invoices (organization_id, doc_type, invoice_no, contact_id, issue_date, due_date, supply_emirate, status,
             net_total, vat_total, gross_total, gross_total_fcy, notes, prepared_by, is_opening)
      values (p_organization_id, 'invoice', btrim(r ->> 'number'), v_contact.id, (r ->> 'date')::date, coalesce((r ->> 'due_date')::date, (r ->> 'date')::date),
              v_emirate, 'pending', v_amount, 0, v_amount, v_amount, 'Opening balance from the previous system (amount still open)', v_uid, true);
    else
      insert into public.purchase_bills (organization_id, doc_type, supplier_invoice_no, contact_id, bill_date, due_date, status,
             net_total, vat_total, recoverable_vat, payable_total, payable_total_fcy, notes, prepared_by, is_opening)
      values (p_organization_id, 'bill', btrim(r ->> 'number'), v_contact.id, (r ->> 'date')::date, coalesce((r ->> 'due_date')::date, (r ->> 'date')::date),
              'pending', v_amount, 0, 0, v_amount, v_amount, 'Opening balance from the previous system (amount still open)', v_uid, true);
    end if;
    v_n := v_n + 1;
  end loop;
  perform app.set_ctx(null);
  return v_n;
end $$;

-- A Firm Admin posts every waiting opening document of the client, dated the conversion date (one journal each).
create or replace function app.post_opening_documents(p_organization_id uuid, p_date date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'post_journal');
  d record;
  v_j uuid;
  v_clear uuid := app.subtype_account(p_organization_id, 'opening_clearing');
  v_ar uuid := app.subtype_account(p_organization_id, 'receivable');
  v_ap uuid := app.subtype_account(p_organization_id, 'payable');
  v_n int := 0;
begin
  if p_date is null then raise exception 'Enter the conversion date' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.sales_invoices where organization_id = p_organization_id and is_opening and status = 'pending' and prepared_by = v_uid)
     or exists (select 1 from public.purchase_bills where organization_id = p_organization_id and is_opening and status = 'pending' and prepared_by = v_uid) then
    raise exception 'You entered some of these opening documents, so someone else must post them (maker-checker)' using errcode = 'insufficient_privilege';
  end if;
  for d in select 'sale' as k, id, contact_id, invoice_no as no, gross_total as amount, prepared_by from public.sales_invoices
            where organization_id = p_organization_id and is_opening and status = 'pending'
           union all
           select 'purchase', id, contact_id, supplier_invoice_no, payable_total, prepared_by from public.purchase_bills
            where organization_id = p_organization_id and is_opening and status = 'pending'
           order by 1, 4 loop
    perform app.set_ctx('post_opening_documents');
    insert into public.journals (organization_id, entry_date, source, source_id, memo, contact_id, prepared_by)
    values (p_organization_id, p_date, 'opening', d.id, 'Opening ' || case when d.k = 'sale' then 'invoice ' else 'bill ' end || d.no, d.contact_id, d.prepared_by)
    returning id into v_j;
    if d.k = 'sale' then
      perform app.add_line(v_j, p_organization_id, v_ar, d.amount, d.contact_id, d.no);
      perform app.add_line(v_j, p_organization_id, v_clear, -d.amount, d.contact_id, 'Opening receivable ' || d.no);
    else
      perform app.add_line(v_j, p_organization_id, v_clear, d.amount, d.contact_id, 'Opening payable ' || d.no);
      perform app.add_line(v_j, p_organization_id, v_ap, -d.amount, d.contact_id, d.no);
    end if;
    perform app.post_built_journal(v_j, p_organization_id, p_date, v_uid, case when d.k = 'sale' then 'post_sales_invoice' else 'post_purchase_bill' end);
    if d.k = 'sale' then
      update public.sales_invoices set status = 'posted', journal_id = v_j, approved_by = v_uid, posted_at = now() where id = d.id;
    else
      update public.purchase_bills set status = 'posted', journal_id = v_j, approved_by = v_uid, posted_at = now() where id = d.id;
    end if;
    v_n := v_n + 1;
  end loop;
  perform app.set_ctx(null);
  return v_n;
end $$;

-- Deleting an opening document that is still waiting (a wrong line).
create or replace function app.delete_opening_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_kind text;
begin
  select organization_id, 'sale' into v_org, v_kind from public.sales_invoices where id = p_id and is_opening and status = 'pending';
  if v_org is null then select organization_id, 'purchase' into v_org, v_kind from public.purchase_bills where id = p_id and is_opening and status = 'pending'; end if;
  if v_org is null then raise exception 'Only an opening document waiting for posting can be deleted' using errcode = 'check_violation'; end if;
  perform app.require(v_org, 'prepare');
  perform app.set_ctx('save_opening_documents');
  if v_kind = 'sale' then delete from public.sales_invoices where id = p_id; else delete from public.purchase_bills where id = p_id; end if;
  perform app.set_ctx(null);
end $$;

-- Where the migration stands: 3999 balance and the opening documents.
create or replace function app.opening_status(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(p_organization_id, 'view');
  return jsonb_build_object(
    'clearing_balance', app.gl_subtype_balance(p_organization_id, 'opening_clearing', '9999-12-31'),
    'opening_journals', (select count(*) from public.journals where organization_id = p_organization_id and source = 'opening' and status = 'posted'
                         and not exists (select 1 from public.sales_invoices s where s.journal_id = journals.id) and not exists (select 1 from public.purchase_bills b where b.journal_id = journals.id)),
    'documents', coalesce((select jsonb_agg(x order by x ->> 'kind', x ->> 'contact', x ->> 'number') from (
        select jsonb_build_object('id', s.id, 'kind', 'customer', 'contact', c.name, 'number', s.invoice_no, 'date', s.issue_date, 'due_date', s.due_date,
                                  'amount', s.gross_total, 'status', s.status) x
        from public.sales_invoices s join public.contacts c on c.id = s.contact_id where s.organization_id = p_organization_id and s.is_opening
        union all
        select jsonb_build_object('id', b.id, 'kind', 'supplier', 'contact', c.name, 'number', b.supplier_invoice_no, 'date', b.bill_date, 'due_date', b.due_date,
                                  'amount', b.payable_total, 'status', b.status)
        from public.purchase_bills b join public.contacts c on c.id = b.contact_id where b.organization_id = p_organization_id and b.is_opening) q), '[]'));
end $$;

grant execute on function app.save_opening_documents(uuid, jsonb), app.post_opening_documents(uuid, date), app.delete_opening_document(uuid),
  app.opening_status(uuid) to authenticated;
create function public.save_opening_documents(p_organization_id uuid, p_rows jsonb) returns int
language sql security invoker set search_path = '' as $$ select app.save_opening_documents(p_organization_id, p_rows) $$;
create function public.post_opening_documents(p_organization_id uuid, p_date date) returns int
language sql security invoker set search_path = '' as $$ select app.post_opening_documents(p_organization_id, p_date) $$;
create function public.delete_opening_document(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.delete_opening_document(p_id) $$;
create function public.opening_status(p_organization_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select app.opening_status(p_organization_id) $$;
revoke all on function public.save_opening_documents(uuid, jsonb), public.post_opening_documents(uuid, date), public.delete_opening_document(uuid),
  public.opening_status(uuid) from public, anon;
grant execute on function public.save_opening_documents(uuid, jsonb), public.post_opening_documents(uuid, date), public.delete_opening_document(uuid),
  public.opening_status(uuid) to authenticated;

-- Integrity: old document numbers are not ours (left out of the gap check); 3999 must end at zero (warning until it does).
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
