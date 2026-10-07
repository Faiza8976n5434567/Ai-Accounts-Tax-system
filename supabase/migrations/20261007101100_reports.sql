-- P1-15 · Trial balance and general ledger, calculated from posted journals every time
-- (Spec 01 §5 — reports are never stored, so they can never drift). Both run with the caller's
-- own rights (SECURITY INVOKER): Row-Level Security decides which clients and lines they see.
-- "Posted" includes journals later marked reversed — the reversal is its own posted journal,
-- so the two cancel out in the figures (LED-09). Drafts and pending journals never count.
-- Note: there is no year-end closing yet (Phase 5); balances are cumulative since the books
-- started (see PLAN Q-24).

create or replace function public.trial_balance(p_organization_id uuid, p_from date, p_to date)
returns table (account_id uuid, code text, name text, type public.account_type, report_group text,
               opening bigint, debit bigint, credit bigint, closing bigint)
language sql stable security invoker set search_path = '' as $$
  with lines as (
    select l.account_id, j.entry_date, l.debit, l.credit
    from public.journal_lines l
    join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
    where l.organization_id = p_organization_id and j.status in ('posted', 'reversed') and j.entry_date <= p_to
  ), sums as (
    select account_id,
           coalesce(sum(debit - credit) filter (where entry_date < p_from), 0)::bigint as opening,
           coalesce(sum(debit) filter (where entry_date >= p_from), 0)::bigint as debit,
           coalesce(sum(credit) filter (where entry_date >= p_from), 0)::bigint as credit
    from lines group by account_id
  )
  select a.id, a.code, a.name, a.type, a.report_group,
         s.opening, s.debit, s.credit, (s.opening + s.debit - s.credit)::bigint
  from sums s join public.accounts a on a.id = s.account_id
  where s.opening <> 0 or s.debit <> 0 or s.credit <> 0
  order by a.code
$$;

-- One account's postings with a running balance (debit positive), starting from the balance
-- brought forward. Each row carries its journal id so every figure drills down (Principle 10).
create or replace function public.general_ledger(p_organization_id uuid, p_account_id uuid, p_from date, p_to date)
returns table (row_kind text, entry_date date, journal_id uuid, journal_no text, line_no smallint, source public.journal_source,
               memo text, description text, debit bigint, credit bigint, balance bigint)
language sql stable security invoker set search_path = '' as $$
  with posted as (
    select j.id, j.entry_date, j.journal_no, j.source, j.memo, l.line_no, l.description, l.debit, l.credit
    from public.journal_lines l
    join public.journals j on j.id = l.journal_id and j.organization_id = l.organization_id
    where l.organization_id = p_organization_id and l.account_id = p_account_id
      and j.status in ('posted', 'reversed') and j.entry_date <= p_to
  ), bf as (
    select coalesce(sum(debit - credit), 0)::bigint as amount from posted where entry_date < p_from
  )
  select 'opening', p_from, null::uuid, null::text, null::smallint, null::public.journal_source, 'Balance brought forward', null::text,
         null::bigint, null::bigint, bf.amount
  from bf
  union all
  select 'line', p.entry_date, p.id, p.journal_no, p.line_no, p.source, p.memo, p.description, p.debit, p.credit,
         (bf.amount + sum(p.debit - p.credit) over (order by p.entry_date, p.journal_no, p.line_no
                                                     rows between unbounded preceding and current row))::bigint
  from posted p, bf
  where p.entry_date >= p_from
  order by 1 desc, 2, 4, 5
$$;

revoke all on function public.trial_balance(uuid, date, date), public.general_ledger(uuid, uuid, date, date) from public, anon;
grant execute on function public.trial_balance(uuid, date, date), public.general_ledger(uuid, uuid, date, date) to authenticated;
