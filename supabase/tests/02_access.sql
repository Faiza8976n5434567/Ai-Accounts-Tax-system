-- Who can see and do what (Spec 02 RBAC-*, Spec 04 SEC-*, Spec 01 DM-12 → DM-14).
-- Each check signs in as a real test user, exactly as the API would.
begin;
\ir fixtures/setup.psql
select plan(39);

-- RBAC-01 / SEC-01 · not signed in
select tests.anon();
select throws_ok($$ select * from public.journals $$, '42501', null, 'RBAC-01 · anonymous cannot read journals');
select throws_ok($$ select * from public.organizations $$, '42501', null, 'RBAC-01 · anonymous cannot read clients');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'RBAC-01 · anonymous cannot read people');
select is((select string_agg(key, ',' order by key) from public.platform_settings), 'app_name,logo_path',
  'Anonymous sees only the public platform settings (app name, logo)');
select throws_ok($$ select public.post_journal(gen_random_uuid()) $$, '42501', null,
  'RBAC-01 · anonymous cannot call posting functions');

-- Firm Admin sees every client of the firm; Firm Accountant only assigned clients
select tests.login('admin2@test.local');
select is((select count(*)::int from public.organizations), 2, 'Firm Admin sees both TFS Plus clients');
select tests.login('acct@test.local');
select is((select string_agg(legal_name, ',') from public.organizations), 'Client A LLC',
  'Firm Accountant sees only the assigned client');
select tests.login('acct2@test.local');
select is((select count(*)::int from public.journals), 0, 'RBAC-03 · unassigned Firm Accountant sees no journals');
select is((select count(*)::int from public.organizations), 0, 'RBAC-03 · … and no clients');

-- RBAC-02 · client users are confined to their own company
select tests.login('staff@test.local');
select is((select count(*)::int from public.journals where organization_id = (select id from fx where k = 'orgB')), 0,
  'RBAC-02 · Client Staff of A cannot read B''s journals');
select is((select count(*)::int from public.journals), 1, 'Client Staff of A reads A''s journal');
select throws_ok($$ insert into public.journals (organization_id, entry_date, memo)
  values ((select id from fx where k = 'orgB'), '2026-02-01', 'sneaky') $$, '42501', null,
  'Client Staff cannot create a journal in another client');

-- RBAC-12 / RBAC-13 · read-only access (R5)
select tests.login('ro@test.local');
select is((select count(*)::int from public.journals), 1, 'Read-only user within dates can read');
select throws_ok($$ insert into public.journals (organization_id, entry_date, memo)
  values ((select id from fx where k = 'orgA'), '2026-02-01', 'x') $$, '42501', null,
  'RBAC-13 · Read-only user cannot create a draft');
select tests.login('ro_old@test.local');
select is((select count(*)::int from public.journals), 0, 'RBAC-12 · Read-only access ends after valid_to');

-- RBAC-14 · firm users without two-factor see nothing
select tests.login('admin2@test.local', 'aal1');
select is((select count(*)::int from public.organizations), 0, 'RBAC-14 · Firm Admin without MFA sees no clients');
select is((select count(*)::int from public.journals), 0, 'RBAC-14 · … and no journals');
select throws_like($$ select public.post_journal((select id from fx where k = 'jfix')) $$,
  'Two-factor sign-in is required%', 'RBAC-14 · … and cannot post');
select tests.login('staff@test.local', 'aal1');
select is((select count(*)::int from public.journals), 1, 'Client users are not forced to use MFA (yet)');

-- SEC-16 · a suspended user loses access immediately, even with a valid token
reset role;
select set_config('request.jwt.claims', '', true);
select app.set_ctx('set_user_status');
update public.profiles set status = 'suspended' where id = tests.uid('acct@test.local');
select app.set_ctx(null);
select tests.login('acct@test.local');
select is((select count(*)::int from public.journals), 0, 'SEC-16 · suspended user sees nothing');

-- RBAC-10 · nobody promotes themselves (R4)
select tests.login('admin2@test.local');
select throws_ok($$ update public.profiles set is_super_admin = true where id = tests.uid('admin2@test.local') $$,
  '42501', null, 'RBAC-10 · Firm Admin cannot set own Super Admin flag');
select throws_like($$ select public.set_super_admin(tests.uid('admin2@test.local'), true, 'me') $$,
  'Only a Super Admin%', 'RBAC-10 · … nor through the function');
select tests.login('super@test.local');
select throws_like($$ select public.set_super_admin(tests.uid('super@test.local'), false, 'step down') $$,
  'You cannot change your own%', 'R4 · Super Admin cannot change own flag');
select throws_like($$ select public.set_user_status(tests.uid('super@test.local'), 'suspended', 'x') $$,
  'You cannot change your own%', 'R4 · Super Admin cannot suspend self');
select throws_ok($$ update public.firm_members set role = 'firm_accountant' where user_id = tests.uid('super@test.local') $$,
  '42501', null, 'R4 · nobody changes their own firm role');

-- RBAC-24 / DM-13 · only platform-owner firm admins can be Super Admin
select throws_like($$ select public.set_super_admin(tests.uid('badmin@test.local'), true, 'help') $$,
  'Only Firm Admins of the platform-owner firm%', 'RBAC-24 · cannot make a firm-B user Super Admin');
select throws_like($$ select public.set_super_admin(tests.uid('acct2@test.local'), true, 'help') $$,
  'Only Firm Admins of the platform-owner firm%', 'DM-13 · a Firm Accountant cannot be Super Admin');

-- RBAC-11 · the last active Super Admin cannot be removed (R7)
reset role;
select set_config('request.jwt.claims', '', true);
select app.set_ctx('set_super_admin');
select throws_like($$ update public.profiles set is_super_admin = false where id = tests.uid('super@test.local') $$,
  'The last active Super Admin%', 'RBAC-11 · last Super Admin cannot be removed');
select app.set_ctx('set_user_status');
select throws_like($$ update public.profiles set status = 'suspended' where id = tests.uid('super@test.local') $$,
  'The last active Super Admin%', 'RBAC-11 · last Super Admin cannot be suspended');
select app.set_ctx(null);

-- DM-12 / DM-14
select throws_ok($$ insert into public.org_memberships (organization_id, user_id, role)
  values ((select id from fx where k = 'orgB'), tests.uid('ro@test.local'), 'read_only') $$, '23514', null,
  'DM-12 · read-only access without an end date rejected');
select throws_ok($$ insert into public.firms (legal_name, is_platform_owner) values ('Pretender', true) $$, '23505', null,
  'DM-14 · a second platform owner rejected');

-- Firm Admins invite/assign accountants only; Firm Accountant cannot assign anyone
select tests.login('admin2@test.local');
select throws_ok($$ insert into public.firm_members (firm_id, user_id, role)
  values ((select id from fx where k = 'tfs'), tests.uid('owner@test.local'), 'firm_admin') $$, '42501', null,
  'Firm Admin cannot create another Firm Admin');
select tests.login('acct2@test.local');
select throws_ok($$ insert into public.org_memberships (organization_id, user_id, role)
  values ((select id from fx where k = 'orgA'), tests.uid('acct2@test.local'), 'firm_accountant') $$, '42501', null,
  'Firm Accountant cannot grant themselves access');

-- RBAC-21 / RBAC-23 · firms are fully separated, even from Super Admins (D-20)
select tests.login('super@test.local');
select is((select count(*)::int from public.organizations where id = (select id from fx where k = 'orgC')), 0,
  'RBAC-21 · Super Admin cannot read another firm''s client without a support grant');
select tests.login('badmin@test.local');
select is((select string_agg(legal_name, ',') from public.organizations), 'Firm B Client C LLC',
  'RBAC-23 · Firm B admin sees only Firm B clients');
select is((select count(*)::int from public.firm_members where firm_id = (select id from fx where k = 'tfs')), 0,
  'RBAC-23 · … and none of TFS Plus''s staff');

-- RBAC-18 · documents bucket: folders are per client
reset role;
select set_config('request.jwt.claims', '', true);
insert into storage.objects (bucket_id, name) values
  ('documents', (select id from fx where k = 'orgB') || '/bill.pdf'),
  ('documents', (select id from fx where k = 'orgA') || '/bill.pdf');
select tests.login('staff@test.local');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 1,
  'RBAC-18 · Client Staff sees only their own client''s documents');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('documents', '%s/evil.pdf') $$,
  (select id from fx where k = 'orgB')), '42501', null, 'RBAC-18 · … and cannot upload into another client''s folder');

-- RBAC-19 · owner-only helpers are not callable by signed-in users
select ok(not has_function_privilege('authenticated', 'app.bootstrap_super_admin(text)', 'execute')
      and not has_function_privilege('authenticated', 'app.setup_table(regclass, boolean)', 'execute')
      and not has_function_privilege('anon', 'app.has_perm(uuid, text)', 'execute'),
  'RBAC-19 · bootstrap and set-up helpers are not executable by API roles');

select * from finish();
rollback;
