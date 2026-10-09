-- P3-07 · Firm overview dashboard on live data (Spec 03 F-23, display only). One row per client the signed-in user
-- may view: VAT returns due/overdue, approvals waiting, receivables/payables, revenue and days-sales-outstanding,
-- bank lines waiting, last reconciliation and the latest integrity result. Nothing is stored; every figure comes
-- from the same functions as the reports, so it always agrees with them.

create or replace function app.firm_dashboard()
returns table (
  organization_id uuid, legal_name text, vat_registered boolean,
  vat_open_returns int, vat_overdue_returns int, vat_next_due date, vat_next_period_end date,
  pending_journals int, pending_invoices int, pending_bills int, pending_payments int, pending_vat_returns int, pending_reconciliations int,
  ar_open bigint, ar_overdue bigint, ap_open bigint, ap_overdue bigint,
  revenue_ytd bigint, revenue_365 bigint,
  bank_unmatched int, bank_reconciled_to date,
  integrity_status text, integrity_checked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  o record;
  v_today date := current_date;
begin
  for o in select org.id, org.legal_name, org.vat_registered, org.fy_start_month
           from public.organizations org
           where org.status <> 'archived' and org.id in (select app.orgs_with('view'))
           order by org.legal_name loop
    organization_id := o.id; legal_name := o.legal_name; vat_registered := o.vat_registered;

    -- VAT returns whose quarter has ended but which are not yet approved or filed
    select count(*), count(*) filter (where tp.due_date < v_today), min(tp.due_date), min(tp.end_date)
      into vat_open_returns, vat_overdue_returns, vat_next_due, vat_next_period_end
      from public.tax_periods tp
     where tp.organization_id = o.id and tp.kind = 'vat' and tp.end_date < v_today
       and not exists (select 1 from public.vat_returns r where r.tax_period_id = tp.id and r.status in ('approved', 'filed'));

    select count(*) into pending_journals from public.journals where public.journals.organization_id = o.id and status = 'pending';
    select count(*) into pending_invoices from public.sales_invoices where public.sales_invoices.organization_id = o.id and status = 'pending';
    select count(*) into pending_bills from public.purchase_bills where public.purchase_bills.organization_id = o.id and status = 'pending';
    select count(*) into pending_payments from public.payments where public.payments.organization_id = o.id and status = 'pending';
    select count(*) into pending_vat_returns from public.vat_returns where public.vat_returns.organization_id = o.id and status = 'in_review';
    select count(*) into pending_reconciliations from public.bank_reconciliations where public.bank_reconciliations.organization_id = o.id and status = 'pending';

    select coalesce(sum(a.open_aed), 0), coalesce(sum(a.open_aed) filter (where a.days_overdue > 0), 0)
      into ar_open, ar_overdue from public.ageing(o.id, 'customer', v_today) a;
    select coalesce(sum(a.open_aed), 0), coalesce(sum(a.open_aed) filter (where a.days_overdue > 0), 0)
      into ap_open, ap_overdue from public.ageing(o.id, 'supplier', v_today) a;

    select coalesce(sum(p.amount) filter (where p.type = 'revenue'), 0) into revenue_ytd
      from public.profit_and_loss(o.id, public.fy_start_of(v_today, o.fy_start_month), v_today) p;
    select coalesce(sum(p.amount) filter (where p.type = 'revenue'), 0) into revenue_365
      from public.profit_and_loss(o.id, v_today - 364, v_today) p;

    select count(*) into bank_unmatched from public.bank_transactions t where t.organization_id = o.id and t.status = 'unmatched';
    select max(r.period_end) into bank_reconciled_to from public.bank_reconciliations r where r.organization_id = o.id and r.status = 'posted';

    select ir.status::text, ir.started_at into integrity_status, integrity_checked_at
      from public.integrity_runs ir where ir.organization_id = o.id order by ir.started_at desc limit 1;
    if not found then integrity_status := null; integrity_checked_at := null; end if;
    return next;
  end loop;
end $$;

grant execute on function app.firm_dashboard() to authenticated;
create function public.firm_dashboard()
returns table (
  organization_id uuid, legal_name text, vat_registered boolean,
  vat_open_returns int, vat_overdue_returns int, vat_next_due date, vat_next_period_end date,
  pending_journals int, pending_invoices int, pending_bills int, pending_payments int, pending_vat_returns int, pending_reconciliations int,
  ar_open bigint, ar_overdue bigint, ap_open bigint, ap_overdue bigint,
  revenue_ytd bigint, revenue_365 bigint,
  bank_unmatched int, bank_reconciled_to date,
  integrity_status text, integrity_checked_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from app.firm_dashboard() $$;
revoke all on function public.firm_dashboard() from public, anon;
grant execute on function public.firm_dashboard() to authenticated;
