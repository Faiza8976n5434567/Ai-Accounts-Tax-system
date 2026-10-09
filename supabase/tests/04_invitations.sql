-- Invitations (P1-10 · Spec 03 §3.2, CFG-10/11/18 · Spec 02 §2.3 · D-24).
begin;
\ir fixtures/setup.psql
select plan(23);

create temp table inv (k text primary key, id uuid) on commit drop;
grant all on inv to authenticated;

-- Who may invite whom
select tests.login('admin2@test.local');
insert into inv select 'acc', invitation_id from public.create_invitation('New.Accountant@Example.com', 'New Accountant', 'firm_accountant');
select is((select (email::text, status::text, role, full_name) from public.invitations where id = (select id from inv where k = 'acc'))::text,
  '(new.accountant@example.com,pending,firm_accountant,"New Accountant")', 'Firm Admin invites a Firm Accountant; email stored in lower case');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
           from public.invitations where id = (select id from inv where k = 'acc')), 'Invite expires after invite_expiry_days (7)');
select ok(exists (select 1 from public.audit_log where table_name = 'invitations' and action = 'create_invitation'
                  and row_id = (select id from inv where k = 'acc')::text), 'Invitation is audit-logged');
select throws_like($$ select * from public.create_invitation('boss@example.com', 'Boss', 'firm_admin') $$,
  'Only a Super Admin can invite a Firm Admin%', 'Firm Admin cannot invite a Firm Admin (Spec 02 §2.3)');
select throws_like($$ select * from public.create_invitation('client@example.com', 'Client', 'client_owner') $$,
  'Client logins arrive at the pilot%', 'Client roles are not available until Phase 3');
select throws_like($$ select * from public.create_invitation('not-an-email', 'X', 'firm_accountant') $$,
  'That email address does not look right%', 'Malformed email rejected');
select throws_like($$ select * from public.create_invitation('blank@example.com', '  ', 'firm_accountant') $$,
  'Enter the person''s name%', 'Name is required');
select throws_like($$ select * from public.create_invitation('new.accountant@example.com', 'Again', 'firm_accountant') $$,
  '%already has an invitation waiting%', 'A second pending invitation for the same email rejected');
select throws_like($$ select * from public.create_invitation('acct@test.local', 'Already here', 'firm_accountant') $$,
  '%already a member of the firm%', 'Existing staff cannot be invited again');
select throws_ok($$ insert into public.invitations (email, firm_id, role, expires_at)
  values ('direct@example.com', (select id from fx where k = 'tfs'), 'firm_accountant', now() + interval '1 day') $$,
  '42501', null, 'Invitations cannot be inserted directly — only through create_invitation()');

select tests.login('acct@test.local');
select throws_like($$ select * from public.create_invitation('x@example.com', 'X', 'firm_accountant') $$,
  'Only a Firm Admin can invite people%', 'Firm Accountant cannot invite');
select tests.login('admin2@test.local', 'aal1');
select throws_like($$ select * from public.create_invitation('x@example.com', 'X', 'firm_accountant') $$,
  'Two-factor sign-in is required%', 'Inviting needs two-factor sign-in');

select tests.login('super@test.local');
select lives_ok($$ insert into inv select 'adm', invitation_id from public.create_invitation('partner@example.com', 'New Partner', 'firm_admin') $$,
  'Super Admin can invite a Firm Admin');

-- CFG-11 · allowed email domains for firm staff
reset role;
update public.firm_settings set value = '["tfsplus.ae"]'
 where firm_id = (select id from fx where k = 'tfs') and key = 'allowed_email_domains';
select tests.login('admin2@test.local');
select throws_like($$ select * from public.create_invitation('someone@gmail.com', 'Someone', 'firm_accountant') $$,
  'Firm staff must use a firm email address (@tfsplus.ae)%', 'CFG-11 · non-firm email domain rejected');
select lives_ok($$ select * from public.create_invitation('someone@tfsplus.ae', 'Someone', 'firm_accountant') $$,
  'CFG-11 · firm email domain accepted');

-- CFG-18 · copying the link is recorded
select public.mark_invite_link_copied((select id from inv where k = 'acc'));
select ok((select link_copied_at is not null from public.invitations where id = (select id from inv where k = 'acc'))
          and exists (select 1 from public.audit_log where table_name = 'invitations' and action = 'copy_invite_link'),
  'CFG-18 · copying the invite link is audit-logged');

-- Acceptance turns the invitation into a membership (Spec 03 §3.2 step 4)
reset role;
select tests.new_user('new.accountant@example.com', 'Invitee');
select tests.login('new.accountant@example.com', 'aal1');
select is(public.accept_invitation(), 'accepted', 'Invitee signing in accepts the invitation');
reset role;
select is((select m.role::text from public.firm_members m where m.user_id = tests.uid('new.accountant@example.com')),
  'firm_accountant', 'Invitee is now a Firm Accountant of TFS Plus');
select is((select full_name from public.profiles where id = tests.uid('new.accountant@example.com')), 'New Accountant',
  'Name from the invitation is used');
select tests.login('new.accountant@example.com', 'aal1');
select is((select count(*)::int from public.organizations), 0, 'R6 · the new firm user still sees nothing until two-factor is set up');
select is(public.accept_invitation(), 'none', 'Accepting twice does nothing');

-- CFG-10 · an expired invitation cannot be used
reset role;
select set_config('request.jwt.claims', '', true);
update public.invitations set expires_at = now() - interval '1 minute' where id = (select id from inv where k = 'adm');
select tests.new_user('partner@example.com', 'Late Partner');
select tests.login('partner@example.com', 'aal1');
select is(public.accept_invitation(), 'expired', 'CFG-10 · expired invitation is rejected');
reset role;
select ok((select status::text from public.invitations where id = (select id from inv where k = 'adm')) = 'expired'
          and not exists (select 1 from public.firm_members where user_id = tests.uid('partner@example.com')),
  'CFG-10 · status expired and no membership created');

select * from finish();
rollback;
