-- Compliance calendar and reminders (P3-05 · F-20 · CFG-07 · D-50, D-51).
begin;
\ir fixtures/setup.psql
select plan(11);
grant select on fx to service_role;

-- Client A: licence expires 30 Nov 2026; a VAT quarter due in 14 days; an overdue VAT quarter; a CT year
update public.organizations set licence_expiry = '2026-11-30' where id = (select id from fx where k = 'orgA');
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date) values
  ((select id from fx where k = 'orgA'), 'vat', current_date - 200, current_date - 110, current_date - 82),
  ((select id from fx where k = 'orgA'), 'vat', current_date - 109, current_date - 14, current_date + 14),
  ((select id from fx where k = 'orgA'), 'ct', '2026-01-01', '2026-12-31', '2027-09-30');

select tests.login('acct@test.local');
create temp table cal as select * from public.compliance_calendar('2026-01-01', '2027-12-31') where organization_id = (select id from fx where k = 'orgA');
select is((select due_date || ' ' || detail from cal where rule_key = 'licence_renewal'), '2026-10-31 Licence expires 30 Nov 2026',
  'CFG-07 · licence expiring 30 Nov 2026 → reminder item on 31 Oct 2026 (30 days before)');
select is((select string_agg(status, ',' order by due_date) from cal where rule_key = 'vat_return'), 'overdue,open',
  'VAT returns: the late quarter is overdue, the next one is open');
select is((select due_date::text from cal where rule_key = 'ct_return'), '2027-09-30', 'Corporate Tax return due 9 months after the year end');
select is((select due_date::text from cal where rule_key = 'einvoicing_asp'), (select (app.config_value('einvoicing.asp_by', current_date) #>> '{}')),
  'D-51 · the e-invoicing ASP date comes from the tax rules, on every client');
select ok((select count(*) from public.compliance_calendar(current_date, current_date + 30) where rule_key = 'vat_return' and status = 'overdue'
           and organization_id = (select id from fx where k = 'orgA')) = 1, 'Overdue items show even when they are before the date range');

-- D-50 · who is reminded (the daily job runs with the secret key)
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select is((select string_agg(email || ':' || audience, ', ' order by email) from public.due_reminders(current_date)
           where organization_id = (select id from fx where k = 'orgA') and rule_key = 'vat_return'),
  'acct@test.local:firm, owner@test.local:client, staff@test.local:client',
  'D-50 · 14 days before: the assigned accountant, the Client Owner and Client Staff — not the Read-only users');
select is((select count(*) from public.due_reminders(current_date + 1) where organization_id = (select id from fx where k = 'orgA') and rule_key = 'vat_return'),
  0::bigint, 'No reminder on a day that is not 14, 7 or 1 days before');
reset role;
insert into public.tax_periods (organization_id, kind, start_date, end_date, due_date)
values ((select id from fx where k = 'orgB'), 'vat', current_date - 100, current_date - 7, current_date + 7);
set local role service_role;
select ok((select bool_and(audience = 'firm') and bool_or(email = 'admin2@test.local') from public.due_reminders(current_date)
           where organization_id = (select id from fx where k = 'orgB')), 'D-50 · a client with no assigned staff: the Firm Admins are reminded');
reset role;

-- Only the server may read the reminder list; the email log is permanent
select tests.login('admin2@test.local');
select throws_like($$ select * from public.due_reminders(current_date) $$, 'permission denied%', 'Signed-in users cannot read the reminder list');
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.email_log (kind, to_email, subject, dedupe_key, status, provider_id) values ('deadline_reminder', 'a@b.ae', 'S', 'k1', 'sent', 'p1');
select throws_ok($$ insert into public.email_log (kind, to_email, subject, dedupe_key, status) values ('deadline_reminder', 'a@b.ae', 'S', 'k1', 'sent') $$,
  '23505', null, 'The same reminder is never sent twice');
select throws_ok($$ update public.email_log set status = 'failed' where dedupe_key = 'k1' $$, '42501', null, 'The email log cannot be changed');

select * from finish();
rollback;
