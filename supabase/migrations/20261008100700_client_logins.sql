-- P3-06 · Client logins: Client Owner, Client Staff, Read-only (Spec 02 §2.3 · RBAC-15, RBAC-16, RBAC-20, SEC-16 · D-48, D-49).
--   • D-48: two-factor sign-in is required for EVERY user, firm or client (R6 widened). The sign-in screen already
--     asks everyone for it; now the database refuses any request without it.
--   • Firm Admins invite Client Owners, Staff and Read-only users to a client; a Client Owner invites Staff and
--     Read-only users to their own company only (RBAC-15/16). Nobody can change their own access (R4).
--   • D-49: Read-only access always ends — default 90 days, at most 1 year ahead (firm settings).
--   • Accepting an invitation creates the client membership; access is removed by a Firm Admin (any client role) or
--     by the Client Owner (Staff and Read-only), and the audit log keeps the history.

-- D-48
create or replace function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

insert into public.firm_settings (firm_id, key, value)
select f.id, s.key, s.value::jsonb from public.firms f, (values
  ('read_only_default_days', '90'),                      -- D-49
  ('read_only_max_days',     '365')
) as s(key, value)
on conflict (firm_id, key) do nothing;

-- R4 stays: nobody changes their own access — except by accepting their own invitation (which keeps the inviter
-- as the person who granted it).
create or replace function app.org_memberships_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.org_memberships := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.user_id = (select auth.uid()) and not (app.ctx() = 'accept_invitation' and tg_op <> 'DELETE') then
    raise exception 'You cannot change your own access' using errcode = 'insufficient_privilege';
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.user_id <> old.user_id) then
      raise exception 'Create a new access grant instead of moving one' using errcode = 'check_violation';
    end if;
    if new.role = 'firm_accountant' and not exists (
        select 1 from public.firm_members m join public.organizations o on o.firm_id = m.firm_id
        where o.id = new.organization_id and m.user_id = new.user_id and m.active) then
      raise exception 'Only active staff of this client''s firm can be assigned as Firm Accountant' using errcode = 'check_violation';
    end if;
    if app.ctx() <> 'accept_invitation' then
      new.granted_by := coalesce((select auth.uid()), new.granted_by);
    end if;
  end if;
  return v_row;
end $$;

-- Invite someone to one client. Returns the same shape as create_invitation (the invite server uses both).
create or replace function app.create_client_invitation(p_organization_id uuid, p_email text, p_full_name text, p_role text, p_valid_to date default null)
returns table (invitation_id uuid, email text, full_name text, role text, expires_at timestamptz, firm_name text, inviter_name text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := app.require(p_organization_id, 'invite_client_users');
  v_org public.organizations;
  v_email extensions.citext := lower(btrim(p_email));
  v_is_firm_admin boolean;
  v_max int;
  v_days int;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  v_is_firm_admin := app.is_super_admin() or exists (select 1 from public.firm_members m
                     where m.firm_id = v_org.firm_id and m.user_id = v_uid and m.active and m.role = 'firm_admin');
  if p_role not in ('client_owner', 'client_staff', 'read_only') then
    raise exception 'From a client you can invite a Client Owner, Client Staff or Read-only user — firm staff are invited under Users & invites'
      using errcode = 'insufficient_privilege';                                                                     -- RBAC-15
  end if;
  if p_role = 'client_owner' and not v_is_firm_admin then
    raise exception 'Only a Firm Admin can invite a Client Owner' using errcode = 'insufficient_privilege';
  end if;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address does not look right' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_full_name), '') is null then raise exception 'Enter the person''s name' using errcode = 'check_violation'; end if;
  if p_role = 'read_only' then                                                                                       -- D-49 · R5
    v_max := coalesce((app.firm_setting(v_org.firm_id, 'read_only_max_days') #>> '{}')::int, 365);
    if p_valid_to is null then raise exception 'Read-only access needs an end date' using errcode = 'check_violation'; end if;
    if p_valid_to < current_date or p_valid_to > current_date + v_max then
      raise exception 'Read-only access can end at most % days from today (between today and %)', v_max, to_char(current_date + v_max, 'DD Mon YYYY')
        using errcode = 'check_violation';
    end if;
  end if;
  if exists (select 1 from public.org_memberships m join public.profiles p on p.id = m.user_id
             where m.organization_id = p_organization_id and p.email = v_email and (m.valid_to is null or m.valid_to >= current_date)) then
    raise exception '% already has access to this client', v_email using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.firm_members m join public.profiles p on p.id = m.user_id
             where m.firm_id = v_org.firm_id and p.email = v_email and m.active) then
    raise exception '% is a member of the firm — firm staff get access through client assignment, not a client login', v_email using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.invitations i where i.email = v_email and i.organization_id = p_organization_id and i.status = 'pending' and i.expires_at > now()) then
    raise exception '% already has an invitation waiting — copy its link or revoke it first', v_email using errcode = 'unique_violation';
  end if;
  v_days := coalesce((app.firm_setting(v_org.firm_id, 'invite_expiry_days') #>> '{}')::int, 7);
  perform app.set_ctx('create_invitation');
  update public.invitations set status = 'expired'
   where email = v_email and organization_id = p_organization_id and status = 'pending' and expires_at <= now();
  insert into public.invitations (email, full_name, firm_id, organization_id, role, valid_to, invited_by, expires_at)
  values (v_email, btrim(p_full_name), v_org.firm_id, p_organization_id, p_role, case when p_role = 'read_only' then p_valid_to end, v_uid,
          now() + make_interval(days => v_days))
  returning id into v_id;
  perform app.set_ctx(null);
  return query
  select i.id, i.email::text, i.full_name, i.role, i.expires_at, v_org.legal_name || ' (' || f.legal_name || ')', p.full_name
  from public.invitations i join public.firms f on f.id = i.firm_id left join public.profiles p on p.id = i.invited_by
  where i.id = v_id;
end $$;

-- Accepting: every pending invitation for this email — firm staff and client logins alike.
create or replace function app.accept_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email extensions.citext;
  inv public.invitations;
  v_result text := 'none';
begin
  if v_uid is null then return 'none'; end if;
  select email into v_email from public.profiles where id = v_uid and status = 'active';
  if v_email is null then return 'none'; end if;
  for inv in select * from public.invitations where email = v_email and status = 'pending' order by created_at for update loop
    if inv.expires_at <= now() then
      perform app.set_ctx('expire_invitation');
      update public.invitations set status = 'expired' where id = inv.id;
      perform app.set_ctx(null);
      if v_result = 'none' then v_result := 'expired'; end if;
      continue;
    end if;
    perform app.set_ctx('accept_invitation');
    if inv.organization_id is null then
      insert into public.firm_members (firm_id, user_id, role)
      values (inv.firm_id, v_uid, inv.role::public.firm_role)
      on conflict (firm_id, user_id) do nothing;
    else
      insert into public.org_memberships (organization_id, user_id, role, valid_from, valid_to, granted_by)
      values (inv.organization_id, v_uid, inv.role::public.org_role, current_date, inv.valid_to, inv.invited_by)
      on conflict (organization_id, user_id) do update set role = excluded.role, valid_from = current_date, valid_to = excluded.valid_to,
                                                            granted_by = excluded.granted_by;
    end if;
    update public.invitations set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid where id = inv.id;
    update public.profiles set full_name = inv.full_name
     where id = v_uid and inv.full_name is not null and full_name is distinct from inv.full_name;
    perform app.set_ctx(null);
    v_result := 'accepted';
  end loop;
  return v_result;
end $$;

-- Who has (or is invited to) a client login — for the "Client users" screen.
create or replace function app.client_users(p_organization_id uuid)
returns table (kind text, id uuid, full_name text, email text, role text, valid_from date, valid_to date, status text, invited_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform app.require(p_organization_id, 'view');
  return query
  select 'member', m.id, p.full_name, p.email::text, m.role::text, m.valid_from, m.valid_to,
         case when p.status <> 'active' then 'suspended' when m.valid_to is not null and m.valid_to < current_date then 'ended' else 'active' end,
         g.full_name, m.created_at
  from public.org_memberships m join public.profiles p on p.id = m.user_id left join public.profiles g on g.id = m.granted_by
  where m.organization_id = p_organization_id and m.role in ('client_owner', 'client_staff', 'read_only')
  union all
  select 'invitation', i.id, i.full_name, i.email::text, i.role, null::date, i.valid_to,
         case when i.expires_at <= now() then 'expired' else 'pending' end, g.full_name, i.created_at
  from public.invitations i left join public.profiles g on g.id = i.invited_by
  where i.organization_id = p_organization_id and i.status = 'pending'
  order by 1 desc, 3;
end $$;

-- Remove a client login. Firm Admin: any client role. Client Owner: Staff and Read-only only, never themselves (R4).
create or replace function app.remove_client_user(p_membership_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.org_memberships;
  v_uid uuid;
  v_is_firm_admin boolean;
begin
  select * into m from public.org_memberships where id = p_membership_id for update;
  if m.id is null then raise exception 'User not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(m.organization_id, 'invite_client_users');
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required' using errcode = 'check_violation'; end if;
  if m.role not in ('client_owner', 'client_staff', 'read_only') then
    raise exception 'Firm staff are managed under Users & invites' using errcode = 'insufficient_privilege';
  end if;
  if m.user_id = v_uid then raise exception 'You cannot remove your own access (R4)' using errcode = 'insufficient_privilege'; end if;
  v_is_firm_admin := app.is_super_admin() or exists (select 1 from public.firm_members f join public.organizations o on o.firm_id = f.firm_id
                     where o.id = m.organization_id and f.user_id = v_uid and f.active and f.role = 'firm_admin');
  if m.role = 'client_owner' and not v_is_firm_admin then
    raise exception 'Only a Firm Admin can remove a Client Owner' using errcode = 'insufficient_privilege';
  end if;
  perform app.set_ctx('remove_client_user');
  perform set_config('app.reason', p_reason, true);
  delete from public.org_memberships where id = m.id;
  perform app.set_ctx(null);
  perform set_config('app.reason', '', true);
end $$;

-- A Client Owner may revoke the invitations of their own company too.
create or replace function app.revoke_client_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitations;
begin
  select * into i from public.invitations where id = p_invitation_id for update;
  if i.id is null or i.organization_id is null then raise exception 'Invitation not found' using errcode = 'no_data_found'; end if;
  perform app.require(i.organization_id, 'invite_client_users');
  if i.status <> 'pending' then raise exception 'Only a waiting invitation can be revoked' using errcode = 'check_violation'; end if;
  perform app.set_ctx('revoke_invitation');
  update public.invitations set status = 'revoked' where id = i.id;
  perform app.set_ctx(null);
end $$;

grant execute on function app.create_client_invitation(uuid, text, text, text, date), app.client_users(uuid), app.remove_client_user(uuid, text),
  app.revoke_client_invitation(uuid) to authenticated;
create function public.create_client_invitation(p_organization_id uuid, p_email text, p_full_name text, p_role text, p_valid_to date default null)
returns table (invitation_id uuid, email text, full_name text, role text, expires_at timestamptz, firm_name text, inviter_name text)
language sql security invoker set search_path = '' as $$ select * from app.create_client_invitation(p_organization_id, p_email, p_full_name, p_role, p_valid_to) $$;
create function public.client_users(p_organization_id uuid)
returns table (kind text, id uuid, full_name text, email text, role text, valid_from date, valid_to date, status text, invited_by_name text, created_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from app.client_users(p_organization_id) $$;
create function public.remove_client_user(p_membership_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app.remove_client_user(p_membership_id, p_reason) $$;
create function public.revoke_client_invitation(p_invitation_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app.revoke_client_invitation(p_invitation_id) $$;
revoke all on function public.create_client_invitation(uuid, text, text, text, date), public.client_users(uuid), public.remove_client_user(uuid, text),
  public.revoke_client_invitation(uuid) from public, anon;
grant execute on function public.create_client_invitation(uuid, text, text, text, date), public.client_users(uuid), public.remove_client_user(uuid, text),
  public.revoke_client_invitation(uuid) to authenticated;

-- ── RBAC-20 · each action checks the permission of the approved matrix (Spec 02 §2.1) ──────────
-- Receipts/payments: 'record_payment' (Client Staff may not record them). Statement upload and column
-- mapping: 'upload' (Client Owner/Staff may upload). Matching, bank-line postings and reconciliations:
-- 'bank_match' (firm staff only).

create or replace function app.save_payment(p_id uuid, p_organization_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require(p_organization_id, 'record_payment');
  v_kind public.payment_kind := (p_doc ->> 'kind')::public.payment_kind;
  v_customer boolean;
  v_contact public.contacts;
  v_bank public.accounts;
  v_date date := (p_doc ->> 'payment_date')::date;
  v_currency text := coalesce(nullif(p_doc ->> 'currency', ''), 'AED');
  v_amount bigint := (p_doc ->> 'amount')::bigint;
  v_charges bigint := coalesce((p_doc ->> 'bank_charges')::bigint, 0);
  v_auto boolean := jsonb_typeof(p_doc -> 'allocations') is distinct from 'array' or jsonb_array_length(p_doc -> 'allocations') = 0;
  v_id uuid := p_id;
  v_a jsonb;
  v_open bigint;
  v_doc_contact uuid; v_doc_currency text; v_doc_ok boolean;
begin
  if v_kind is null then raise exception 'Choose what kind of payment this is' using errcode = 'check_violation'; end if;
  if v_date is null then raise exception 'Enter the payment date' using errcode = 'check_violation'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = 'check_violation'; end if;
  if v_charges < 0 or v_charges >= v_amount then raise exception 'Bank charges must be less than the amount' using errcode = 'check_violation'; end if;
  v_customer := v_kind in ('customer_receipt', 'customer_refund');
  select * into v_contact from public.contacts where id = (p_doc ->> 'contact_id')::uuid and organization_id = p_organization_id;
  if v_contact.id is null then raise exception 'Choose a % of this client', case when v_customer then 'customer' else 'supplier' end using errcode = 'check_violation'; end if;
  if v_contact.kind = (case when v_customer then 'supplier' else 'customer' end)::public.contact_kind then
    raise exception '% is not set up as a %', v_contact.name, case when v_customer then 'customer' else 'supplier' end using errcode = 'check_violation';
  end if;
  select * into v_bank from public.accounts where id = (p_doc ->> 'bank_account_id')::uuid and organization_id = p_organization_id;
  if v_bank.id is null or v_bank.subtype not in ('bank', 'cash') or not v_bank.is_active then
    raise exception 'Choose an active bank or cash account' using errcode = 'check_violation';
  end if;
  perform app.fx_rate(v_currency, v_date);                                                   -- AED and USD only (FX-06)
  if v_kind in ('customer_refund', 'supplier_refund') then
    if not v_auto then raise exception 'Refunds draw on the contact''s credits automatically — do not choose documents' using errcode = 'check_violation'; end if;
    if v_amount > (select coalesce(sum(c.left_fcy), 0) from public.payments p, lateral app.credit_left(p.id) c
                   where p.contact_id = v_contact.id and p.currency = v_currency and p.status = 'posted'
                     and p.kind = case when v_customer then 'customer_receipt' else 'supplier_payment' end::public.payment_kind) then
      raise exception 'The refund is more than the % available', case when v_customer then 'customer credit' else 'supplier advance' end using errcode = 'check_violation'; -- ARAP-11
    end if;
  end if;

  perform app.set_ctx('save_payment');
  if v_id is null then
    insert into public.payments (organization_id, kind, contact_id, bank_account_id, payment_date, currency, fx_rate, amount_fcy, bank_charges_fcy,
           auto_allocate, reference, notes, prepared_by)
    values (p_organization_id, v_kind, v_contact.id, v_bank.id, v_date, v_currency, app.fx_rate(v_currency, v_date), v_amount, v_charges,
            v_auto, nullif(btrim(p_doc ->> 'reference'), ''), nullif(btrim(p_doc ->> 'notes'), ''), v_uid)
    returning id into v_id;
  else
    update public.payments set kind = v_kind, contact_id = v_contact.id, bank_account_id = v_bank.id, payment_date = v_date, currency = v_currency,
           fx_rate = app.fx_rate(v_currency, v_date), amount_fcy = v_amount, bank_charges_fcy = v_charges, auto_allocate = v_auto,
           reference = nullif(btrim(p_doc ->> 'reference'), ''), notes = nullif(btrim(p_doc ->> 'notes'), ''), status = 'draft', prepared_by = v_uid
     where id = v_id and organization_id = p_organization_id and status in ('draft', 'pending');
    if not found then raise exception 'Payment not found or no longer editable' using errcode = 'no_data_found'; end if;
    delete from public.payment_allocations where payment_id = v_id;
  end if;

  if not v_auto and v_kind in ('customer_receipt', 'supplier_payment') then
    for v_a in select * from jsonb_array_elements(p_doc -> 'allocations') loop
      v_doc_contact := null; v_doc_currency := null; v_doc_ok := null; v_open := null;
      if v_kind = 'customer_receipt' then
        select contact_id, currency, status = 'posted' and doc_type = 'invoice', (app.sales_open(id)).open_fcy
          into v_doc_contact, v_doc_currency, v_doc_ok, v_open from public.sales_invoices where id = (v_a ->> 'document_id')::uuid and organization_id = p_organization_id;
      else
        select contact_id, currency, status = 'posted' and doc_type = 'bill', (app.bill_open(id)).open_fcy
          into v_doc_contact, v_doc_currency, v_doc_ok, v_open from public.purchase_bills where id = (v_a ->> 'document_id')::uuid and organization_id = p_organization_id;
      end if;
      if v_doc_ok is not true or v_doc_contact <> v_contact.id then
        raise exception 'Allocations must be to posted % of %', case when v_customer then 'invoices' else 'bills' end, v_contact.name using errcode = 'check_violation';
      end if;
      if v_doc_currency <> v_currency then raise exception 'A % payment can only settle % documents', v_currency, v_currency using errcode = 'check_violation'; end if;
      if (v_a ->> 'amount')::bigint > v_open then
        raise exception 'An allocation is more than the open balance of the document (%)', v_open / 100.0 using errcode = 'check_violation';   -- DM-05
      end if;
      insert into public.payment_allocations (organization_id, payment_id, sales_invoice_id, purchase_bill_id, amount_fcy, amount, applied_on)
      values (p_organization_id, v_id,
              case when v_customer then (v_a ->> 'document_id')::uuid end, case when not v_customer then (v_a ->> 'document_id')::uuid end,
              (v_a ->> 'amount')::bigint, (v_a ->> 'amount')::bigint, v_date);                     -- AED re-valued at posting
    end loop;
  end if;
  perform app.set_ctx(null);
  return v_id;
end $$;

create or replace function app.submit_payment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'record_payment');
  if p.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode = 'check_violation'; end if;
  perform app.set_ctx('submit_payment');
  update public.payments set status = 'pending' where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.delete_payment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_id for update;
  if p.id is null then raise exception 'Payment not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'record_payment');
  if p.status = 'posted' then raise exception 'Posted receipts and payments cannot be deleted' using errcode = 'insufficient_privilege'; end if;
  perform app.set_ctx('delete_payment');
  delete from public.payments where id = p_id;
  perform app.set_ctx(null);
end $$;

create or replace function app.save_bank_mapping(p_bank_account_id uuid, p_mapping jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := (select organization_id from public.bank_accounts where id = p_bank_account_id);
begin
  if v_org is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  perform app.require(v_org, 'upload');
  update public.bank_accounts set column_mapping = p_mapping where id = p_bank_account_id;
end $$;

create or replace function app.import_bank_statement(p_bank_account_id uuid, p_file_name text, p_file_sha256 text, p_rows jsonb, p_closing_balance bigint default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v_stmt uuid;
  v_end date;
  v_prev timestamptz;
  v_lines int; v_new int; v_old int; v_locked int;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'upload');
  select created_at into v_prev from public.bank_statements where bank_account_id = ba.id and file_sha256 = p_file_sha256;
  if v_prev is not null then
    raise exception 'This statement file was already uploaded on % — nothing imported', to_char(v_prev, 'DD Mon YYYY') using errcode = 'unique_violation'; -- BANK-01
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no statement lines' using errcode = 'check_violation';
  end if;
  v_end := app.bank_reconciled_to(ba.id);

  create temp table if not exists _bank_rows (n int, txn_date date, description text, reference text, amount bigint, balance bigint, hash text) on commit drop;
  truncate _bank_rows;
  insert into _bank_rows (n, txn_date, description, reference, amount, balance)
  select x.ord, (x.r ->> 'date')::date, coalesce(nullif(btrim(regexp_replace(x.r ->> 'description', '\s+', ' ', 'g')), ''), '(no description)'),
         nullif(btrim(x.r ->> 'reference'), ''), (x.r ->> 'amount')::bigint, (x.r ->> 'balance')::bigint
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  if exists (select 1 from _bank_rows where txn_date is null or amount is null or amount = 0) then
    raise exception 'Every line needs a date and an amount other than zero — check the column mapping' using errcode = 'check_violation';
  end if;
  -- DM-07: the n-th identical line of a file keeps the same hash in every file that contains it.
  update _bank_rows r set hash = encode(sha256(convert_to(concat_ws('|', r.txn_date, r.amount, lower(r.description), r.balance, s.k), 'UTF8')), 'hex')
    from (select n, row_number() over (partition by txn_date, amount, lower(description), balance order by n) k from _bank_rows) s
   where s.n = r.n;

  select count(*) into v_lines from _bank_rows;
  select count(*) into v_old from _bank_rows r where exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.dedupe_hash = r.hash);
  select count(*) into v_locked from _bank_rows r
   where v_end is not null and r.txn_date <= v_end and not exists (select 1 from public.bank_transactions t where t.bank_account_id = ba.id and t.dedupe_hash = r.hash);
  if v_locked > 0 then
    raise exception '% new line(s) are dated on or before the reconciliation approved to % — that month is closed', v_locked, v_end using errcode = 'check_violation';
  end if;

  insert into public.bank_statements (organization_id, bank_account_id, file_name, file_sha256, period_start, period_end, closing_balance,
         line_count, uploaded_by)
  select ba.organization_id, ba.id, left(p_file_name, 200), p_file_sha256, min(txn_date), max(txn_date),
         coalesce(p_closing_balance, (select balance from _bank_rows where balance is not null order by txn_date desc, n desc limit 1)), v_lines, v_uid
  from _bank_rows
  returning id into v_stmt;
  insert into public.bank_transactions (organization_id, bank_account_id, statement_id, txn_date, description, reference, amount, balance, dedupe_hash)
  select ba.organization_id, ba.id, v_stmt, txn_date, description, reference, amount, balance, hash from _bank_rows order by n
  on conflict (bank_account_id, dedupe_hash) do nothing;
  get diagnostics v_new = row_count;
  update public.bank_statements set imported_count = v_new, duplicate_count = v_lines - v_new where id = v_stmt;
  return jsonb_build_object('statement_id', v_stmt, 'lines', v_lines, 'imported', v_new, 'duplicates', v_lines - v_new);
end $$;

create or replace function app.match_bank_transaction(p_txn_id uuid, p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  v_uid uuid;
  v_amount bigint;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(t.organization_id, 'bank_match');
  if t.journal_line_id is not null then raise exception 'This bank line is already matched' using errcode = 'check_violation'; end if;
  select b.amount into v_amount from app.bank_book(t.bank_account_id) b where b.line_id = p_line_id and b.matched_txn is null;
  if v_amount is null then raise exception 'That ledger line is not an unmatched line of this bank account' using errcode = 'check_violation'; end if;
  if v_amount <> t.amount then
    raise exception 'The amounts differ (bank %, ledger %)', t.amount / 100.0, v_amount / 100.0 using errcode = 'check_violation';
  end if;
  update public.bank_transactions set status = 'matched', journal_line_id = p_line_id, matched_by = v_uid, matched_at = now() where id = p_txn_id;
end $$;

create or replace function app.unmatch_bank_transaction(p_txn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.bank_transactions;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  perform app.require(t.organization_id, 'bank_match');
  update public.bank_transactions set status = 'unmatched', journal_line_id = null, matched_by = null, matched_at = null where id = p_txn_id;
end $$;

create or replace function app.auto_match_bank(p_bank_account_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v_tol int;
  v_end date;
  t record;
  v_line uuid;
  v_n int := 0;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'bank_match');
  v_tol := coalesce((app.firm_setting((select firm_id from public.organizations where id = ba.organization_id), 'bank_match_tolerance_days') #>> '{}')::int, 5);
  v_end := app.bank_reconciled_to(ba.id);
  for t in select * from public.bank_transactions where bank_account_id = ba.id and status = 'unmatched' order by txn_date, created_at, id loop
    select b.line_id into v_line from app.bank_book(ba.id) b
     where b.matched_txn is null and b.eligible and b.amount = t.amount and abs(b.entry_date - t.txn_date) <= v_tol
       and (v_end is null or t.txn_date > v_end or b.entry_date > v_end)
     order by abs(b.entry_date - t.txn_date), b.entry_date, b.line_id limit 1;
    if v_line is not null then
      update public.bank_transactions set status = 'matched', journal_line_id = v_line, matched_by = v_uid, matched_at = now() where id = t.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function app.post_bank_line(p_txn_id uuid, p_account_id uuid, p_memo text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  ba public.bank_accounts;
  v_acc public.accounts;
  v_uid uuid;
  v_j uuid;
  v_rate numeric;
  v_aed bigint;
begin
  select * into t from public.bank_transactions where id = p_txn_id for update;
  if t.id is null then raise exception 'Bank line not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(t.organization_id, 'bank_match');
  if t.journal_line_id is not null then raise exception 'This bank line is already matched' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.journals where source = 'bank' and source_id = t.id and status in ('draft', 'pending')) then
    raise exception 'A journal for this bank line is already waiting for approval' using errcode = 'check_violation';
  end if;
  select * into ba from public.bank_accounts where id = t.bank_account_id;
  select * into v_acc from public.accounts where id = p_account_id and organization_id = t.organization_id;
  if v_acc.id is null or not v_acc.is_active or v_acc.id = ba.account_id
     or (v_acc.is_control and coalesce(v_acc.subtype, '') not in ('bank', 'cash')) then
    raise exception 'Choose an active account (customers and suppliers go through receipts and payments)' using errcode = 'check_violation';
  end if;
  v_rate := app.fx_rate(ba.currency, t.txn_date);
  v_aed := app.round_half_up(abs(t.amount) * v_rate);

  perform app.set_ctx('post_bank_line');
  insert into public.journals (organization_id, entry_date, source, source_id, memo, prepared_by, status)
  values (t.organization_id, t.txn_date, 'bank', t.id, coalesce(nullif(btrim(p_memo), ''), t.description), v_uid, 'pending')
  returning id into v_j;
  perform app.add_line(v_j, t.organization_id, ba.account_id, sign(t.amount)::bigint * v_aed, null, t.description,
                       ba.currency, v_rate, case when ba.currency = 'AED' then null else abs(t.amount) end);
  perform app.add_line(v_j, t.organization_id, v_acc.id, -sign(t.amount)::bigint * v_aed, null, coalesce(nullif(btrim(p_memo), ''), t.description));
  perform app.set_ctx(null);
  return v_j;
end $$;

create or replace function app.set_payment_bank_line(p_payment_id uuid, p_txn_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments; t public.bank_transactions;
begin
  select * into p from public.payments where id = p_payment_id for update;
  select * into t from public.bank_transactions where id = p_txn_id;
  if p.id is null or t.id is null or p.organization_id <> t.organization_id then raise exception 'Not found' using errcode = 'no_data_found'; end if;
  perform app.require(p.organization_id, 'bank_match');
  if p.status = 'posted' then raise exception 'Already posted' using errcode = 'check_violation'; end if;
  if (select account_id from public.bank_accounts where id = t.bank_account_id) <> p.bank_account_id then
    raise exception 'The payment uses a different bank account than the bank line' using errcode = 'check_violation';
  end if;
  perform app.set_ctx('save_payment');
  update public.payments set bank_transaction_id = t.id where id = p.id;
  perform app.set_ctx(null);
end $$;

create or replace function app.save_bank_reconciliation(p_bank_account_id uuid, p_end date, p_statement_balance bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ba public.bank_accounts;
  v_uid uuid;
  v jsonb;
  v_diff bigint;
  v_id uuid;
begin
  select * into ba from public.bank_accounts where id = p_bank_account_id;
  if ba.id is null then raise exception 'Bank account not found' using errcode = 'no_data_found'; end if;
  v_uid := app.require(ba.organization_id, 'bank_match');
  if p_end <= coalesce(app.bank_reconciled_to(ba.id), '-infinity'::date) then
    raise exception 'The account is already reconciled to %', app.bank_reconciled_to(ba.id) using errcode = 'check_violation';
  end if;
  v := app.bank_reconciliation_preview(ba.id, p_end);
  v_diff := p_statement_balance - ((v ->> 'book_balance')::bigint + (v ->> 'unreconciled_bank')::bigint - (v ->> 'unreconciled_book')::bigint);
  if v_diff <> 0 then
    raise exception 'Not reconciled yet: a difference of % remains', v_diff / 100.0 using errcode = 'check_violation';
  end if;
  delete from public.bank_reconciliations where bank_account_id = ba.id and status = 'pending';
  insert into public.bank_reconciliations (organization_id, bank_account_id, period_end, statement_balance, book_balance,
         unreconciled_bank, unreconciled_book, snapshot, prepared_by)
  values (ba.organization_id, ba.id, p_end, p_statement_balance, (v ->> 'book_balance')::bigint,
          (v ->> 'unreconciled_bank')::bigint, (v ->> 'unreconciled_book')::bigint, v -> 'items', v_uid)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.delete_bank_reconciliation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.bank_reconciliations;
begin
  select * into r from public.bank_reconciliations where id = p_id;
  if r.id is null then raise exception 'Reconciliation not found' using errcode = 'no_data_found'; end if;
  perform app.require(r.organization_id, 'bank_match');
  delete from public.bank_reconciliations where id = p_id;
end $$;
