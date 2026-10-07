-- P2-01 · Customers and suppliers (Spec 01 §4.4 · ARAP-07 · Spec 05 "related party" tag).
-- One table for both: a contact can be a customer, a supplier, or both. Never deleted once used
-- (foreign keys from invoices, bills and journals restrict it) — deactivate instead.

create type public.contact_kind as enum ('customer', 'supplier', 'both');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.contact_kind not null,
  name text not null check (btrim(name) <> ''),
  trn public.trn,                                            -- 15 digits starting with 1 (F-18)
  country_code char(2) not null default 'AE' check (country_code ~ '^[A-Z]{2}$'),
  emirate_code text references public.emirates (code) on delete restrict,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  address text,
  payment_terms_days smallint check (payment_terms_days between 0 and 365),
  default_account_id uuid,
  default_tax_code text references public.tax_codes (code) on delete restrict,
  is_related_party boolean not null default false,          -- Spec 05: related-party tag (CT transfer pricing)
  is_active boolean not null default true,
  unique (id, organization_id),
  foreign key (default_account_id, organization_id) references public.accounts (id, organization_id) on delete restrict,
  check (country_code = 'AE' or emirate_code is null)
);
select app.setup_table('public.contacts');
create unique index contacts_unique_name on public.contacts (organization_id, lower(btrim(name)));   -- no duplicate contacts
create index contacts_default_account_idx on public.contacts (default_account_id, organization_id);
create index contacts_emirate_idx on public.contacts (emirate_code);
create index contacts_tax_code_idx on public.contacts (default_tax_code);

-- Payment terms default to the firm setting (F-13) when not given.
create or replace function app.contacts_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_terms_days is null then
    new.payment_terms_days := coalesce((app.firm_setting(
      (select firm_id from public.organizations where id = new.organization_id), 'default_payment_terms_days') #>> '{}')::smallint, 30);
  end if;
  new.name := btrim(new.name);
  return new;
end $$;
create trigger defaults before insert or update on public.contacts
  for each row execute function app.contacts_defaults();

create policy mfa on public.contacts as restrictive for all to authenticated
  using ((select app.mfa_ok())) with check ((select app.mfa_ok()));
create policy sel on public.contacts for select to authenticated using (organization_id in (select app.orgs_with('view')));
create policy ins on public.contacts for insert to authenticated with check (organization_id in (select app.orgs_with('prepare')));
create policy upd on public.contacts for update to authenticated
  using (organization_id in (select app.orgs_with('prepare')))
  with check (organization_id in (select app.orgs_with('prepare')));
grant select on public.contacts to authenticated;
grant insert (id, organization_id, kind, name, trn, country_code, emirate_code, email, phone, address, payment_terms_days,
  default_account_id, default_tax_code, is_related_party, is_active) on public.contacts to authenticated;
grant update (kind, name, trn, country_code, emirate_code, email, phone, address, payment_terms_days,
  default_account_id, default_tax_code, is_related_party, is_active) on public.contacts to authenticated;

-- The AR/AP party on journals and their lines (Spec 01 §4.5), same-client only.
alter table public.journals add column contact_id uuid;
alter table public.journals add foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete restrict;
create index journals_contact_idx on public.journals (contact_id, organization_id);
alter table public.journal_lines add column contact_id uuid;
alter table public.journal_lines add foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete restrict;
create index journal_lines_contact_idx on public.journal_lines (contact_id, organization_id);
