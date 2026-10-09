-- P4-08 · received e-invoices → draft purchase bills, once per UUID, original file kept. Client A.
begin;
\ir fixtures/setup.psql
select plan(8);

create temp table ei (k text primary key, id uuid) on commit drop;
grant all on ei to authenticated;
update public.organizations set trn = '100234567800003' where id = (select id from fx where k = 'orgA');
insert into ei values ('sup', gen_random_uuid());
insert into public.contacts (id, organization_id, kind, name, trn) values ((select id from ei where k = 'sup'), (select id from fx where k = 'orgA'), 'supplier', 'Peppol Supplier LLC', '100345678900003');
create function tests.bill(p_no text, p_amount bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('contact_id', (select id from ei where k = 'sup'), 'supplier_invoice_no', p_no, 'bill_date', '2026-10-05', 'due_date', '2026-11-04',
    'supplier_trn_on_invoice', '100345678900003',
    'lines', jsonb_build_array(jsonb_build_object('description', 'Office chairs', 'quantity', 1, 'unit_price', p_amount, 'tax_code', 'SR',
             'account_id', tests.acct((select id from fx where k = 'orgA'), '6180'))))
$$;
grant execute on all functions in schema tests to authenticated;
select tests.login('acct@test.local');

select throws_like($$ select public.import_einvoice((select id from fx where k = 'orgA'), '<Invoice/>',
  '{"einv_uuid": "11111111-1111-4111-8111-111111111111", "doc_kind": "invoice", "document_number": "SUP-1", "buyer_trn": "100999999900003"}', tests.bill('SUP-1', 100000)) $$,
  '%addressed to TRN 100999999900003%', 'An e-invoice addressed to another TRN is refused');
insert into ei values ('b1', public.import_einvoice((select id from fx where k = 'orgA'), '<Invoice>supplier e-invoice SUP-1</Invoice>',
  '{"einv_uuid": "11111111-1111-4111-8111-111111111111", "doc_kind": "invoice", "document_number": "SUP-1", "supplier_trn": "100345678900003", "buyer_trn": "100234567800003"}',
  tests.bill('SUP-1', 100000)));
select is((select (status::text, supplier_invoice_no, net_total, vat_total, shows_recipient_details)::text from public.purchase_bills where id = (select id from ei where k = 'b1')),
  '(draft,SUP-1,100000,5000,t)', 'The e-invoice becomes a draft bill (1,000 + VAT 50), marked as showing our details');
select is((select (doc_kind, document_number, xml_sha256 = encode(sha256(convert_to('<Invoice>supplier e-invoice SUP-1</Invoice>', 'UTF8')), 'hex'))::text
           from public.einvoice_inbound where purchase_bill_id = (select id from ei where k = 'b1')),
  '(invoice,SUP-1,t)', 'The original file is kept with its fingerprint');
select throws_like($$ select public.import_einvoice((select id from fx where k = 'orgA'), '<Invoice/>',
  '{"einv_uuid": "11111111-1111-4111-8111-111111111111", "doc_kind": "invoice", "document_number": "SUP-1", "buyer_trn": "100234567800003"}', tests.bill('SUP-1b', 100000)) $$,
  '%already imported (supplier document SUP-1)%', 'The same e-invoice (UUID) cannot be imported twice');

-- The bill follows the normal approval
select tests.login('admin2@test.local');
select public.post_purchase_bill((select id from ei where k = 'b1'));
select is((select status::text from public.purchase_bills where id = (select id from ei where k = 'b1')), 'posted', 'Approved and posted like any bill (maker-checker)');

-- A supplier's credit note becomes a debit note on the original bill
select tests.login('acct@test.local');
insert into ei values ('d1', public.import_einvoice((select id from fx where k = 'orgA'), '<CreditNote/>',
  '{"einv_uuid": "22222222-2222-4222-8222-222222222222", "doc_kind": "creditnote", "document_number": "SUP-CN-1", "buyer_trn": "100234567800003"}',
  tests.bill('SUP-CN-1', 20000) || jsonb_build_object('doc_type', 'debit_note', 'original_bill_id', (select id from ei where k = 'b1'))));
select is((select (doc_type::text, net_total, vat_total)::text from public.purchase_bills where id = (select id from ei where k = 'd1')), '(debit_note,20000,1000)',
  'The supplier''s credit note becomes a draft debit note against SUP-1');

-- Permanent record
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ delete from public.einvoice_inbound $$, '42501', null, 'Received e-invoices are never deleted');
select tests.login('ro@test.local');
select is((select count(*) from public.einvoice_inbound where organization_id = (select id from fx where k = 'orgA')), 2::bigint, 'Read-only users can see what was received');

select * from finish();
rollback;
