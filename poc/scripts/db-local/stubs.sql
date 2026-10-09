-- Local harness only (scripts/db-local/run.mjs). Not used by Supabase or CI.
-- Minimal stand-ins for Supabase's auth/storage schemas and roles (local harness only).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text,
  raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema storage to anon, authenticated;

-- pgTAP stand-in (subset). Each assertion returns a TAP line.
create table public._tap (n serial, ok boolean, line text);
grant all on public._tap to public; grant all on sequence public._tap_n_seq to public;
create function public.plan(int) returns text language sql as $$ select '1..' || $1 $$;
create function public._rec(p_ok boolean, p_desc text, p_diag text default null) returns text language plpgsql as $$
declare v int;
begin
  insert into public._tap (ok, line) values (coalesce(p_ok, false), p_desc) returning n into v;
  return case when coalesce(p_ok, false) then 'ok ' else 'not ok ' end || v || ' - ' || coalesce(p_desc, '')
         || case when coalesce(p_ok, false) or p_diag is null then '' else E'\n#   ' || p_diag end;
end $$;
create function public.ok(boolean, text default null) returns text language sql as $$ select public._rec($1, $2) $$;
create function public.is(anyelement, anyelement, text default null) returns text language sql as $$
  select public._rec($1 is not distinct from $2, $3, 'have: ' || coalesce($1::text, 'NULL') || '  want: ' || coalesce($2::text, 'NULL')) $$;
create function public.isnt(anyelement, anyelement, text default null) returns text language sql as $$
  select public._rec($1 is distinct from $2, $3, 'both: ' || coalesce($1::text, 'NULL')) $$;
create function public.throws_ok(p_sql text, p_code char(5), p_msg text default null, p_desc text default null) returns text
language plpgsql as $$
begin
  execute p_sql;
  return public._rec(false, coalesce(p_desc, 'throws ' || p_code), 'no exception raised');
exception when others then
  return public._rec((p_code is null or sqlstate = p_code) and (p_msg is null or sqlerrm = p_msg),
                     coalesce(p_desc, 'throws ' || p_code), 'got ' || sqlstate || ': ' || sqlerrm);
end $$;
create function public.throws_like(p_sql text, p_like text, p_desc text default null) returns text
language plpgsql as $$
begin
  execute p_sql;
  return public._rec(false, p_desc, 'no exception raised');
exception when others then
  return public._rec(sqlerrm like p_like, p_desc, 'got ' || sqlstate || ': ' || sqlerrm);
end $$;
create function public.lives_ok(p_sql text, p_desc text default null) returns text language plpgsql as $$
begin
  execute p_sql;
  return public._rec(true, p_desc);
exception when others then
  return public._rec(false, p_desc, 'died ' || sqlstate || ': ' || sqlerrm);
end $$;
create function public.is_empty(p_sql text, p_desc text default null) returns text language plpgsql as $$
declare v_n int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into v_n;
  return public._rec(v_n = 0, p_desc, v_n || ' row(s) returned');
end $$;
create function public.finish() returns setof text language sql as $$
  select '# ' || count(*) filter (where not ok) || ' failed of ' || count(*) from public._tap $$;
grant execute on function public.plan(int), public._rec(boolean, text, text), public.ok(boolean, text), public.is(anyelement, anyelement, text), public.isnt(anyelement, anyelement, text), public.throws_ok(text, char, text, text), public.throws_like(text, text, text), public.lives_ok(text, text), public.is_empty(text, text), public.finish() to public;
