-- D-62 (Faizan, 2026-10-09) · VAT on sales invoices and credit notes is calculated once per tax code on the document total
-- and spread over the lines, so an e-invoice always meets the FTA rule ALIGNED-IBRP-S-09 (PINT AE: tax per category =
-- taxable × rate within 0.02). Replaces line-level rounding (Principle 5) for sales documents; supplier bills keep the
-- supplier's line VAT. Single-line documents are unchanged.
--   Net prices:        VAT(code) = round-half-up(Σ AED net × rate ÷ 10,000)            (F-01, on the total)
--   Prices incl. VAT:  VAT(code) = round-half-up(Σ AED gross × rate ÷ (10,000 + rate)) (F-02, on the total); net = gross − VAT
--   Spread (largest remainder): each line gets its exact share rounded down; the remaining fils go to the lines with the
--   largest fractions (then the larger amount, then the earlier line). Lines always add up; no line can go negative.
-- USD documents do the same separately in USD (cents) and in AED (fils, after F-24 conversion per line).

create or replace function app.allocate_vat(p_amounts bigint[], p_rate int, p_inclusive boolean) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  v_den numeric := case when p_inclusive then 10000 + p_rate else 10000 end;
  v_n int := coalesce(array_length(p_amounts, 1), 0);
  v_out bigint[];
  v_total bigint;
  v_k int;
  r record;
begin
  if v_n = 0 then return '{}'; end if;
  select app.round_half_up(sum(a)::numeric * p_rate / v_den) into v_total from unnest(p_amounts) a;
  select array_agg(floor(a::numeric * p_rate / v_den)::bigint order by i) into v_out from unnest(p_amounts) with ordinality t(a, i);
  v_k := v_total - (select sum(x) from unnest(v_out) x);
  for r in select i from unnest(p_amounts) with ordinality t(a, i)
           order by (a::numeric * p_rate / v_den) - floor(a::numeric * p_rate / v_den) desc, a desc, i limit greatest(v_k, 0) loop
    v_out[r.i] := v_out[r.i] + 1;
  end loop;
  return v_out;
end $$;

create or replace function app.recalc_sales_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.sales_invoices; g record; v_rate int; v_vat bigint[]; v_vatf bigint[];
begin
  select * into inv from public.sales_invoices where id = p_id;
  update public.sales_invoice_lines l set net_fcy = a.net_fcy, vat_fcy = a.vat_fcy, net = a.net, vat = a.vat
    from public.sales_invoice_lines l2,
         lateral (select * from app.sales_line_amounts(l2.quantity, l2.unit_price, l2.tax_code, inv.currency, inv.fx_rate, inv.issue_date)
                   where not inv.prices_include_vat
                  union all
                  select * from app.sales_line_amounts_gross(l2.quantity, l2.unit_price, l2.tax_code, inv.currency, inv.fx_rate, inv.issue_date)
                   where inv.prices_include_vat) a
   where l.id = l2.id and l.sales_invoice_id = p_id;
  -- D-62: VAT per tax code on the document total (half-up once), spread over the lines by largest remainder.
  for g in select l.tax_code, array_agg(l.id order by l.line_no) ids,
                  array_agg(case when inv.prices_include_vat then l.net + l.vat else l.net end order by l.line_no) aed,
                  array_agg(case when inv.prices_include_vat then l.net_fcy + l.vat_fcy else l.net_fcy end order by l.line_no) fcy
             from public.sales_invoice_lines l where l.sales_invoice_id = p_id group by l.tax_code loop
    v_rate := coalesce((app.config_value((select rate_key from public.tax_codes where code = g.tax_code), inv.issue_date) #>> '{}')::int, 0);
    continue when v_rate = 0;
    v_vat := app.allocate_vat(g.aed, v_rate, inv.prices_include_vat);
    v_vatf := app.allocate_vat(g.fcy, v_rate, inv.prices_include_vat);
    for k in 1 .. array_length(g.ids, 1) loop
      update public.sales_invoice_lines set vat = v_vat[k], vat_fcy = v_vatf[k],
             net = case when inv.prices_include_vat then g.aed[k] - v_vat[k] else net end,
             net_fcy = case when inv.prices_include_vat then g.fcy[k] - v_vatf[k] else net_fcy end
       where id = g.ids[k];
    end loop;
  end loop;
  update public.sales_invoices s set
    net_total = coalesce(t.net, 0), vat_total = coalesce(t.vat, 0), gross_total = coalesce(t.net, 0) + coalesce(t.vat, 0),
    gross_total_fcy = coalesce(t.net_fcy, 0) + coalesce(t.vat_fcy, 0)
  from (select sum(net) net, sum(vat) vat, sum(net_fcy) net_fcy, sum(vat_fcy) vat_fcy from public.sales_invoice_lines where sales_invoice_id = p_id) t
  where s.id = p_id;
end $$;
