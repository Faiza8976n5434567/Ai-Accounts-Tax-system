-- Contacts import from the Excel template (P2-07): all-or-nothing checks, existing contacts skipped, never changed.
begin;
\ir fixtures/setup.psql
select plan(9);

select tests.login('acct@test.local');
insert into public.contacts (organization_id, kind, name, trn, phone) values
  ((select id from fx where k = 'orgA'), 'customer', 'Existing Buyer LLC', '100111222333003', '04 111 1111');

-- One bad row stops the whole import, and every problem is listed with its row number
select throws_like($$ select public.import_contacts((select id from fx where k = 'orgA'), '[
  {"row": 2, "kind": "Customer", "name": "Good LLC"},
  {"row": 3, "kind": "Vendor", "name": "Bad Type LLC"},
  {"row": 4, "kind": "Supplier", "name": "Bad TRN LLC", "trn": "200111222333003"},
  {"row": 5, "kind": "Supplier", "name": "Good LLC"},
  {"row": 6, "kind": "Customer", "name": "Wrong Account LLC", "default_account_code": "6100"},
  {"row": 7, "kind": "Customer", "name": "Abroad Inc", "country_code": "GB", "emirate_code": "DXB"}]') $$,
  'Nothing was imported — please correct: Row 3: type must be Customer, Supplier or Both; Row 4: TRN must be 15 digits starting with 1; Row 5: Good LLC appears twice in the file; Row 6: default account 6100 is not an active income account of this client; Row 7: emirate must be%',
  'All-or-nothing: wrong type, bad TRN, duplicate in file, wrong account and emirate abroad are all reported');
select is((select count(*) from public.contacts where name = 'Good LLC'), 0::bigint, 'Nothing was imported');

-- A valid file: new contacts imported, existing ones (same name or same TRN) skipped and listed
select is(public.import_contacts((select id from fx where k = 'orgA'), '[
  {"row": 2, "kind": "Customer", "name": "Gulf Trading LLC", "trn": "100222333444003", "emirate_code": "dxb", "payment_terms_days": "45", "default_account_code": "4010", "default_tax_code": "sr"},
  {"row": 3, "kind": "Supplier", "name": "Cloud Software Inc", "country_code": "us", "default_account_code": "6180", "default_tax_code": "RCS"},
  {"row": 4, "kind": "Both", "name": "  existing buyer llc ", "phone": "050 999 9999"},
  {"row": 5, "kind": "Customer", "name": "Renamed Buyer", "trn": "100111222333003"},
  {"row": 6, "kind": "Customer", "name": "Sister Company LLC", "is_related_party": "Yes"}]'),
  '{"imported": 3, "skipped": [{"row": 4, "name": "existing buyer llc", "reason": "already exists (same name)"}, {"row": 5, "name": "Renamed Buyer", "reason": "already exists (same TRN)"}]}'::jsonb,
  '3 imported; the existing contact matched by name and by TRN is skipped and listed');
select is((select (kind, trn, emirate_code, payment_terms_days, default_tax_code, (select code from public.accounts where id = default_account_id))::text
           from public.contacts where name = 'Gulf Trading LLC'), '(customer,100222333444003,DXB,45,SR,4010)', 'All details imported (codes upper-cased)');
select is((select (country_code, emirate_code is null, payment_terms_days)::text from public.contacts where name = 'Cloud Software Inc'), '(US,t,30)',
  'Foreign supplier: no emirate, payment terms from the firm default (30)');
select is((select is_related_party from public.contacts where name = 'Sister Company LLC'), true, 'Related-party tag imported');
select is((select (name, phone, kind)::text from public.contacts where trn = '100111222333003'), '("Existing Buyer LLC","04 111 1111",customer)',
  'The existing contact is never changed by an import');
select ok(exists (select 1 from public.audit_log where table_name = 'contacts' and reason = 'Contacts import (P2-07)'), 'Imported contacts are in the audit trail with the reason');

-- Only people who can prepare in that client can import
select tests.login('badmin@test.local');
select throws_like($$ select public.import_contacts((select id from fx where k = 'orgA'), '[{"row": 2, "kind": "Customer", "name": "Intruder LLC"}]') $$,
  'You are not allowed%', 'Another firm cannot import into client A');

select * from finish();
rollback;
