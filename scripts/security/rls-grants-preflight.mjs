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
  1  FAIL — violations found or env missing`;

// Sensitive tables that must have restrictive RLS and grants.
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
];

// Roles that should NOT have broad access to sensitive tables.
const FORBIDDEN_ROLES = ['anon', 'authenticated', 'public'];

// Permissive USING/WITH CHECK expressions that indicate an overly open policy.
const PERMISSIVE_EXPRS = ['true', '(true)', 'TRUE', '(TRUE)'];

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

/**
 * Query pg_policies for the given table and return any overly permissive entries.
 * A policy is considered overly permissive when:
 *   - The role is anon, authenticated, or public (or empty/PUBLIC which defaults to all roles)
 *   - qual (USING) or with_check is 'true'
 */
async function checkPolicies(client, table) {
  const violations = [];

  // pg_policies is a system view accessible via PostgREST with service_role.
  // We use rpc to run raw SQL since the pg_catalog schema is not exposed via PostgREST by default.
  const { data, error } = await client.rpc('rls_grants_preflight_check_policies', { p_table: table });

  if (error) {
    // rpc may not exist — fallback: try reading from pg_policies via REST directly.
    // PostgREST does not expose pg_catalog so we collect what we can and flag as unknown.
    return {
      table,
      check: 'rls_policies',
      status: 'unknown',
      reason: `pg_policies RPC unavailable: ${error.message}. Run with direct psql for full RLS audit.`,
      violations: [],
    };
  }

  if (!Array.isArray(data)) {
    return { table, check: 'rls_policies', status: 'unknown', reason: 'RPC returned non-array', violations: [] };
  }

  for (const row of data) {
    const role = (row.roles || '').replace(/[{}]/g, '').split(',').map((r) => r.trim()).filter(Boolean);
    const effectiveRoles = role.length === 0 ? ['public'] : role;

    const qual = (row.qual || '').trim();
    const withCheck = (row.with_check || '').trim();

    const hasPermissiveExpr =
      PERMISSIVE_EXPRS.includes(qual) || PERMISSIVE_EXPRS.includes(withCheck);

    const hasForbiddenRole = effectiveRoles.some((r) => FORBIDDEN_ROLES.includes(r));

    if (hasPermissiveExpr && hasForbiddenRole) {
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
    return {
      table,
      check: 'role_table_grants',
      status: 'unknown',
      reason: `role_table_grants RPC unavailable: ${error.message}. Run with direct psql for full grants audit.`,
      violations: [],
    };
  }

  if (!Array.isArray(data)) {
    return { table, check: 'role_table_grants', status: 'unknown', reason: 'RPC returned non-array', violations: [] };
  }

  const forbiddenPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  for (const row of data) {
    const grantee = (row.grantee || '').trim();
    const privilege = (row.privilege_type || '').trim().toUpperCase();

    if (FORBIDDEN_ROLES.includes(grantee) && forbiddenPrivileges.includes(privilege)) {
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
  lines.push(`Pass: ${summary.pass}  Fail: ${summary.fail}  Unknown: ${summary.unknown}`);
  lines.push(`Timestamp: ${summary.timestamp}`);
  lines.push('');

  for (const r of results) {
    const statusLabel = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'UNKNOWN';
    lines.push(`[${statusLabel}] ${r.table} / ${r.check}`);
    if (r.reason) lines.push(`  Reason: ${r.reason}`);
    for (const v of r.violations || []) {
      if (v.violation === 'overly_permissive_policy') {
        lines.push(`  VIOLATION: policy "${v.policy_name}" — roles [${v.roles.join(', ')}] — cmd ${v.command} — USING(${v.qual})`);
      } else if (v.violation === 'broad_role_grant') {
        lines.push(`  VIOLATION: ${v.privilege_type} granted to ${v.grantee} on ${v.table}`);
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

  const allViolations = results.flatMap((r) => r.violations || []);
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const unknownCount = results.filter((r) => r.status === 'unknown').length;

  const overallStatus = failCount > 0 ? 'fail' : unknownCount > 0 ? 'unknown' : 'pass';

  const summary = {
    overall_status: overallStatus,
    tables_checked: SENSITIVE_TABLES.length,
    checks_run: results.length,
    pass: passCount,
    fail: failCount,
    unknown: unknownCount,
    violation_count: allViolations.length,
    timestamp: new Date().toISOString(),
  };

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
        unknown: 0,
        violation_count: 0,
        timestamp: new Date().toISOString(),
      },
      error: { message: String(err?.message || 'unknown'), classification: 'runtime_error' },
    };
    console.error(sanitize(JSON.stringify(fallback, null, 2)));
    process.exit(1);
  });
