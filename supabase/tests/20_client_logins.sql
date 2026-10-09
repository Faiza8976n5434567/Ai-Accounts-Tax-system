-- Client logins (P3-06): invitations, acceptance, removal, read-only limits and the full permission sweep.
-- Spec 02: RBAC-15, RBAC-16, RBAC-20 · D-48, D-49.
begin;
\ir fixtures/setup.psql
select plan(26);

create temp table cl (k text primary key, id uuid) on commit drop;
grant all on cl to authenticated;
select tests.new_user('newstaff@test.local', 'New Staff');
select tests.new_user('auditor@test.local', 'External Auditor');
create function tests.perms() returns text language sql as $$
  select array_to_string(array(select x from unnest(public.my_permissions((select id from fx where k = 'orgA'))) x order by x), ',')
$$;
grant execute on all functions in schema tests to authenticated;

-- RBAC-20 · the full matrix, role by role, as the database applies it to client A
select tests.login('admin2@test.local');
select is(tests.perms(), 'approve_ct,approve_document,approve_refund,approve_vat,assign_staff,bank_match,export,file_ct,file_vat,invite_client_users,lock_period,manage_client,manage_coa,post_journal,prepare,prepare_ct,prepare_vat,record_payment,reopen_period,reverse_journal,upload,view,view_audit',
  'RBAC-20 · Firm Admin: everything');
select tests.login('acct@test.local');
select is(tests.perms(), 'bank_match,export,prepare,prepare_ct,prepare_vat,record_payment,upload,view,view_audit', 'RBAC-20 · Firm Accountant: prepare, bank, VAT draft — never approve or post');
select tests.login('owner@test.local');
select is(tests.perms(), 'approve_document,approve_refund,export,invite_client_users,prepare,record_payment,upload,view,view_audit',
  'RBAC-20 · Client Owner: own company, approve bills/invoices/refunds, invite staff');
select tests.login('staff@test.local');
select is(tests.perms(), 'export,prepare,upload,view', 'RBAC-20 · Client Staff: drafts and uploads only');
select tests.login('ro@test.local');
select is(tests.perms(), 'export,view,view_audit', 'RBAC-20 · Read-only: view and export');
select tests.login('ro_old@test.local');
select is(tests.perms(), '', 'R5 · Read-only after its end date: nothing');

-- The matrix is enforced by the functions themselves
select tests.login('admin2@test.local');
insert into cl values ('ba', public.save_bank_account(null, (select id from fx where k = 'orgA'), jsonb_build_object('name', 'Current', 'account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))));
select tests.login('staff@test.local');
select throws_like($$ select public.save_payment(null, (select id from fx where k = 'orgA'), jsonb_build_object('kind', 'customer_receipt',
  'contact_id', (select id from public.contacts limit 1), 'payment_date', '2026-10-01', 'amount', 100, 'bank_account_id', tests.acct((select id from fx where k = 'orgA'), '1010'))) $$,
  'You are not allowed%', 'RBAC-20 · Client Staff cannot record a receipt');
select tests.login('owner@test.local');
select lives_ok($$ select public.import_bank_statement((select id from cl where k = 'ba'), 'owner.csv', repeat('f', 64), '[{"date": "2026-10-01", "amount": 100, "description": "IN"}]') $$,
  'RBAC-20 · a Client Owner may upload a bank statement');
select throws_like($$ select public.auto_match_bank((select id from cl where k = 'ba')) $$, 'You are not allowed%', 'RBAC-20 · … but not match it (firm staff only)');

-- RBAC-16 / RBAC-15 · what a Client Owner may invite
select is((select role || ' ' || email from public.create_client_invitation((select id from fx where k = 'orgA'), 'NewStaff@test.local', 'New Staff', 'client_staff')),
  'client_staff newstaff@test.local', 'RBAC-16 · a Client Owner invites Client Staff to their own company');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'x@acct.ae', 'X', 'firm_accountant') $$,
  '%firm staff are invited under Users & invites%', 'RBAC-15 · a Client Owner cannot invite a Firm Accountant');
select throws_like($$ select * from public.create_invitation('y@acct.ae', 'Y', 'firm_accountant') $$, 'Only a Firm Admin can invite people%',
  'RBAC-15 · … not through the firm invitation either');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'boss@client.ae', 'Boss', 'client_owner') $$,
  'Only a Firm Admin can invite a Client Owner%', 'Only a Firm Admin invites a Client Owner');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgB'), 'z@client.ae', 'Z', 'client_staff') $$,
  'You are not allowed%', 'A Client Owner cannot invite anyone to another company');

-- D-49 · read-only access: an end date is required, at most 1 year ahead
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'auditor@test.local', 'External Auditor', 'read_only') $$,
  'Read-only access needs an end date%', 'D-49 · read-only needs an end date');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'auditor@test.local', 'External Auditor', 'read_only', current_date + 400) $$,
  'Read-only access can end at most 365 days from today%', 'D-49 · at most 1 year ahead');
select lives_ok($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'auditor@test.local', 'External Auditor', 'read_only', current_date + 90) $$,
  'D-49 · 90 days ahead is accepted');

-- Staff cannot invite; firm staff cannot get a client login
select tests.login('staff@test.local');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'w@client.ae', 'W', 'client_staff') $$, 'You are not allowed%',
  'Client Staff cannot invite anyone');
select tests.login('admin2@test.local');
select throws_like($$ select * from public.create_client_invitation((select id from fx where k = 'orgA'), 'acct2@test.local', 'Acct Two', 'client_staff') $$,
  '%is a member of the firm%', 'Firm staff get access through client assignment, not a client login');

-- Accepting: the membership is created with the inviter as the grantor
select tests.login('newstaff@test.local');
select is(public.accept_invitation(), 'accepted', 'The new user accepts the invitation on first sign-in');
select is((select (role::text, granted_by = tests.uid('owner@test.local'), valid_to is null)::text from public.org_memberships where user_id = tests.uid('newstaff@test.local')),
  '(client_staff,t,t)', 'Client Staff membership created, granted by the Client Owner, no end date');
select is((select count(*) from public.organizations), 1::bigint, 'The new user sees only their own company');
select tests.login('auditor@test.local');
select public.accept_invitation();
select is((select (role::text, valid_to = current_date + 90)::text from public.org_memberships where user_id = tests.uid('auditor@test.local')), '(read_only,t)',
  'R5 · the auditor''s access ends automatically in 90 days');

-- Removing access (reason required; never your own)
select tests.login('owner@test.local');
select throws_like($$ select public.remove_client_user((select id from public.org_memberships where user_id = tests.uid('owner@test.local')), 'leaving') $$,
  '%cannot remove your own access%', 'R4 · a Client Owner cannot remove themselves');
select public.remove_client_user((select id from public.org_memberships where user_id = tests.uid('newstaff@test.local')), 'Left the company');
select tests.login('newstaff@test.local');
select is((select count(*) from public.journals), 0::bigint, 'Removed: the former staff member sees nothing');
select tests.login('owner@test.local');
select is((select string_agg(kind || ' ' || role || ' ' || status, ', ' order by kind, role, status) from public.client_users((select id from fx where k = 'orgA')) where email in
  ('owner@test.local', 'staff@test.local', 'auditor@test.local', 'ro_old@test.local')),
  'member client_owner active, member client_staff active, member read_only active, member read_only ended',
  'The Client users list shows each login with its status (the expired auditor shows as ended)');

select * from finish();
rollback;
