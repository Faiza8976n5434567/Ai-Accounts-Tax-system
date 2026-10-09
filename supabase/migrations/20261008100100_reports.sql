-- P2-06 · Profit & loss, balance sheet (with the D-28 roll-forward), AR/AP ageing at any date and
-- customer/supplier statements. Like the trial balance (P1-15) every report is calculated from posted
-- journals each time and runs with the caller's own rights (SECURITY INVOKER + RLS) — nothing is stored.
-- "Posted" includes journals later reversed; their reversal is its own posted journal (LED-09).

-- Start of the financial year containing p_date for a year starting in p_month.
create or replace function public.fy_start_of(p_date date, p_month int) returns date
language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_date)::int - case when extract(month from p_date)::int < p_month then 1 else 0 end, p_month, 1)
$$;

-- Income (+) and expenses (+) of the period, per account, in their natural sign.
create or replace function public.profit_and_loss(p_organization_id uuid, p_from date, p_to date)
returns table (account_id uuid, code text, name text, type public.account_type, report_group text, amount bigint)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.code, a.name, a.type, a.report_group,
         (case when a.type = 'revenue' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end)::bigint
  from public.journal_lines l
  join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
  join public.accounts a on a.id = l.account_id
  where l.organization_id = p_organization_id and j.status in ('posted', 'reversed')
    and j.entry_date between p_from and p_to and a.type in ('revenue', 'expense')
  group by a.id, a.code, a.name, a.type, a.report_group
  having sum(l.debit - l.credit) <> 0
  order by a.code
$$;

-- Balances at p_as_of in their natural sign (assets debit +, liabilities and equity credit +).
-- D-28: income and expenses of earlier financial years are shown inside equity as "earlier years' results"
-- (until a year-end closing journal moves them, Phase 5); this year's result is shown separately. The
-- ledger itself is never changed. RPT-01: assets = liabilities + equity.
create or replace function public.balance_sheet(p_organization_id uuid, p_as_of date)
returns table (section text, row_kind text, account_id uuid, code text, name text, report_group text, amount bigint)
language sql stable security invoker set search_path = '' as $$
  with org as (
    select public.fy_start_of(p_as_of, o.fy_start_month) as fy_start from public.organizations o where o.id = p_organization_id
  ), bal as (
    select a.id, a.code, a.name, a.type, a.report_group, j.entry_date, l.debit - l.credit as dc
    from public.journal_lines l
    join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
    join public.accounts a on a.id = l.account_id
    where l.organization_id = p_organization_id and j.status in ('posted', 'reversed') and j.entry_date <= p_as_of
  )
  select case b.type when 'asset' then 'assets' when 'liability' then 'liabilities' else 'equity' end, 'account', b.id, b.code, b.name, b.report_group,
         (case when b.type = 'asset' then sum(b.dc) else -sum(b.dc) end)::bigint
  from bal b where b.type in ('asset', 'liability', 'equity')
  group by b.type, b.id, b.code, b.name, b.report_group
  having sum(b.dc) <> 0
  union all
  select 'equity', 'earlier_years_result', null, null, 'Earlier years'' results (not yet closed, D-28)', 'Equity', (-sum(b.dc))::bigint
  from bal b, org where b.type in ('revenue', 'expense') and b.entry_date < org.fy_start
  having sum(b.dc) <> 0
  union all
  select 'equity', 'current_year_result', null, null, 'Profit / (loss) for the year to date', 'Equity', coalesce(-sum(b.dc), 0)::bigint
  from org left join bal b on b.type in ('revenue', 'expense') and b.entry_date >= org.fy_start
  group by org.fy_start
  order by 1, 2, 4
$$;

-- Open invoices (customers) or bills (suppliers) as they stood at p_as_of, aged by due date (ARAP-01).
-- A document counts from its date; credit/debit notes, allocations and reversals count from theirs, so the
-- total always equals the control account at that date (ARAP-02/03).
create or replace function public.ageing(p_organization_id uuid, p_side text, p_as_of date)
returns table (document_id uuid, contact_id uuid, contact_name text, doc_no text, doc_date date, due_date date, currency text,
               total_aed bigint, open_aed bigint, open_fcy bigint, days_overdue int)
language sql stable security invoker set search_path = '' as $$
  with live_alloc as (                     -- allocations that had happened by p_as_of
    select a.sales_invoice_id, a.purchase_bill_id, a.amount, a.amount_fcy
    from public.payment_allocations a
    join public.payments p on p.id = a.payment_id and p.status = 'posted'
    join public.journals pj on pj.id = p.journal_id and pj.entry_date <= p_as_of
    left join public.journals aj on aj.id = a.journal_id
    where a.organization_id = p_organization_id and a.refund_id is null and a.applied_on <= p_as_of
      and (a.journal_id is null or (aj.status in ('posted', 'reversed') and aj.entry_date <= p_as_of))
      and not exists (select 1 from public.journals r where r.reversal_of = p.journal_id and r.status = 'posted' and r.entry_date <= p_as_of)
  ), docs as (
    select i.id, i.contact_id, i.invoice_no as doc_no, i.issue_date as doc_date, i.due_date, i.currency::text, i.gross_total as total, i.gross_total_fcy as total_fcy,
           (select coalesce(sum(c.gross_total), 0) from public.sales_invoices c where c.original_invoice_id = i.id and c.status = 'posted' and c.issue_date <= p_as_of) as notes,
           (select coalesce(sum(c.gross_total_fcy), 0) from public.sales_invoices c where c.original_invoice_id = i.id and c.status = 'posted' and c.issue_date <= p_as_of) as notes_fcy,
           (select coalesce(sum(la.amount), 0) from live_alloc la where la.sales_invoice_id = i.id) as paid,
           (select coalesce(sum(la.amount_fcy), 0) from live_alloc la where la.sales_invoice_id = i.id) as paid_fcy
    from public.sales_invoices i
    where p_side = 'customer' and i.organization_id = p_organization_id and i.status = 'posted' and i.doc_type = 'invoice' and i.issue_date <= p_as_of
    union all
    select b.id, b.contact_id, b.supplier_invoice_no, b.bill_date, b.due_date, b.currency::text, b.payable_total, b.payable_total_fcy,
           (select coalesce(sum(d.payable_total), 0) from public.purchase_bills d where d.original_bill_id = b.id and d.status = 'posted' and d.bill_date <= p_as_of),
           (select coalesce(sum(d.payable_total_fcy), 0) from public.purchase_bills d where d.original_bill_id = b.id and d.status = 'posted' and d.bill_date <= p_as_of),
           (select coalesce(sum(la.amount), 0) from live_alloc la where la.purchase_bill_id = b.id),
           (select coalesce(sum(la.amount_fcy), 0) from live_alloc la where la.purchase_bill_id = b.id)
    from public.purchase_bills b
    where p_side = 'supplier' and b.organization_id = p_organization_id and b.status = 'posted' and b.doc_type = 'bill' and b.bill_date <= p_as_of
  )
  select d.id, d.contact_id, c.name, d.doc_no, d.doc_date, d.due_date, d.currency, d.total,
         (d.total - d.notes - d.paid)::bigint, (d.total_fcy - d.notes_fcy - d.paid_fcy)::bigint, (p_as_of - d.due_date)
  from docs d join public.contacts c on c.id = d.contact_id
  where d.total - d.notes - d.paid <> 0
  order by c.name, d.due_date, d.doc_no
$$;

-- A customer's (or supplier's) statement: everything posted to their receivable/credit (payable/advance)
-- accounts, with the balance brought forward and a running balance (customer: owed to us +; supplier: owed by us +).
create or replace function public.contact_statement(p_organization_id uuid, p_contact_id uuid, p_side text, p_from date, p_to date)
returns table (row_kind text, entry_date date, journal_id uuid, journal_no text, source public.journal_source, memo text, description text,
               debit bigint, credit bigint, balance bigint)
language sql stable security invoker set search_path = '' as $$
  with lines as (
    select j.id, j.entry_date, j.journal_no, j.source, j.memo, l.line_no, l.description, l.debit, l.credit,
           case when p_side = 'customer' then l.debit - l.credit else l.credit - l.debit end as signed
    from public.journal_lines l
    join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
    join public.accounts a on a.id = l.account_id
    where l.organization_id = p_organization_id and l.contact_id = p_contact_id and j.status in ('posted', 'reversed') and j.entry_date <= p_to
      and a.subtype = any (case when p_side = 'customer' then array['receivable', 'customer_credits'] else array['payable', 'supplier_advances'] end)
  ), bf as (
    select coalesce(sum(signed), 0)::bigint as amount from lines where entry_date < p_from
  )
  select 'opening', p_from, null::uuid, null::text, null::public.journal_source, 'Balance brought forward', null::text, null::bigint, null::bigint, bf.amount
  from bf
  union all
  select 'line', x.entry_date, x.id, x.journal_no, x.source, x.memo, x.description, x.debit, x.credit,
         (bf.amount + sum(x.signed) over (order by x.entry_date, x.journal_no, x.line_no rows between unbounded preceding and current row))::bigint
  from lines x, bf
  where x.entry_date >= p_from
  order by 1 desc, 2, 4
$$;

revoke all on function public.fy_start_of(date, int), public.profit_and_loss(uuid, date, date), public.balance_sheet(uuid, date),
  public.ageing(uuid, text, date), public.contact_statement(uuid, uuid, text, date, date) from public, anon;
grant execute on function public.fy_start_of(date, int), public.profit_and_loss(uuid, date, date), public.balance_sheet(uuid, date),
  public.ageing(uuid, text, date), public.contact_statement(uuid, uuid, text, date, date) to authenticated;
