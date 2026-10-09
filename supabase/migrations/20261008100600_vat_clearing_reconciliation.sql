-- P3-03 · VAT reconciliation and the automatic VAT clearing journal (D-47 · VAT-14).
--   • New account 2120 "VAT payable to / refundable by FTA" (liability, not a control account, so the payment to or
--     refund from the FTA can be posted from the bank line: Bank → Other… → 2120).
--   • On approval of a return, one journal (source `vat`, dated the last day of the quarter, prepared by the
--     preparer and approved by the approver) empties 2100, 2110, 1300 and 1310 into 2120. It clears the whole balance
--     at the quarter end, so items posted late into earlier quarters (D-44) or opening VAT balances are swept up too.
--   • Manual return adjustments (D-43) are not in the ledger: the reconciliation lists them so the accountant posts
--     their accounting entry against 2120 by journal (e.g. bad-debt relief).
--   • The reconciliation compares each group of boxes with the movement on its VAT account in the quarter
--     (clearing journals excluded) and lists everything that explains a difference.

insert into public.coa_template_accounts (template_id, code, name, type, subtype, report_group, ct_tag, is_control)
select t.id, '2120', 'VAT payable to / refundable by FTA', 'liability', 'vat_payable', 'Tax liabilities', null, false
from public.coa_templates t where t.code = 'uae-sme'
on conflict (template_id, code) do nothing;
insert into public.accounts (organization_id, code, name, type, subtype, report_group, ct_tag, is_control)
select o.id, '2120', 'VAT payable to / refundable by FTA', 'liability', 'vat_payable', 'Tax liabilities', null, false
from public.organizations o
where not exists (select 1 from public.accounts a where a.organization_id = o.id and (a.code = '2120' or a.subtype = 'vat_payable'));

alter table public.vat_returns add column clearing_journal_id uuid references public.journals (id) on delete restrict;
create index vat_returns_clearing_idx on public.vat_returns (clearing_journal_id);

-- Balance (debit − credit) of an account up to a date.
create or replace function app.account_balance(p_account uuid, p_as_of date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)::bigint from public.journal_lines l join public.journals j on j.id = l.journal_id
  where l.account_id = p_account and j.status in ('posted', 'reversed') and j.entry_date <= p_as_of
$$;

-- D-47: posts the clearing journal for an approved return; returns its id (null when there is nothing to clear).
create or replace function app.post_vat_clearing(p_return_id uuid, p_approver uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.vat_returns;
  tp public.tax_periods;
  v_j uuid;
  v_total bigint := 0;
  v_bal bigint;
  a record;
  v_prev text := app.ctx();
begin
  select * into r from public.vat_returns where id = p_return_id;
  select * into tp from public.tax_periods where id = r.tax_period_id;
  perform app.set_ctx('vat_clearing');
  insert into public.journals (organization_id, entry_date, source, source_id, memo, prepared_by)
  values (r.organization_id, tp.end_date, 'vat', r.id,
          'VAT clearing ' || to_char(tp.start_date, 'DD Mon YYYY') || ' – ' || to_char(tp.end_date, 'DD Mon YYYY') || ' (D-47)', r.prepared_by)
  returning id into v_j;
  for a in select id, code, name from public.accounts
           where organization_id = r.organization_id and subtype in ('vat_output', 'vat_output_rc', 'vat_input', 'vat_input_rc') order by code loop
    v_bal := app.account_balance(a.id, tp.end_date);
    if v_bal <> 0 then
      perform app.add_line(v_j, r.organization_id, a.id, -v_bal, null, 'Clear ' || a.code || ' ' || a.name);
      v_total := v_total + v_bal;
    end if;
  end loop;
  if v_total = 0 and not exists (select 1 from public.journal_lines where journal_id = v_j) then
    delete from public.journals where id = v_j;
    perform app.set_ctx(v_prev);
    return null;
  end if;
  perform app.add_line(v_j, r.organization_id, app.subtype_account(r.organization_id, 'vat_payable'), v_total, null,
                       case when v_total <= 0 then 'VAT payable to the FTA' else 'VAT refundable by the FTA' end);
  perform app.post_built_journal(v_j, r.organization_id, tp.end_date, p_approver, 'vat_clearing');
  perform app.set_ctx(v_prev);
  return v_j;
end $$;

-- VAT-14 · the return against the ledger, group by group, with the items that explain any difference.
create or replace function app.vat_reconciliation(p_tax_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tp public.tax_periods := app.vat_return_period(p_tax_period_id);
  r public.vat_returns;
  v_boxes jsonb;
  mv record;
begin
  perform app.require(tp.organization_id, 'view');
  select * into r from public.vat_returns where tax_period_id = tp.id;
  v_boxes := case when r.status in ('approved', 'filed') then r.snapshot -> 'boxes'
                  else (select jsonb_agg(to_jsonb(b)) from app.vat201_boxes(tp.organization_id, tp.start_date, tp.end_date, r.id) b) end;
  select
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_output'), 0)::bigint as out_,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_output_rc'), 0)::bigint as out_rc,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_input'), 0)::bigint as in_,
    coalesce(sum(l.debit - l.credit) filter (where a.subtype = 'vat_input_rc'), 0)::bigint as in_rc
  into mv
  from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
  where l.organization_id = tp.organization_id and j.status in ('posted', 'reversed') and j.source <> 'vat'
    and j.entry_date between tp.start_date and tp.end_date;
  return jsonb_build_object(
    'rows', jsonb_build_array(
      jsonb_build_object('group', 'Output VAT — boxes 1a–1g', 'account', '2100',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' ~ '^1[a-g]$'), 'ledger', -mv.out_),
      jsonb_build_object('group', 'Reverse charge output — boxes 3 + 6', 'account', '2110',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' in ('3', '6')), 'ledger', -mv.out_rc),
      jsonb_build_object('group', 'Input VAT — box 9', 'account', '1300',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '9'), 'ledger', mv.in_),
      jsonb_build_object('group', 'Reverse charge input — box 10', 'account', '1310',
        'return', (select coalesce(sum((b ->> 'vat')::bigint), 0) from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '10'), 'ledger', mv.in_rc)),
    'box14', (select (b ->> 'vat')::bigint from jsonb_array_elements(v_boxes) b where b ->> 'box_code' = '14'),
    'ledger_net', -(mv.out_ + mv.out_rc + mv.in_ + mv.in_rc),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('box_code', box_code, 'amount', amount, 'vat', vat, 'adjustment', adjustment, 'reason', reason))
                             from public.vat_return_adjustments where vat_return_id = r.id), '[]'),
    'other_postings', coalesce((select jsonb_agg(jsonb_build_object('entry_date', j.entry_date, 'journal_no', j.journal_no, 'source', j.source, 'memo', j.memo,
                                  'account', a.code, 'amount', l.debit - l.credit) order by j.entry_date, j.journal_no)
                                from public.journal_lines l join public.journals j on j.id = l.journal_id join public.accounts a on a.id = l.account_id
                                where l.organization_id = tp.organization_id and j.status in ('posted', 'reversed') and j.source not in ('sale', 'purchase', 'vat')
                                  and j.entry_date between tp.start_date and tp.end_date
                                  and a.subtype in ('vat_output', 'vat_output_rc', 'vat_input', 'vat_input_rc')), '[]'),
    'clearing_journal', (select jsonb_build_object('id', j.id, 'journal_no', j.journal_no, 'entry_date', j.entry_date,
                           'amount', (select sum(l.credit - l.debit) from public.journal_lines l join public.accounts a on a.id = l.account_id
                                      where l.journal_id = j.id and a.subtype = 'vat_payable'))
                         from public.journals j where j.id = r.clearing_journal_id));
end $$;

grant execute on function app.vat_reconciliation(uuid) to authenticated;
create function public.vat_reconciliation(p_tax_period_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select app.vat_reconciliation(p_tax_period_id) $$;
revoke all on function public.vat_reconciliation(uuid) from public, anon;
grant execute on function public.vat_reconciliation(uuid) to authenticated;

create or replace function app.approve_vat_return(p_return_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.vat_returns;
  tp public.tax_periods;
  v_uid uuid;
  v_cfg public.config_versions;
  v_snap jsonb;
  v_hash text;
  v_clear uuid;
begin
  select * into r from public.vat_returns where id = p_return_id for update;
  if r.id is null then raise exception 'VAT return not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(r.organization_id, 'approve_vat');
  if r.status <> 'in_review' then raise exception 'Only a return in review can be approved' using errcode = 'check_violation'; end if;
  if r.prepared_by = v_uid then
    raise exception 'You prepared this return, so someone else must approve it (maker-checker)' using errcode = 'insufficient_privilege';
  end if;
  select * into tp from public.tax_periods where id = r.tax_period_id;
  select * into v_cfg from public.config_versions where status = 'approved' and effective_from <= tp.end_date order by effective_from desc limit 1;
  if v_cfg.id is null then raise exception 'No approved tax-rule version covers this period' using errcode = 'check_violation'; end if;

  v_snap := jsonb_build_object(
    'organization', (select jsonb_build_object('legal_name', legal_name, 'trn', trn, 'emirate', emirate_code) from public.organizations where id = r.organization_id),
    'period', jsonb_build_object('start_date', tp.start_date, 'end_date', tp.end_date, 'due_date', tp.due_date),
    'boxes', (select jsonb_agg(to_jsonb(b) order by b.sort) from app.vat201_boxes(r.organization_id, tp.start_date, tp.end_date, r.id) b),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('box_code', box_code, 'amount', amount, 'vat', vat, 'adjustment', adjustment,
                    'reason', reason, 'legal_reference', legal_reference) order by created_at) from public.vat_return_adjustments where vat_return_id = r.id), '[]'),
    'config_version', v_cfg.label,
    'last_journal_seq', (select coalesce(max((regexp_match(journal_no, '(\d+)$'))[1]::int), 0) from public.journals
                         where organization_id = r.organization_id and journal_no is not null),
    'prepared_by', r.prepared_by, 'approved_by', v_uid, 'approved_at', now());
  v_hash := encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex');

  perform app.set_ctx('approve_vat_return');
  insert into public.vat_return_boxes (vat_return_id, organization_id, box_code, amount, vat, adjustment)
  select r.id, r.organization_id, b ->> 'box_code', (b ->> 'amount')::bigint, (b ->> 'vat')::bigint, (b ->> 'adjustment')::bigint
  from jsonb_array_elements(v_snap -> 'boxes') b;
  -- D-47: clear the VAT accounts into 2120 (the whole balance at the quarter end, so late items are swept up too)
  v_clear := app.post_vat_clearing(r.id, v_uid);
  update public.vat_returns set status = 'approved', approved_by = v_uid, approved_at = now(), config_version_id = v_cfg.id, clearing_journal_id = v_clear,
         snapshot = v_snap, snapshot_sha256 = v_hash where id = r.id;
  perform set_config('app.reason', 'VAT return approved for ' || to_char(tp.start_date, 'DD Mon YYYY') || ' – ' || to_char(tp.end_date, 'DD Mon YYYY'), true);
  update public.accounting_periods set status = 'locked', locked_by = v_uid, locked_at = now(),
         lock_reason = 'VAT return approved (' || to_char(tp.start_date, 'Mon YYYY') || ' – ' || to_char(tp.end_date, 'Mon YYYY') || ')'
   where organization_id = r.organization_id and status = 'open' and start_date >= tp.start_date and end_date <= tp.end_date;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
  return v_hash;
end $$;
