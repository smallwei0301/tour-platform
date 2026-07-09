-- Helper RPCs for scripts/security/rls-grants-preflight.mjs
--
-- Purpose:
--   1. Query pg_policies for one public base table at a time.
--   2. Query information_schema.role_table_grants for the same scoped table.
--
-- Security model:
--   - SECURITY DEFINER with pinned search_path.
--   - EXECUTE revoked from public/anon/authenticated and granted only to service_role.
--   - Input is strictly scoped to an existing public ordinary table via target_table CTE.
--   - Read-only: queries system catalogs / information_schema only.

create or replace function public.rls_grants_preflight_check_policies(p_table text)
returns table (
  policyname text,
  roles text,
  cmd text,
  qual text,
  with_check text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with target_table as (
    select c.relname::text as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and p_table is not null
      and c.relname = p_table
  )
  select
    p.policyname::text,
    p.roles::text,
    p.cmd::text,
    p.qual,
    p.with_check
  from target_table t
  join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = t.table_name
  order by p.policyname;
$$;

revoke execute on function public.rls_grants_preflight_check_policies(text) from public, anon, authenticated;
grant execute on function public.rls_grants_preflight_check_policies(text) to service_role;

create or replace function public.rls_grants_preflight_check_grants(p_table text)
returns table (
  grantee text,
  privilege_type text,
  is_grantable text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with target_table as (
    select c.relname::text as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and p_table is not null
      and c.relname = p_table
  )
  select
    g.grantee::text,
    g.privilege_type::text,
    g.is_grantable::text
  from target_table t
  join information_schema.role_table_grants g
    on g.table_schema = 'public'
   and g.table_name = t.table_name
  order by g.grantee, g.privilege_type;
$$;

revoke execute on function public.rls_grants_preflight_check_grants(text) from public, anon, authenticated;
grant execute on function public.rls_grants_preflight_check_grants(text) to service_role;
