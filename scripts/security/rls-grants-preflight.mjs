// scripts/security/rls-grants-preflight.mjs
// Usage: SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/security/rls-grants-preflight.mjs
// Checks sensitive tables for overly permissive RLS policies and role grants.
// NEVER add real credentials to this file.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const USAGE = `Usage: node scripts/security/rls-grants-preflight.mjs [options]

Options:
  --help        Show help
  --json        Emit JSON output (default: text)
  --output <p>  Write output to file in addition to stdout

Environment variables required (unless --help):
  SUPABASE_URL              Your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Service-role secret key (never anon key)

Exit codes:
  0  PASS — no violations found
  1  FAIL/HOLD — violations found, runtime error, or prerequisite missing`;

// Sensitive tables that must have restrictive RLS and grants (anon 應零存取).
// ⚠️ PII/身分表（users、traveler_profiles、guide_applications）於 2026-07-06 補入：
//    #1563 P0 外洩實測「anon 可讀 12 筆 users（含 PII）」，而 users 當時竟不在本清單，
//    等於同類 users regression 抓不到——此為該事故後最直接的監控缺口修補。
// 注意：公開可讀的目錄表（如 guide_profiles，#1563 白名單）不得列入，否則其合法的
//       anon SELECT 會被誤報為 broad_role_grant。只列「anon 應完全碰不到」的表。
const SENSITIVE_TABLES = [
  'payment_events',
  'refund_requests',
  'payments',
  'payouts',
  'guide_balances',
  'settlement_rules',
  'soft_launch_controls',
  'orders',
  'bookings',
  'users',              // #1563 外洩主角（PII）
  'traveler_profiles',  // 旅客個資
  'guide_applications', // 導遊申請個資（審核前）
];

// Explicit config tables that are allowed to stay public-read-only.
const PUBLIC_READ_CONFIG_TABLES = ['soft_launch_controls'];

// Roles that should NOT have broad access to sensitive tables.
const FORBIDDEN_ROLES = ['anon', 'authenticated', 'public'];

// Permissive USING/WITH CHECK expressions that indicate an overly open policy.
const PERMISSIVE_EXPRS = ['true', '(true)', 'TRUE', '(TRUE)'];

// 公開目錄表：RLS 應啟用、但「anon 可讀」是 by-design（#1563 白名單）。
// 這些表 RLS-off 仍算違規（該開 RLS＋公開讀 policy），但不因「anon 有 SELECT」被標。
// 本清單只用於未來若加入 SELECT-grant 全表掃描；目前全表掃描只查 RLS-on 與寫入權限，
// 兩者對公開表也適用（公開表也該開 RLS、也不該給 anon 寫入），故此清單暫作文件用途。
const PUBLIC_READ_TABLES = [
  'activities', 'activity_plans', 'activity_plan_tiers', 'activity_plan_seasons',
  'activity_packages', 'package_activities', 'activity_schedules', 'activity_images',
  'activity_reviews', 'activity_qa', 'experiences', 'events', 'promo_codes',
  'refund_policies', 'guide_profiles', 'homepage_featured_settings',
  'soft_launch_controls', 'soft_launch_whitelist',
];

// scan-all 的寫入違規只認「公開角色」anon/PUBLIC——它們絕不該有任何寫入權（#1563 威脅模型）。
// authenticated 對多數表有 write grant 是 Supabase 標準模型（真正的限制在 RLS policy），
// 全標會變成雜訊；而敏感表的 authenticated 寫入已由 checkGrants（SENSITIVE_TABLES）覆蓋。
const NEVER_WRITE_ROLES = ['anon', 'PUBLIC'];
const HELPER_RPC_MIGRATION_FILE = 'supabase/migrations/20260709103000_rls_grants_preflight_helper_rpcs.sql';
const SCAN_RPC_MIGRATION_FILE = 'supabase/migrations/20260707081500_rls_preflight_scan_rpc.sql';
const HELPER_RPC_NAMES = [
  'rls_grants_preflight_check_policies',
  'rls_grants_preflight_check_grants',
  'rls_preflight_scan',
];

/**
 * 純函式（可離線單測）：把 rls_preflight_scan 回傳的一列，判成 0..N 個違規。
 *   - rls_enabled=false → rls_disabled（該表沒開 RLS，policy 檢查形同虛設）
 *   - anon/PUBLIC 有寫入權 → broad_write_grant（authenticated 不計，見上）
 */
export function classifyScanRow(row) {
  const violations = [];
  const table = row?.table_name;
  if (row && row.rls_enabled === false) {
    violations.push({ table, violation: 'rls_disabled' });
  }
  const writeGrantees = Array.isArray(row?.forbidden_write_grantees) ? row.forbidden_write_grantees : [];
  const publicWrite = writeGrantees.filter((g) => NEVER_WRITE_ROLES.includes(g));
  if (publicWrite.length > 0) {
    violations.push({ table, grantees: publicWrite, violation: 'broad_write_grant' });
  }
  return violations;
}

function parseArgs(argv) {
  const options = { help: false, json: false, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--output') { options.output = argv[i + 1] ?? null; i += 1; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function sanitize(text) {
  return text
    .replace(/(SUPABASE_URL=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(SUPABASE_SERVICE_ROLE_KEY=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>');
}

function sanitizeErrorMessage(message) {
  return sanitize(String(message || 'unknown error'));
}

function isMissingHelperRpcError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '').toUpperCase();
  return (
    code === 'PGRST202'
    || code === '42883'
    || /schema cache/i.test(message)
    || /function .* does not exist/i.test(message)
    || HELPER_RPC_NAMES.some((name) => message.includes(name))
  );
}

function isAllowedPublicReadPolicy(table, row, effectiveRoles, qual, withCheck) {
  if (!PUBLIC_READ_CONFIG_TABLES.includes(table)) return false;
  const isSelectCommand = row.cmd === 'SELECT';
  if (!isSelectCommand) return false;
  if (!effectiveRoles.every((role) => FORBIDDEN_ROLES.includes(role))) return false;
  if (!PERMISSIVE_EXPRS.includes(qual)) return false;
  return withCheck === '' || PERMISSIVE_EXPRS.includes(withCheck);
}

function isAllowedPublicReadGrant(table, grantee, privilege) {
  return PUBLIC_READ_CONFIG_TABLES.includes(table)
    && privilege === 'SELECT'
    && FORBIDDEN_ROLES.includes(grantee);
}

export function classifyCheckFailure({
  table,
  check,
  error,
  helperName = null,
  migrationFile = HELPER_RPC_MIGRATION_FILE,
  reasonCode = 'missing_helper_rpc',
}) {
  const detail = sanitizeErrorMessage(error?.message);
  if (isMissingHelperRpcError(error)) {
    return {
      table,
      check,
      status: 'hold',
      reason_code: reasonCode,
      reason: `${helperName || 'required preflight RPC'} unavailable: ${detail}`,
      action_code: 'apply_versioned_migration',
      action: `apply ${migrationFile} before rerunning preflight`,
      violations: [],
    };
  }

  return {
    table,
    check,
    status: 'fail',
    reason_code: 'runtime_error',
    reason: `${check} check failed: ${detail}`,
    violations: [],
  };
}

export function summarizeResults(results) {
  const allViolations = results.flatMap((r) => r.violations || []);
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const holdCount = results.filter((r) => r.status === 'hold').length;

  return {
    overall_status: failCount > 0 ? 'fail' : holdCount > 0 ? 'hold' : 'pass',
    tables_checked: SENSITIVE_TABLES.length,
    checks_run: results.length,
    pass: passCount,
    fail: failCount,
    hold: holdCount,
    violation_count: allViolations.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 全表掃描：列出 public 全部 base table，檢查 RLS 是否啟用＋是否誤發 anon 寫入權。
 * RPC 缺失時改標 HOLD（明確 prerequisite），避免 unknown 成為穩態。
 */
async function checkScanAll(client) {
  const { data, error } = await client.rpc('rls_preflight_scan');
  if (error) {
    return classifyCheckFailure({
      table: '(all public tables)',
      check: 'scan_all',
      error,
      helperName: 'rls_preflight_scan',
      migrationFile: SCAN_RPC_MIGRATION_FILE,
      reasonCode: 'missing_scan_rpc',
    });
  }
  if (!Array.isArray(data)) {
    return {
      table: '(all public tables)',
      check: 'scan_all',
      status: 'fail',
      reason_code: 'runtime_error',
      reason: 'scan_all RPC returned non-array',
      violations: [],
    };
  }
  const violations = data.flatMap((row) => classifyScanRow(row));
  return {
    table: '(all public tables)',
    check: 'scan_all',
    status: violations.length === 0 ? 'pass' : 'fail',
    tables_scanned: data.length,
    violations,
  };
}

/**
 * Query pg_policies for the given table and return any overly permissive entries.
 * A policy is considered overly permissive when:
 *   - The role is anon, authenticated, or public (or empty/PUBLIC which defaults to all roles)
 *   - qual (USING) or with_check is 'true'
 */
async function checkPolicies(client, table) {
  const violations = [];
  const { data, error } = await client.rpc('rls_grants_preflight_check_policies', { p_table: table });

  if (error) {
    return classifyCheckFailure({
      table,
      check: 'rls_policies',
      error,
      helperName: 'rls_grants_preflight_check_policies',
    });
  }

  if (!Array.isArray(data)) {
    return {
      table,
      check: 'rls_policies',
      status: 'fail',
      reason_code: 'runtime_error',
      reason: 'rls_policies RPC returned non-array',
      violations: [],
    };
  }

  for (const row of data) {
    const role = (row.roles || '').replace(/[{}]/g, '').split(',').map((r) => r.trim()).filter(Boolean);
    const effectiveRoles = role.length === 0 ? ['public'] : role;

    const qual = (row.qual || '').trim();
    const withCheck = (row.with_check || '').trim();

    const hasPermissiveExpr =
      PERMISSIVE_EXPRS.includes(qual) || PERMISSIVE_EXPRS.includes(withCheck);

    const hasForbiddenRole = effectiveRoles.some((r) => FORBIDDEN_ROLES.includes(r));

    if (hasPermissiveExpr && hasForbiddenRole && !isAllowedPublicReadPolicy(table, row, effectiveRoles, qual, withCheck)) {
      violations.push({
        policy_name: row.policyname,
        table,
        roles: effectiveRoles,
        command: row.cmd,
        qual,
        with_check: withCheck,
        violation: 'overly_permissive_policy',
      });
    }
  }

  return {
    table,
    check: 'rls_policies',
    status: violations.length === 0 ? 'pass' : 'fail',
    violations,
  };
}

/**
 * Query information_schema.role_table_grants for forbidden broad privileges.
 * Flags any SELECT/INSERT/UPDATE/DELETE grant to anon/authenticated/public.
 */
async function checkGrants(client, table) {
  const violations = [];
  const { data, error } = await client.rpc('rls_grants_preflight_check_grants', { p_table: table });

  if (error) {
    return classifyCheckFailure({
      table,
      check: 'role_table_grants',
      error,
      helperName: 'rls_grants_preflight_check_grants',
    });
  }

  if (!Array.isArray(data)) {
    return {
      table,
      check: 'role_table_grants',
      status: 'fail',
      reason_code: 'runtime_error',
      reason: 'role_table_grants RPC returned non-array',
      violations: [],
    };
  }

  const forbiddenPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  for (const row of data) {
    const grantee = (row.grantee || '').trim();
    const privilege = (row.privilege_type || '').trim().toUpperCase();

    if (
      FORBIDDEN_ROLES.includes(grantee)
      && forbiddenPrivileges.includes(privilege)
      && !isAllowedPublicReadGrant(table, grantee, privilege)
    ) {
      violations.push({
        table,
        grantee,
        privilege_type: privilege,
        is_grantable: row.is_grantable,
        violation: 'broad_role_grant',
      });
    }
  }

  return {
    table,
    check: 'role_table_grants',
    status: violations.length === 0 ? 'pass' : 'fail',
    violations,
  };
}

function formatText(results, summary) {
  const lines = [];
  lines.push('=== RLS / Grants Preflight Report ===');
  lines.push(`Overall: ${summary.overall_status.toUpperCase()}`);
  lines.push(`Tables checked: ${summary.tables_checked}`);
  lines.push(`Checks run: ${summary.checks_run}`);
  lines.push(`Pass: ${summary.pass}  Fail: ${summary.fail}  Hold: ${summary.hold}`);
  lines.push(`Timestamp: ${summary.timestamp}`);
  lines.push('');

  for (const r of results) {
    const statusLabel = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'HOLD';
    lines.push(`[${statusLabel}] ${r.table} / ${r.check}`);
    if (r.reason) lines.push(`  Reason: ${r.reason}`);
    if (r.action) lines.push(`  Action: ${r.action}`);
    for (const v of r.violations || []) {
      if (v.violation === 'overly_permissive_policy') {
        lines.push(`  VIOLATION: policy "${v.policy_name}" — roles [${v.roles.join(', ')}] — cmd ${v.command} — USING(${v.qual})`);
      } else if (v.violation === 'broad_role_grant') {
        lines.push(`  VIOLATION: ${v.privilege_type} granted to ${v.grantee} on ${v.table}`);
      } else if (v.violation === 'rls_disabled') {
        lines.push(`  VIOLATION: table "${v.table}" 未啟用 RLS（relrowsecurity=false）`);
      } else if (v.violation === 'broad_write_grant') {
        lines.push(`  VIOLATION: table "${v.table}" 對 [${v.grantees.join(', ')}] 開了寫入權（INSERT/UPDATE/DELETE）`);
      }
    }
  }

  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const msg = 'Missing required env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\nRun with --help for usage.';
    console.error(msg);
    return 1;
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });

  const results = [];

  for (const table of SENSITIVE_TABLES) {
    const [policyResult, grantsResult] = await Promise.all([
      checkPolicies(client, table),
      checkGrants(client, table),
    ]);
    results.push(policyResult, grantsResult);
  }

  // 全表掃描（RLS-on + 無 anon 寫入權）——涵蓋清單外的新表
  results.push(await checkScanAll(client));

  const allViolations = results.flatMap((r) => r.violations || []);
  const summary = summarizeResults(results);
  const overallStatus = summary.overall_status;

  const report = {
    summary,
    results,
    violations: allViolations,
    tables_checked: SENSITIVE_TABLES,
    forbidden_roles: FORBIDDEN_ROLES,
  };

  const output = options.json
    ? JSON.stringify(report, null, 2)
    : formatText(results, summary);

  const safeOutput = sanitize(output);
  console.log(safeOutput);

  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${safeOutput}\n`, 'utf8');
  }

  return overallStatus === 'pass' ? 0 : 1;
}

// 僅在直接執行時跑 main（被 import 做單測時不執行，否則會印 usage＋process.exit 殺掉測試）
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      const fallback = {
        summary: {
          overall_status: 'fail',
          tables_checked: 0,
          checks_run: 0,
          pass: 0,
          fail: 0,
          hold: 0,
          violation_count: 0,
          timestamp: new Date().toISOString(),
        },
        error: { message: String(err?.message || 'unknown'), classification: 'runtime_error' },
      };
      console.error(sanitize(JSON.stringify(fallback, null, 2)));
      process.exit(1);
    });
}
