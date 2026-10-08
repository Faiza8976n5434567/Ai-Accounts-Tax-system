-- Performance advisor (unindexed_foreign_keys): the composite tenant FKs on the bank tables need a covering index
-- in their own column order. No behaviour change.
create index if not exists bank_accounts_account_org_idx on public.bank_accounts (account_id, organization_id);
create index if not exists bank_reconciliations_bank_org_idx on public.bank_reconciliations (bank_account_id, organization_id);
create index if not exists bank_statements_bank_org_idx on public.bank_statements (bank_account_id, organization_id);
create index if not exists bank_transactions_bank_org_idx on public.bank_transactions (bank_account_id, organization_id);
