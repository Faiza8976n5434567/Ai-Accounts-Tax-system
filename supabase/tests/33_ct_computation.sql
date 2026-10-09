-- P5-01 · Corporate Tax computation and return (PLAN §6.6 CT-01 → CT-10, F-08 → F-11, D-65 → D-67). One client per case,
-- FY 2026, books posted through the normal journal workflow. Amounts in fils (AED 375,000.00 = 37500000).
begin;
\ir fixtures/setup.psql
select plan(32);

create temp table ct (k text primary key, id uuid) on commit drop;
grant all on ct to authenticated;

-- A client with CT periods FY2026 and FY2027 (due 9 months after the year end)
create function tests.ct_client(p_key text, p_regime public.ct_regime default 'standard') returns void language plpgsql as $$
declare v_org uuid := tests.new_client((select id from fx where k = 'tfs'), 'CT ' || p_key, 2026);
begin
  update public.organizations set ct_regime = p_regime where id = v_org;
  insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
  values (v_org, 'ct', '2026-01-01', '2026-12-31', '2027-09-30'), (v_org, 'ct', '2027-01-01', '2027-12-31', '2028-09-30');
  insert into ct values (p_key, v_org);
  insert into ct select p_key || '26', id from public.tax_periods where organization_id = v_org and kind = 'ct' and start_date = '2026-01-01';
  insert into ct select p_key || '27', id from public.tax_periods where organization_id = v_org and kind = 'ct' and start_date = '2027-01-01';
end $$;
-- Posts Dr p_dr / Cr p_cr (prepared by one admin, posted by another)
create function tests.ct_jv(p_key text, p_date date, p_dr text, p_cr text, p_amount bigint) returns void language plpgsql as $$
declare v_org uuid := (select id from ct where k = p_key); v_id uuid;
begin
  perform tests.login('admin2@test.local');
  insert into public.journals (organization_id, entry_date, memo) values (v_org, p_date, 'CT test') returning id into v_id;
  insert into public.journal_lines (journal_id, organization_id, line_no, account_id, debit, credit) values
    (v_id, v_org, 1, tests.acct(v_org, p_dr), p_amount, 0), (v_id, v_org, 2, tests.acct(v_org, p_cr), 0, p_amount);
  perform tests.login('super@test.local');
  perform public.post_journal(v_id);
end $$;
create function tests.ctc(p_period text, p_field text) returns text language sql as $$
  select public.ct_return_preview((select id from ct where k = p_period)) ->> p_field
$$;
grant execute on all functions in schema tests to authenticated;

-- CT-01 · taxable income 375,000 → CT 0
reset role;
select tests.ct_client('a');
select tests.ct_jv('a', '2026-06-30', '1150', '4000', 37500000);
select is(tests.ctc('a26', 'ct_payable'), '0', 'CT-01 · taxable income 375,000 → CT 0 (0% band)');

-- CT-02 · taxable income 1,000,000 → CT 56,250; the CT expense account is outside profit before tax
reset role;
select tests.ct_client('b');
select tests.ct_jv('b', '2026-03-31', '1150', '4000', 150000000);
select tests.ct_jv('b', '2026-04-30', '6100', '1150', 50000000);
select tests.ct_jv('b', '2026-12-31', '7000', '1150', 1234500);
select is(tests.ctc('b26', 'accounting_profit'), '100000000', 'CT-02 · profit before tax 1,000,000 (CT expense excluded)');
select is((select string_agg((x ->> 'account_code') || ':' || (x ->> 'amount'), ' ' order by x ->> 'account_code')
             from jsonb_array_elements(public.ct_return_preview((select id from ct where k = 'b26')) -> 'profit_lines') x),
          '4000:150000000 6100:50000000', 'Principle 10 · profit drills down to each account (CT expense not listed)');
select is(tests.ctc('b26', 'ct_payable'), '5625000', 'CT-02 · taxable income 1,000,000 → CT 56,250');
select is(public.ct_return_preview((select id from ct where k = 'b26')) #>> '{period,due_date}', '2027-09-30', 'CT-10 · FY ending 31 Dec 2026 → return and payment due 30 Sep 2027');
select is(tests.ctc('b27', 'ct_payable'), '0', 'CT-02 · another year''s books do not leak in');

-- CT-03 / CT-04 · tagged add-backs (F-08, D-66)
reset role;
select tests.ct_client('c');
select tests.ct_jv('c', '2026-05-31', '1150', '4000', 100000000);
select tests.ct_jv('c', '2026-05-31', '6140', '1150', 1000000);   -- entertainment 10,000
select tests.ct_jv('c', '2026-05-31', '6160', '1150', 150000);    -- fines 1,500
select tests.ct_jv('c', '2026-05-31', '6170', '1150', 500000);    -- donation 5,000
select is((select string_agg((x ->> 'account_code') || ':' || (x ->> 'add_back'), ' ' order by x ->> 'account_code')
             from jsonb_array_elements(public.ct_return_preview((select id from ct where k = 'c26')) -> 'addbacks') x),
          '6140:500000 6160:150000 6170:500000', 'CT-03/04 · add-backs: entertainment 5,000 (50%), fines 1,500, donation 5,000');
select is(tests.ctc('c26', 'taxable_income_before_losses'), (100000000 - 1650000 + 1150000)::text, 'CT-03/04 · add-backs raise taxable income');

-- Manual adjustments (D-66): reason and legal reference required; maker-checker; frozen after approval
select tests.login('admin2@test.local');
insert into ct values ('cr', public.start_ct_return((select id from ct where k = 'c26')));
select throws_like($$ select public.add_ct_adjustment((select id from ct where k = 'cr'), 'add', 100, 'x', '') $$, '%legal reference%', 'D-66 · a manual adjustment needs a legal reference');
insert into ct values ('adj', public.add_ct_adjustment((select id from ct where k = 'cr'), 'deduct', 2000000, 'Exempt dividend', 'FDL 47/2022 Art 22'));
insert into ct values ('adj2', public.add_ct_adjustment((select id from ct where k = 'cr'), 'add', 300000, 'Wrong line', 'FDL 47/2022 Art 28'));
select public.delete_ct_adjustment((select id from ct where k = 'adj2'));
select is(tests.ctc('c26', 'adjustments_total'), '-2000000', 'D-66 · manual deduction counted; a deleted line no longer counts');
select is(tests.ctc('c26', 'taxable_income_before_losses'), (100000000 - 1650000 + 1150000 - 2000000)::text, 'D-66 · TI = profit + add-backs ± adjustments');
select throws_ok($$ select public.approve_ct_return((select id from ct where k = 'cr')) $$, '42501', null, 'Maker-checker · the preparer cannot approve the CT return');
select tests.login('acct@test.local');
select throws_ok($$ select public.ct_return_preview((select id from ct where k = 'c26')) $$, '42501', null, 'RLS · an accountant without access to the client sees nothing');
select tests.login('super@test.local');
select ok((public.approve_ct_return((select id from ct where k = 'cr'))) ~ '^[0-9a-f]{64}$', 'Approval freezes a snapshot with its SHA-256');
select is((select snapshot_sha256 from public.ct_returns where id = (select id from ct where k = 'cr')),
          encode(sha256(convert_to((select snapshot::text from public.ct_returns where id = (select id from ct where k = 'cr')), 'UTF8')), 'hex'), 'The stored hash matches the snapshot');
select isnt((select config_version_id from public.ct_returns where id = (select id from ct where k = 'cr')), null, 'Principle 6 · the tax-rule version is recorded');
select throws_like($$ select public.add_ct_adjustment((select id from ct where k = 'cr'), 'add', 100, 'Late', 'Art 1') $$, '%draft%', 'An approved return takes no more adjustments');
select tests.ct_jv('c', '2026-06-30', '1150', '4000', 99900000);
select is(tests.ctc('c26', 'taxable_income_before_losses'), (100000000 - 1650000 + 1150000 - 2000000)::text, 'The approved return shows its frozen snapshot, not later postings');
select throws_like($$ select public.file_ct_return((select id from ct where k = 'cr'), '2027-09-01', '') $$, '%FTA reference%', 'Filing needs the FTA reference');
select public.file_ct_return((select id from ct where k = 'cr'), '2027-09-01', 'CT-FTA-123');
select is((select status::text from public.ct_returns where id = (select id from ct where k = 'cr')), 'filed', 'The return is marked as filed');
select throws_ok($$ update public.ct_returns set fta_reference = 'X' where id = (select id from ct where k = 'cr') $$, '42501', null, 'A CT return cannot be changed outside the workflow');

-- CT-05 · accounting loss 200,000 → CT 0; carried forward and brought into the next year once approved
reset role;
select tests.ct_client('d');
select tests.ct_jv('d', '2026-07-31', '1150', '4000', 10000000);
select tests.ct_jv('d', '2026-07-31', '6000', '1150', 30000000);
select is(tests.ctc('d26', 'ct_payable') || ' / ' || tests.ctc('d26', 'losses_cf'), '0 / 20000000', 'CT-05 · loss 200,000 → CT 0, carried forward');
select tests.login('admin2@test.local');
insert into ct values ('dr', public.start_ct_return((select id from ct where k = 'd26')));
select tests.login('super@test.local');
select public.approve_ct_return((select id from ct where k = 'dr'));
select is(tests.ctc('d27', 'losses_bf'), '20000000', 'CT-05 · the approved loss is brought forward into FY2027');

-- CT-06 · loss b/f 500,000, TI 2,000,000 → relief 500,000 → CT 101,250
reset role;
select tests.ct_client('e');
update public.organizations set ct_losses_opening = 50000000 where id = (select id from ct where k = 'e');
select tests.ct_jv('e', '2026-08-31', '1150', '4000', 200000000);
select is(tests.ctc('e26', 'loss_relief') || ' / ' || tests.ctc('e26', 'ct_payable') || ' / ' || tests.ctc('e26', 'losses_cf'), '50000000 / 10125000 / 0',
          'CT-06 · relief 500,000 → taxable 1,500,000 → CT 101,250');

-- CT-07 · loss b/f 1,000,000, TI 800,000 → relief capped at 600,000 → CT 0; 400,000 c/f
reset role;
select tests.ct_client('f');
update public.organizations set ct_losses_opening = 100000000 where id = (select id from ct where k = 'f');
select tests.ct_jv('f', '2026-08-31', '1150', '4000', 80000000);
select is(tests.ctc('f26', 'loss_relief') || ' / ' || tests.ctc('f26', 'taxable_income') || ' / ' || tests.ctc('f26', 'ct_payable') || ' / ' || tests.ctc('f26', 'losses_cf'),
          '60000000 / 20000000 / 0 / 40000000', 'CT-07 · relief capped at 75% (600,000) → 200,000 → CT 0; 400,000 c/f');

-- CT-08 · SBR: revenue exactly 3,000,000 → eligible, taxable income nil; a loss is not carried, earlier losses wait (D-67)
reset role;
select tests.ct_client('g', 'sbr');
update public.organizations set ct_losses_opening = 7000000 where id = (select id from ct where k = 'g');
select tests.ct_jv('g', '2026-09-30', '1150', '4000', 300000000);
select tests.ct_jv('g', '2026-09-30', '6100', '1150', 50000000);
select is(tests.ctc('g26', 'sbr_applied') || ' / ' || tests.ctc('g26', 'taxable_income') || ' / ' || tests.ctc('g26', 'ct_payable') || ' / ' || tests.ctc('g26', 'losses_cf'),
          'true / 0 / 0 / 7000000', 'CT-08 · SBR: revenue 3,000,000 → taxable income nil; earlier losses kept unused');
reset role;
select tests.ct_client('h', 'sbr');
select tests.ct_jv('h', '2026-09-30', '1150', '4000', 10000000);
select tests.ct_jv('h', '2026-09-30', '6100', '1150', 30000000);
select is(tests.ctc('h26', 'loss_of_period') || ' / ' || tests.ctc('h26', 'losses_cf'), '0 / 0', 'D-67 · the loss of an SBR period is not carried forward');

-- CT-09 · SBR elected, revenue 3,000,001 → not eligible → standard computation with a warning
reset role;
select tests.ct_client('i', 'sbr');
select tests.ct_jv('i', '2026-09-30', '1150', '4000', 300000100);
select is(tests.ctc('i26', 'sbr_applied') || ' / ' || tests.ctc('i26', 'ct_payable'), 'false / 23625009', 'CT-09 · revenue 3,000,001 → standard: CT 236,250.09');
select ok((public.ct_return_preview((select id from ct where k = 'i26')) #>> '{warnings,0}') ~ 'revenue above the limit', 'CT-09 · the screen says why SBR does not apply');
-- …and a year above the limit blocks SBR for every later year (F-11)
select tests.ct_jv('i', '2027-03-31', '1150', '4000', 100000);
select ok((public.ct_return_preview((select id from ct where k = 'i27')) #>> '{warnings,0}') ~ 'limit in 2026/2026', 'F-11 · an earlier year above the limit blocks SBR later');
select is(tests.ctc('i27', 'sbr_applied'), 'false', 'F-11 · SBR not applied after a year above the limit');

-- Permissions: a client owner may look but not prepare
select tests.login('ro@test.local');
select throws_ok($$ select public.start_ct_return((select id from ct where k = 'a26')) $$, '42501', null, 'RBAC · read-only users cannot prepare a CT return');

select * from finish();
rollback;
