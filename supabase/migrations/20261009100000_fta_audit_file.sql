-- P3-03 · FTA VAT Audit File (FAF) data — FTA "Requirements Document for Tax Accounting Software", Appendix 5
-- (FAFv1.0.0). This function returns the four tables as data; poc/src/lib/faf.ts writes the CSV exactly as the
-- FTA lays it out (markers, DD-MM-YYYY dates, 2-decimal amounts, totals). D-57 (Faizan):
--   • purchase tax codes in FTA codes (2 letters): RCS and IMG → RC, BLK → SR (VAT as on the invoice), others as is;
--   • out-of-scope (OS) lines are included with code OS;
--   • credit notes / debit notes are listed as negative lines.
-- Only posted documents dated in the range (document date = tax date, D-29); opening documents (D-52) are not
-- supplies or purchases of the period and are left out of the listings (they remain in the general ledger).
-- Amounts in fils (AED) / cents (FCY); the general ledger balance runs per account from its balance before p_start.

create or replace function app.faf_tax_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case p_code when 'RCS' then 'RC' when 'IMG' then 'RC' when 'BLK' then 'SR' else p_code end
$$;

create or replace function app.faf_data(p_organization_id uuid, p_start date, p_end date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.organizations;
begin
  perform app.require(p_organization_id, 'export');
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Choose a period: the start date must be on or before the end date' using errcode = 'check_violation';
  end if;
  select * into o from public.organizations where id = p_organization_id;
  return jsonb_build_object(
    'company', jsonb_build_object('name_en', o.legal_name, 'name_ar', '', 'trn', coalesce(o.trn, ''),
      'product', coalesce((select value #>> '{}' from public.platform_settings where key = 'app_name'), '')),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplier', c.name, 'trn', coalesce(b.supplier_trn_on_invoice::text, c.trn::text, ''), 'date', b.bill_date,
               'invoice_no', b.supplier_invoice_no, 'line_no', l.line_no, 'description', l.description,
               'value', s.sign * l.net, 'vat', s.sign * l.vat, 'tax_code', app.faf_tax_code(l.tax_code),
               'currency', b.currency, 'value_fcy', s.sign * l.net_fcy, 'vat_fcy', s.sign * l.vat_fcy)
             order by b.bill_date, b.supplier_invoice_no, b.id, l.line_no)
      from public.purchase_bills b
      join public.purchase_bill_lines l on l.purchase_bill_id = b.id
      join public.contacts c on c.id = b.contact_id
      cross join lateral (select case when b.doc_type = 'debit_note' then -1 else 1 end as sign) s
      where b.organization_id = p_organization_id and b.status = 'posted' and not b.is_opening
        and b.bill_date between p_start and p_end), '[]'::jsonb),
    'supplies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'customer', c.name, 'trn', coalesce(c.trn::text, ''), 'date', i.issue_date, 'invoice_no', i.invoice_no,
               'line_no', l.line_no, 'description', l.description, 'value', s.sign * l.net, 'vat', s.sign * l.vat,
               'tax_code', l.tax_code, 'country', case when c.country_code <> 'AE' then c.country_code else '' end,
               'currency', i.currency, 'value_fcy', s.sign * l.net_fcy, 'vat_fcy', s.sign * l.vat_fcy)
             order by i.issue_date, i.invoice_no, l.line_no)
      from public.sales_invoices i
      join public.sales_invoice_lines l on l.sales_invoice_id = i.id
      join public.contacts c on c.id = i.contact_id
      cross join lateral (select case when i.doc_type = 'credit_note' then -1 else 1 end as sign) s
      where i.organization_id = p_organization_id and i.status = 'posted' and not i.is_opening
        and i.issue_date between p_start and p_end), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', g.entry_date, 'account_code', g.code, 'account_name', g.account_name, 'description', g.description,
               'name', g.contact, 'transaction_id', g.journal_no, 'source_document', g.source_document, 'source_type', g.source_type,
               'debit', g.debit, 'credit', g.credit, 'balance', g.balance)
             order by g.entry_date, g.journal_no, g.line_no)
      from (
        select j.entry_date, j.journal_no, l.line_no, a.code, a.name as account_name,
               coalesce(nullif(btrim(l.description), ''), j.memo, '') as description,
               coalesce(lc.name, jc.name, '') as contact,
               coalesce(si.invoice_no, pb.supplier_invoice_no, p.payment_no, j.journal_no) as source_document,
               case
                 when j.source = 'sale' then case when si.doc_type = 'credit_note' then 'AR - Cancel' else 'AR' end
                 when j.source = 'purchase' then case when pb.doc_type = 'debit_note' then 'AP - Cancel' else 'AP' end
                 when j.source in ('receipt', 'payment', 'bank') then 'Cash Book Entries'
                 else 'Journal Entries'
               end as source_type,
               l.debit, l.credit,
               (select coalesce(sum(x.debit - x.credit), 0) from public.journal_lines x join public.journals y on y.id = x.journal_id
                 where x.account_id = l.account_id and y.status in ('posted', 'reversed') and y.entry_date < p_start)
               + sum(l.debit - l.credit) over (partition by l.account_id order by j.entry_date, j.journal_no, l.line_no) as balance
        from public.journal_lines l
        join public.journals j on j.id = l.journal_id
        join public.accounts a on a.id = l.account_id
        left join public.contacts lc on lc.id = l.contact_id
        left join public.contacts jc on jc.id = j.contact_id
        left join public.sales_invoices si on j.source = 'sale' and si.id = j.source_id
        left join public.purchase_bills pb on j.source = 'purchase' and pb.id = j.source_id
        left join public.payments p on j.source in ('receipt', 'payment') and p.id = j.source_id
        where j.organization_id = p_organization_id and j.status in ('posted', 'reversed')
          and j.entry_date between p_start and p_end) g), '[]'::jsonb));
end $$;

grant execute on function app.faf_data(uuid, date, date) to authenticated;
create function public.faf_data(p_organization_id uuid, p_start date, p_end date) returns jsonb
language sql security invoker set search_path = '' as $$ select app.faf_data(p_organization_id, p_start, p_end) $$;
revoke all on function public.faf_data(uuid, date, date) from public, anon;
grant execute on function public.faf_data(uuid, date, date) to authenticated;
