-- Performance advisor: index for the asset_usage → fixed_assets foreign key (P5-04).
create index if not exists asset_usage_asset_org_idx on public.asset_usage (asset_id, organization_id);
