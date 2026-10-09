-- P2-02 · Client address (needed on a tax invoice — Exec. Reg. Art 59: supplier name, address and TRN)
-- and editing of client details by a Firm Admin (manage_client) through the existing RLS policy.
alter table public.organizations add column address text;
grant update (address) on public.organizations to authenticated;
