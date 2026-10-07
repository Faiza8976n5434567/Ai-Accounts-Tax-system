-- Customers and suppliers (P2-01 · Spec 01 §4.4 · F-13, F-18).
begin;
\ir fixtures/setup.psql
select plan(14);

create temp table cc (k text primary key, id uuid) on commit drop;
grant all on cc to authenticated;

select tests.login('acct@test.local');
with x as (insert into public.contacts (organization_id, kind, name, trn, emirate_code, email)
  values ((select id from fx where k = 'orgA'), 'customer', '  Gulf Buyer LLC ', '100211938400003', 'DXB', 'ap@gulfbuyer.ae') returning id)
insert into cc select 'cust', id from x;
select is((select (name, payment_terms_days, country_code)::text from public.contacts where id = (select id from cc where k = 'cust')),
  '("Gulf Buyer LLC",30,AE)', 'Name trimmed; payment terms default to the firm setting (30 days, F-13); country AE');
select ok(exists (select 1 from public.audit_log where table_name = 'contacts' and row_id = (select id from cc where k = 'cust')::text),
  'Creating a contact is audit-logged');

select throws_ok($$ insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'supplier', 'gulf buyer llc') $$,
  '23505', null, 'No duplicate contacts in one client (same name, any case)');
select throws_ok($$ insert into public.contacts (organization_id, kind, name, trn) values ((select id from fx where k = 'orgA'), 'supplier', 'Bad TRN Co', '12345') $$,
  '23514', null, 'F-18 · a TRN must be 15 digits starting with 1');
select throws_ok($$ insert into public.contacts (organization_id, kind, name, country_code, emirate_code) values ((select id from fx where k = 'orgA'), 'customer', 'London Ltd', 'GB', 'DXB') $$,
  '23514', null, 'A foreign contact has no emirate');
select throws_ok($$ insert into public.contacts (organization_id, kind, name, payment_terms_days) values ((select id from fx where k = 'orgA'), 'customer', 'Slow Payer', 400) $$,
  '23514', null, 'Payment terms must be 0–365 days');
select throws_ok($$ insert into public.contacts (organization_id, kind, name, email) values ((select id from fx where k = 'orgA'), 'customer', 'No Mail Co', 'not-an-email') $$,
  '23514', null, 'Email must look like an email address');
select throws_ok($$ insert into public.contacts (organization_id, kind, name, default_account_id) values ((select id from fx where k = 'orgA'), 'supplier', 'Cross Client',
  tests.acct((select id from fx where k = 'orgB'), '6100')) $$, '23503', null, 'Default account must belong to the same client');
with x as (insert into public.contacts (organization_id, kind, name, default_account_id, default_tax_code, is_related_party)
  values ((select id from fx where k = 'orgA'), 'supplier', 'Office Landlord LLC', tests.acct((select id from fx where k = 'orgA'), '6100'), 'SR', true) returning id)
insert into cc select 'sup', id from x;
select is((select (kind, default_tax_code, is_related_party)::text from public.contacts where id = (select id from cc where k = 'sup')),
  '(supplier,SR,t)', 'Supplier with a default expense account, tax code and related-party tag');
select throws_ok($$ delete from public.contacts where id = (select id from cc where k = 'sup') $$, '42501', null,
  'Contacts are never deleted — deactivate instead');

-- Access follows the client
select tests.login('acct2@test.local');
select is((select count(*)::int from public.contacts), 0, 'An unassigned accountant sees no contacts');
select throws_ok($$ insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'customer', 'Sneaky') $$,
  '42501', null, '… and cannot add any');
select tests.login('ro@test.local');
select throws_ok($$ insert into public.contacts (organization_id, kind, name) values ((select id from fx where k = 'orgA'), 'customer', 'Read only') $$,
  '42501', null, 'A read-only user cannot add contacts');

-- Journals may only name a contact of the same client
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ insert into public.journals (organization_id, entry_date, memo, contact_id)
  values ((select id from fx where k = 'orgB'), '2026-05-01', 'x', (select id from cc where k = 'cust')) $$, '23503', null,
  'A journal cannot name another client''s contact');

select * from finish();
rollback;
