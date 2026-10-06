-- P1-05 · Configuration (Spec 01 §4.11 · Spec 03). Tax-rule *parameters* are versioned data
-- with effective dates; formula *logic* stays in tested code. Seeded from the POC's
-- TAX_CONFIG (`poc/src/lib/config.ts`, version uae-2026.09, last verified 2026-09-30).

-- Registry of every editable parameter and its type, so nonsense is rejected (CFG-03).
create type public.config_value_type as enum ('bp', 'fils', 'days', 'months', 'date', 'rate');
create table public.config_keys (
  key text primary key check (key ~ '^[a-z]+(\.[A-Za-z0-9_]+)+$'),
  value_type public.config_value_type not null,
  label text not null,
  formula text                                      -- Spec 03 formula id, e.g. F-01
);
select app.setup_table('public.config_keys');
insert into public.config_keys (key, value_type, label, formula) values
  ('vat.rate_bp',                  'bp',     'VAT standard rate',                         'F-01'),
  ('vat.mandatory_threshold',      'fils',   'VAT mandatory registration threshold',      null),
  ('vat.voluntary_threshold',      'fils',   'VAT voluntary registration threshold',      null),
  ('vat.return_due_days',          'days',   'VAT return due (days after period end)',    'F-05'),
  ('vat.invoice_issue_days',       'days',   'Tax invoice to be issued within (days)',    null),
  ('vat.full_invoice_threshold',   'fils',   'Full tax invoice required above',           'F-07'),
  ('ct.rate_bp',                   'bp',     'Corporate Tax rate',                        'F-09'),
  ('ct.zero_band',                 'fils',   'Corporate Tax 0% band',                     'F-09'),
  ('ct.sbr_limit',                 'fils',   'Small Business Relief revenue limit',       'F-11'),
  ('ct.sbr_last_period_end',       'date',   'Small Business Relief last period end',     'F-11'),
  ('ct.addback.ENTERTAINMENT_50',  'bp',     'Entertainment add-back',                    'F-08'),
  ('ct.addback.FINES_PENALTIES',   'bp',     'Fines and penalties add-back',              'F-08'),
  ('ct.addback.DONATION_NON_QPBE', 'bp',     'Non-qualifying donations add-back',         'F-08'),
  ('ct.addback.NON_DEDUCTIBLE',    'bp',     'Non-deductible expenses add-back',          'F-08'),
  ('ct.loss_cap_bp',               'bp',     'Loss relief cap (% of taxable income)',     'F-10'),
  ('ct.return_due_months',         'months', 'CT return due (months after year end)',     'F-12'),
  ('einvoicing.asp_by',            'date',   'E-invoicing: appoint ASP by',               'F-22'),
  ('einvoicing.go_live',           'date',   'E-invoicing: go-live',                      'F-22'),
  ('fx.usd_aed',                   'rate',   'USD → AED rate',                            'F-24');

alter table public.tax_codes add foreign key (rate_key) references public.config_keys (key) on delete restrict;
create index tax_codes_rate_key_idx on public.tax_codes (rate_key);
alter table public.ct_tags add foreign key (addback_key) references public.config_keys (key) on delete restrict;
create index ct_tags_addback_key_idx on public.ct_tags (addback_key);

create type public.config_status as enum ('draft', 'approved');
create table public.config_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  effective_from date not null,
  effective_to date,
  status public.config_status not null default 'draft',
  based_on uuid references public.config_versions (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  approval_reason text,
  check (effective_to is null or effective_to >= effective_from),
  check ((status = 'approved') = (approved_at is not null))
);
select app.setup_table('public.config_versions');
create unique index config_versions_one_per_date on public.config_versions (effective_from) where status = 'approved';
create index config_versions_based_on_idx on public.config_versions (based_on);
create index config_versions_approved_by_idx on public.config_versions (approved_by);

create table public.config_values (
  version_id uuid not null references public.config_versions (id) on delete cascade,
  key text not null references public.config_keys (key) on delete restrict,
  value jsonb not null,
  legal_reference text,
  last_verified date,
  needs_verification boolean not null default false,   -- VERIFY flag: needs Faizan's sign-off
  primary key (version_id, key)
);
select app.setup_table('public.config_values');
create index config_values_key_idx on public.config_values (key);

-- CFG-03: values must make sense for their type; approved versions are frozen.
create or replace function app.config_values_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.config_values := case when tg_op = 'DELETE' then old else new end;
  v_type public.config_value_type;
  v_num numeric;
begin
  if exists (select 1 from public.config_versions
             where id in (v_row.version_id, old.version_id) and status = 'approved') then
    raise exception 'Approved tax-rule versions cannot be changed — create a new version' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  select value_type into v_type from public.config_keys where key = new.key;
  if v_type = 'date' then
    if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '% must be a date (YYYY-MM-DD)', new.key using errcode = 'check_violation';
    end if;
    perform (new.value #>> '{}')::date;
    return new;
  end if;
  if jsonb_typeof(new.value) <> 'number' then
    raise exception '% must be a number', new.key using errcode = 'check_violation';
  end if;
  v_num := (new.value #>> '{}')::numeric;
  if v_type = 'rate' then
    if v_num <= 0 then raise exception '% must be greater than 0', new.key using errcode = 'check_violation'; end if;
  elsif v_num <> trunc(v_num) then
    raise exception '% must be a whole number', new.key using errcode = 'check_violation';
  elsif v_type = 'bp' and v_num not between 0 and 10000 then
    raise exception '% must be between 0%% and 100%% (0–10,000 basis points)', new.key using errcode = 'check_violation';
  elsif v_type = 'fils' and v_num < 0 then
    raise exception '% cannot be negative', new.key using errcode = 'check_violation';
  elsif v_type = 'days' and v_num not between 0 and 366 then
    raise exception '% must be between 0 and 366 days', new.key using errcode = 'check_violation';
  elsif v_type = 'months' and v_num not between 0 and 24 then
    raise exception '% must be between 0 and 24 months', new.key using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.config_values
  for each row execute function app.config_values_guard();

create or replace function app.config_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved tax-rule versions cannot be deleted' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New tax-rule versions start as drafts' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if app.ctx() <> 'approve_config_version'
     and (old.status = 'approved' or new.status = 'approved') then
    raise exception 'Tax-rule versions are approved only through approve_config_version() and are then frozen'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on public.config_versions
  for each row execute function app.config_versions_guard();

-- The approved value of a parameter on a date: the approved version with the latest
-- effective_from on or before that date (Spec 03 §2 rule 2 — the tax period's date, not today).
create or replace function app.config_value(p_key text, p_on date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select cv.value
  from public.config_values cv join public.config_versions v on v.id = cv.version_id
  where cv.key = p_key and v.status = 'approved' and v.effective_from <= p_on
  order by v.effective_from desc
  limit 1
$$;

create or replace function public.config_value(p_key text, p_on date default current_date) returns jsonb
language sql stable security invoker set search_path = '' as $$ select app.config_value(p_key, p_on) $$;

-- Approve a draft version (D-23). One Super Admin: a written reason is required. Two or more
-- active Super Admins: the approver must be someone other than the person who drafted it.
create or replace function public.approve_config_version(p_version_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.config_versions;
  v_uid uuid := (select auth.uid());
  v_missing text;
begin
  if v_uid is null or not app.is_super_admin() or not app.mfa_ok() then
    raise exception 'Only a Super Admin (signed in with two-factor) can approve tax rules' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A written reason is required to approve tax rules' using errcode = 'check_violation';
  end if;
  select * into v from public.config_versions where id = p_version_id for update;
  if v.id is null then raise exception 'Version not found' using errcode = 'no_data_found'; end if;
  if v.status <> 'draft' then raise exception 'Version is already approved' using errcode = 'check_violation'; end if;
  if (select count(*) from public.profiles where is_super_admin and status = 'active') >= 2
     and v.created_by = v_uid then
    raise exception 'Another Super Admin must approve a version you drafted (two-person rule)' using errcode = 'insufficient_privilege';
  end if;
  select string_agg(k.key, ', ') into v_missing from public.config_keys k
  where not exists (select 1 from public.config_values cv where cv.version_id = v.id and cv.key = k.key);
  if v_missing is not null then
    raise exception 'Version is missing values for: %', v_missing using errcode = 'check_violation';
  end if;

  perform app.set_ctx('approve_config_version');
  perform set_config('app.reason', p_reason, true);
  update public.config_versions set effective_to = v.effective_from - 1
   where status = 'approved' and effective_from < v.effective_from
     and (effective_to is null or effective_to >= v.effective_from);
  update public.config_versions
     set status = 'approved', approved_by = v_uid, approved_at = now(), approval_reason = btrim(p_reason),
         effective_to = (select min(effective_from) - 1 from public.config_versions
                         where status = 'approved' and effective_from > v.effective_from)
   where id = v.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;
revoke all on function public.approve_config_version(uuid, text), public.config_value(text, date) from public, anon;
grant execute on function public.approve_config_version(uuid, text), public.config_value(text, date) to authenticated;
grant execute on function app.config_value(text, date) to authenticated;

-- Seed: the rules the POC uses today. VERIFY items need Faizan's sign-off (PLAN Q-07).
insert into public.config_versions (label, effective_from) values ('uae-2026.09', '2018-01-01');
insert into public.config_values (version_id, key, value, legal_reference, last_verified, needs_verification)
select v.id, x.key, x.value::jsonb, x.ref, x.verified::date, x.verify
from public.config_versions v, (values
  ('vat.rate_bp',                  '500',          'FDL 8/2017 Art 3',        '2026-09-30', false),
  ('vat.mandatory_threshold',      '37500000',     'FDL 8/2017 Art 13',       '2026-09-30', false),
  ('vat.voluntary_threshold',      '18750000',     'FDL 8/2017 Art 17',       '2026-09-30', false),
  ('vat.return_due_days',          '28',           'Exec. Reg. Art 69',       '2026-09-30', true),
  ('vat.invoice_issue_days',       '14',           'FDL 8/2017 Art 67',       '2026-09-30', false),
  ('vat.full_invoice_threshold',   '1000000',      'Exec. Reg. Art 59(2)',    '2026-09-30', true),
  ('ct.rate_bp',                   '900',          'FDL 47/2022 Art 3',       '2026-09-30', false),
  ('ct.zero_band',                 '37500000',     'CD 116/2022',             '2026-09-30', false),
  ('ct.sbr_limit',                 '300000000',    'FDL 47/2022 Art 21; MD 73/2023', '2026-09-30', false),
  ('ct.sbr_last_period_end',       '"2029-12-31"', 'MD 131/2026',             '2026-09-30', true),
  ('ct.addback.ENTERTAINMENT_50',  '5000',         'FDL 47/2022 Art 32',      '2026-09-30', false),
  ('ct.addback.FINES_PENALTIES',   '10000',        'FDL 47/2022 Art 33',      '2026-09-30', false),
  ('ct.addback.DONATION_NON_QPBE', '10000',        'FDL 47/2022 Art 33',      '2026-09-30', false),
  ('ct.addback.NON_DEDUCTIBLE',    '10000',        'FDL 47/2022 Art 28, 33',  '2026-09-30', false),
  ('ct.loss_cap_bp',               '7500',         'FDL 47/2022 Art 37',      '2026-09-30', false),
  ('ct.return_due_months',         '9',            'FDL 47/2022 Art 53',      '2026-09-30', false),
  ('einvoicing.asp_by',            '"2027-03-31"', 'MD 244/2025',             '2026-09-30', true),
  ('einvoicing.go_live',           '"2027-07-01"', 'MD 244/2025',             '2026-09-30', true),
  ('fx.usd_aed',                   '3.6725',       'CBUAE peg; D-21',         '2026-10-06', false)
) as x(key, value, ref, verified, verify)
where v.label = 'uae-2026.09';
select app.set_ctx('approve_config_version');
update public.config_versions
   set status = 'approved', approved_at = now(),
       approval_reason = 'Initial rules carried over from the POC (TAX_CONFIG uae-2026.09); VERIFY items pending (PLAN Q-07)'
 where label = 'uae-2026.09';
select app.set_ctx(null);

-- ── Firm settings (operational, per firm) ────────────────────────────────────────────────
create table public.firm_settings (
  firm_id uuid not null references public.firms (id) on delete restrict,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  primary key (firm_id, key)
);
select app.setup_table('public.firm_settings');

create or replace function app.firm_setting(p_firm uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.firm_settings where firm_id = p_firm and key = p_key
$$;

insert into public.firm_settings (firm_id, key, value)
select f.id, s.key, s.value::jsonb from public.firms f, (values
  ('numbering_format',             '"{PREFIX}-{YYYY}-{MM}-{SEQ:4}"'),
  ('document_prefixes',            '{"journal":"JV","sales_invoice":"INV","credit_note":"CN","receipt":"RCPT","payment":"PAY"}'),
  ('default_payment_terms_days',   '30'),
  ('default_vat_period',           '"quarterly"'),
  ('default_coa_template',         '"uae-sme"'),
  ('ageing_buckets',               '[{"label":"Current","from":null,"to":0},{"label":"1–30","from":1,"to":30},{"label":"31–60","from":31,"to":60},{"label":"61–90","from":61,"to":90},{"label":"90+","from":91,"to":null}]'),
  ('bank_match_tolerance_days',    '5'),
  ('auto_apply_customer_credits',  'true'),
  ('risk_weights',                 '{"error":22,"duplicate":45,"unregistered":45,"warning":10}'),
  ('risk_thresholds',              '{"medium":15,"high":45}'),
  ('invite_expiry_days',           '7'),
  ('allowed_email_domains',        '[]'),
  ('reminder_lead_days',           '[14,7,1]'),
  ('daily_digest',                 'false'),
  ('integrity_alert_recipients',   '[]')
) as s(key, value)
where f.is_platform_owner;

-- ── Email templates (Spec 03 §3; sent by Vercel functions through Resend) ────────────────
create table public.email_templates (
  key text primary key check (key ~ '^[a-z_]+$'),
  subject text not null,
  body text not null,
  variables text[] not null default '{}'
);
select app.setup_table('public.email_templates');
insert into public.email_templates (key, subject, body, variables) values
  ('invite', 'You''re invited to {{app_name}}',
   E'Hello,\n\n{{inviter_name}} has invited you to join {{firm_name}} on {{app_name}} as {{role}}.\n\nSet up your account here (the link works once and expires on {{expires_on}}):\n{{invite_link}}\n\nIf you weren''t expecting this, you can ignore this email.',
   '{app_name,inviter_name,firm_name,role,invite_link,expires_on}'),
  ('deadline_reminder', '{{client_name}}: {{deadline_title}} due {{due_date}}',
   E'Reminder: {{deadline_title}} for {{client_name}} is due on {{due_date}} ({{days_left}} days left).\n\nOpen {{app_name}}: {{link}}',
   '{app_name,client_name,deadline_title,due_date,days_left,link}'),
  ('approval_waiting', '{{client_name}}: {{document}} is waiting for your approval',
   E'{{prepared_by}} has prepared {{document}} for {{client_name}}. It needs approval by someone else.\n\nReview it here: {{link}}',
   '{app_name,client_name,document,prepared_by,link}'),
  ('integrity_alert', '{{app_name}}: integrity check found {{failures}} problem(s)',
   E'The nightly integrity check on {{run_date}} found {{failures}} problem(s).\n\nDetails: {{link}}',
   '{app_name,run_date,failures,link}');

-- ── Compliance rules (generate deadlines per client — Spec 03 F-20; used from Phase 3) ──
create type public.compliance_kind as enum ('vat', 'ct', 'licence', 'einvoicing');
create type public.compliance_anchor as enum ('vat_period_end', 'fy_end', 'licence_expiry', 'fixed_date');
create table public.compliance_rules (
  key text primary key check (key ~ '^[a-z_]+$'),
  kind public.compliance_kind not null,
  title text not null,
  anchor public.compliance_anchor not null,
  offset_config_key text references public.config_keys (key) on delete restrict,
  offset_days integer,
  applies_when text,
  is_active boolean not null default true,
  check ((offset_config_key is null) <> (offset_days is null))
);
select app.setup_table('public.compliance_rules');
create index compliance_rules_config_key_idx on public.compliance_rules (offset_config_key);
insert into public.compliance_rules (key, kind, title, anchor, offset_config_key, offset_days, applies_when) values
  ('vat_return',      'vat',        'VAT return and payment',          'vat_period_end', 'vat.return_due_days', null, 'VAT registered'),
  ('ct_return',       'ct',         'Corporate Tax return and payment', 'fy_end',        'ct.return_due_months', null, 'Always'),
  ('licence_renewal', 'licence',    'Trade licence renewal',           'licence_expiry', null, -30, 'Licence expiry date set'),
  ('einvoicing_asp',  'einvoicing', 'Appoint e-invoicing ASP',         'fixed_date',     'einvoicing.asp_by', null, 'Revenue below AED 50m');
