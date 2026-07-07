-- Rollback for 20260707081500_rls_preflight_scan_rpc.sql
-- 移除 preflight 全表掃描 RPC。純唯讀函式，移除不影響任何營運資料。
drop function if exists public.rls_preflight_scan();
