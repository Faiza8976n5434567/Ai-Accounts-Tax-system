-- D-63 · any accredited ASP per client, manual hand-off tracked (sent → accepted / rejected → resend);
-- D-64 · e-invoice fields set on the line itself. Client A.
begin;
\ir fixtures/setup.psql
select plan(14);

create temp table ae (k text primary key, id uuid) on commit drop;
grant all on ae to authenticated;
insert into ae values ('biz', gen_random_uuid()), ('cons', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn, customer_type) values
  ((select id from ae where k = 'biz'), (select id from fx where k = 'orgA'), 'customer', 'Business Buyer LLC', '100111222300003', 'business'),
  ((select id from ae where k = 'cons'), (select id from fx where k = 'orgA'), 'customer', 'Walk-in customer', null, 'consumer');
create function tests.einv(p_key text, p_contact text, p_line jsonb) returns void language plpgsql as $$
begin
  perform tests.login('acct@test.local');
  insert into ae values (p_key, public.save_sales_invoice(null, (select id from fx where k = 'orgA'), jsonb_build_object(
    'contact_id', (select id from ae where k = p_contact), 'issue_date', '2026-10-05',
    'lines', jsonb_build_array(jsonb_build_object('description', 'Supply', 'quantity', 1, 'unit_price', 100000, 'tax_code', 'SR',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '4010')) || p_line))));
end $$;
grant execute on all functions in schema tests to authenticated;

-- 1 · The official list (MoF, 9 Oct 2026)
select is((select count(*) filter (where status = 'accredited') || ' + ' || count(*) filter (where status = 'final_assessment') from public.asp_providers), '65 + 5',
  'D-63 · 65 accredited ASPs and 5 under final assessment, as published by the Ministry of Finance');

-- 2 · D-64: e-invoice fields on the line itself (no item)
select tests.einv('inv', 'biz', '{"item_type": "G", "hs_code": "84713000", "unit_code": "H87"}');
select is((select (item_id is null, item_type, hs_code, sac_code is null, unit_code)::text from public.sales_invoice_lines where sales_invoice_id = (select id from ae where k = 'inv')),
  '(t,G,84713000,t,H87)', 'D-64 · goods, HS code and unit set on the line without an item');
select tests.einv('cons_inv', 'cons', '{}');

-- 3 · Hand-off rules
select throws_like($$ select public.record_einvoice_sent((select id from ae where k = 'inv'), repeat('a', 64)) $$, '%Approve the document first%',
  'A draft cannot be handed to the ASP');
select public.submit_sales_invoice((select id from ae where k = 'inv'));
select public.submit_sales_invoice((select id from ae where k = 'cons_inv'));
select tests.login('admin2@test.local');
select public.post_sales_invoice((select id from ae where k = 'inv'));
select public.post_sales_invoice((select id from ae where k = 'cons_inv'));
select throws_like($$ select public.record_einvoice_sent((select id from ae where k = 'inv'), repeat('a', 64)) $$, '%Choose the client''s ASP first%',
  'The client''s ASP must be chosen first');
update public.organizations set asp_provider_id = (select id from public.asp_providers where accreditation_no = '112219'), asp_status = 'sandbox'
 where id = (select id from fx where k = 'orgA');
select is((select p.name || ' · ' || o.asp_status from public.organizations o join public.asp_providers p on p.id = o.asp_provider_id where o.id = (select id from fx where k = 'orgA')),
  'Complyance Electronics L.L.C · sandbox', 'The Firm Admin chooses the client''s ASP and its onboarding status');
select throws_like($$ select public.record_einvoice_sent((select id from ae where k = 'cons_inv'), repeat('a', 64)) $$, '%not e-invoiced (D-59)%',
  'Consumer documents are not e-invoiced');

select tests.login('acct@test.local');
insert into ae values ('s1', public.record_einvoice_sent((select id from ae where k = 'inv'), repeat('ab', 32), 'CPL-0001'));
select is((select (attempt, status::text, channel, asp_reference)::text from public.einvoice_submissions where id = (select id from ae where k = 's1')),
  '(1,sent,manual,CPL-0001)', 'Hand-off 1 recorded: manual, sent, with the ASP''s reference and the file fingerprint');
select throws_like($$ select public.record_einvoice_sent((select id from ae where k = 'inv'), repeat('ab', 32)) $$, '%Already handed to the ASP%',
  'It cannot be handed over twice while waiting for an answer');
select throws_like($$ select public.record_einvoice_result((select id from ae where k = 's1'), 'rejected') $$, '%reason the ASP gave%',
  'A rejection needs the reason');
select public.record_einvoice_result((select id from ae where k = 's1'), 'rejected', 'IBR-144-AE: buyer city missing');

-- 4 · Rejection queue → fix → resend → accepted
insert into ae values ('s2', public.record_einvoice_sent((select id from ae where k = 'inv'), repeat('cd', 32)));
select is((select string_agg(attempt || ' ' || status, ', ' order by attempt) from public.einvoice_submissions where sales_invoice_id = (select id from ae where k = 'inv')),
  '1 rejected, 2 sent', 'After a rejection the corrected file is sent again as attempt 2');
select public.record_einvoice_result((select id from ae where k = 's2'), 'accepted', null, 'CPL-0002');
select throws_like($$ select public.record_einvoice_result((select id from ae where k = 's2'), 'rejected', 'x') $$, '%already recorded%',
  'An answer, once recorded, is final');

-- 5 · Permanent record
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ delete from public.einvoice_submissions where id = (select id from ae where k = 's1') $$, '42501', null, 'Hand-offs are never deleted');
select throws_ok($$ update public.einvoice_submissions set asp_reference = 'X' where id = (select id from ae where k = 's2') $$, '42501', null,
  'and never edited directly');
select tests.login('ro@test.local');
select is((select count(*) from public.einvoice_submissions where organization_id = (select id from fx where k = 'orgA')), 2::bigint, 'Read-only users can see the history');

select * from finish();
rollback;
