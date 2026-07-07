-- RLS preflight 全表掃描 RPC（補監控盲點：掃全部 public 表 + 檢查 RLS 是否啟用）
--
-- 背景：rls-grants-preflight 原本只查一份「寫死的敏感表清單」，且不檢查「表根本沒開 RLS」
--   的向量（#1563 根因之一：部分表 RLS 未啟用）。本 RPC 讓 preflight 能：
--     1. 列出 public schema 全部 base table（新表自動納入，不必手動維護清單）；
--     2. 回報每張表 RLS 是否啟用（relrowsecurity）；
--     3. 回報每張表是否有 anon/authenticated/PUBLIC 的寫入權限（INSERT/UPDATE/DELETE）——
--        寫入權限發給這三個角色永遠是問題（app 寫入一律走 service role）。
--
-- SECURITY DEFINER：需讀 pg_catalog / information_schema 跨全 schema 的權限資訊；
--   固定 search_path、EXECUTE 只留 service_role（對齊 #1564 的函式收斂慣例）。
-- 唯讀函式：只 SELECT 系統目錄，不改任何資料。冪等：create or replace 可重跑。

create or replace function public.rls_preflight_scan()
returns table (
  table_name text,
  rls_enabled boolean,
  forbidden_write_grantees text[]
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    c.relname::text as table_name,
    c.relrowsecurity as rls_enabled,
    coalesce(
      (
        select array_agg(distinct g.grantee::text order by g.grantee::text)
        from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = c.relname
          and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
          and g.grantee in ('anon', 'authenticated', 'PUBLIC')
      ),
      '{}'::text[]
    ) as forbidden_write_grantees
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'   -- 只 ordinary base table（排除 view/matview/sequence）
  order by c.relname;
$$;

revoke execute on function public.rls_preflight_scan() from public, anon, authenticated;
grant execute on function public.rls_preflight_scan() to service_role;
