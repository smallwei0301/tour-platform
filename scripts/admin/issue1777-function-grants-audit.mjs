#!/usr/bin/env node
/**
 * #1777 — public schema 函式 EXECUTE 權限稽核（唯讀）。
 *
 * 為什麼需要這支：
 *   20260729180000 想用 `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS
 *   FROM anon` 讓「日後新建的函式」不再自動放行，但未帶 `FOR ROLE` 時只影響
 *   執行者自己建立的物件。要涵蓋 supabase_admin 建立的物件得帶
 *   `FOR ROLE supabase_admin`——而那需要是 supabase_admin 本人或其成員：
 *     production 實測 current_user=postgres、非成員、非 superuser → 42501。
 *
 *   所以改用稽核。這其實比 default privileges 更可靠：
 *     - default privileges 只在「建立當下」生效，改了也追溯不到既有函式；
 *     - ACL 稽核不論函式由哪個角色、哪個管道（migration／Dashboard／擴充套件）
 *       建立，只要對 anon／authenticated 開放就會被抓到。
 *
 * ⚠️ 只執行 SELECT。沒有任何寫入路徑。
 *
 * 用法：
 *   node scripts/admin/issue1777-function-grants-audit.mjs [--all]
 *
 *   輸出稽核 SQL 與判讀指引；把 SQL 貼到 Supabase MCP execute_sql 或 Dashboard
 *   SQL Editor 執行。`--all` 連非 fn_ 前綴的 public 函式一併納入。
 */
// 不需要 DB 連線：本 script 產出稽核 SQL 與判讀指引，實際查詢由 MCP execute_sql
// 或 Dashboard 執行（見下方說明）。刻意不接受 connection string。
const auditAll = process.argv.includes('--all');

/**
 * ⚠️ 執行途徑的限制（誠實說明）：
 *   PostgREST 不暴露 pg_proc／information_schema，Supabase JS client 也無法執行
 *   任意 SQL。因此本 script **無法自行完成查詢**——它的作用是產出稽核 SQL 並
 *   說明判讀方式，實際執行需透過下列任一途徑：
 *     (a) Supabase MCP 的 execute_sql（唯讀，agent 可直接跑）
 *     (b) Supabase Dashboard SQL Editor
 *   刻意不引入 pg 連線字串來繞過這點——那會把 DB 密語帶進執行環境。
 */
const AUDIT_SQL = `
SELECT p.proname AS fn,
       pg_get_function_identity_arguments(p.oid) AS args,
       coalesce(a.grantee, '(none)') AS grantee
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN information_schema.routine_privileges a
    ON a.specific_name = p.proname || '_' || p.oid
   AND a.routine_schema = 'public'
   AND a.privilege_type = 'EXECUTE'
 WHERE n.nspname = 'public'
   ${auditAll ? '' : "AND p.proname LIKE 'fn\\\\_%'"}
   AND a.grantee IN ('anon', 'authenticated')
 ORDER BY 1, 3;
`.trim();

/**
 * 判讀指引——**有列出不等於有漏洞**。這些函式多為 SECURITY INVOKER，實際能否
 * 造成傷害取決於該角色對函式內部所觸及資料表的權限與 RLS。2026-07-29 實測：
 *   - orders／payments／guide_balances／payouts 對 anon／authenticated 零權限
 *   - payout_items／operations_tracking／audit_logs 雖有 table grant，但 RLS
 *     已啟用且 policy 只有 service_role → 無適用 policy 即拒絕
 *   故當時列出的 11 支函式皆**不可利用**，屬縱深防禦缺口而非漏洞。
 * 要下「可利用」的結論前，必須把下面三段查詢一起看完。
 */
const FOLLOW_UP_SQL = `
-- (1) 這些函式是 DEFINER（繞過 RLS，危險）還是 INVOKER？
SELECT proname, prosecdef AS is_security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND proname LIKE 'fn\\_%';

-- (2) 該角色對函式觸及的表有什麼權限？
SELECT table_name, grantee, string_agg(DISTINCT privilege_type, ',') AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated')
 GROUP BY table_name, grantee ORDER BY 1,2;

-- (3) 那些表的 RLS 與 policy 適用角色為何？
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       string_agg(pol.polname || ' roles=' ||
         coalesce((SELECT string_agg(pg_get_userbyid(r), ',') FROM unnest(pol.polroles) AS r),'PUBLIC'), '; ') AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_policy pol ON pol.polrelid=c.oid
 WHERE n.nspname='public' GROUP BY 1,2 ORDER BY 1;
`.trim();

function main() {
  console.log('# #1777 函式權限稽核（唯讀）\n');
  console.log(`範圍：${auditAll ? 'public schema 全部函式' : 'public.fn_* 前綴函式'}\n`);
  console.log('## 步驟 1：列出對 anon／authenticated 開放 EXECUTE 的函式\n');
  console.log('```sql');
  console.log(AUDIT_SQL);
  console.log('```\n');
  console.log('## 步驟 2：若步驟 1 有列出，用以下三段判斷是否真的可利用\n');
  console.log('```sql');
  console.log(FOLLOW_UP_SQL);
  console.log('```\n');
  console.log('## 判讀');
  console.log('- 步驟 1 為 0 列 → 通過。');
  console.log('- 有列出但函式是 INVOKER、且該角色對相關表無權限或被 RLS 擋下 → 縱深防禦缺口，非漏洞。');
  console.log('- 有列出且函式是 SECURITY DEFINER → **視為 P0**，立即新增 migration：');
  console.log('    REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM anon, authenticated, public;');
  console.log('\n⚠️ REVOKE 前務必確認沒有前端／API 以該角色直接呼叫該 RPC，否則會打斷既有功能。');
}

main();
