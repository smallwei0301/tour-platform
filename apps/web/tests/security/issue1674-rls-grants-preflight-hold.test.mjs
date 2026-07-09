import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_MODULE_PATH = '../../../../scripts/security/rls-grants-preflight.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER_MIGRATION = path.resolve(__dirname, '../../../../supabase/migrations/20260709103000_rls_grants_preflight_helper_rpcs.sql');
const HELPER_ROLLBACK = path.resolve(__dirname, '../../../../supabase/migrations/20260709103000_rls_grants_preflight_helper_rpcs.rollback.sql');

describe('issue1674 — rls-grants-preflight HOLD classification', () => {
  it('helper RPC missing is classified as hold with machine-readable reason/action', async () => {
    const mod = await import(SCRIPT_MODULE_PATH);

    assert.equal(typeof mod.classifyCheckFailure, 'function', 'classifyCheckFailure export missing');

    const result = mod.classifyCheckFailure({
      check: 'rls_policies',
      table: 'payments',
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.rls_grants_preflight_check_policies(p_table) in the schema cache',
      },
    });

    assert.equal(result.status, 'hold');
    assert.equal(result.reason_code, 'missing_helper_rpc');
    assert.match(result.reason, /rls_grants_preflight_check_policies/);
    assert.match(result.action, /20260709103000_rls_grants_preflight_helper_rpcs\.sql/i);
  });

  it('summary exposes pass/fail/hold without unknown steady-state status', async () => {
    const mod = await import(SCRIPT_MODULE_PATH);

    assert.equal(typeof mod.summarizeResults, 'function', 'summarizeResults export missing');

    const summary = mod.summarizeResults([
      { status: 'pass', violations: [] },
      { status: 'hold', violations: [] },
    ]);

    assert.equal(summary.overall_status, 'hold');
    assert.equal(summary.pass, 1);
    assert.equal(summary.fail, 0);
    assert.equal(summary.hold, 1);
    assert.ok(!Object.hasOwn(summary, 'unknown'), 'summary must not expose unknown steady-state count');
  });

  it('real violations still outrank hold as fail', async () => {
    const mod = await import(SCRIPT_MODULE_PATH);
    const summary = mod.summarizeResults([
      { status: 'hold', violations: [] },
      { status: 'fail', violations: [{ violation: 'broad_role_grant' }] },
    ]);

    assert.equal(summary.overall_status, 'fail');
    assert.equal(summary.fail, 1);
    assert.equal(summary.hold, 1);
  });

  it('helper migration is canonical, locked down, and rollback exists', () => {
    assert.ok(fs.existsSync(HELPER_MIGRATION), `missing migration: ${HELPER_MIGRATION}`);
    assert.ok(fs.existsSync(HELPER_ROLLBACK), `missing rollback: ${HELPER_ROLLBACK}`);

    const sql = fs.readFileSync(HELPER_MIGRATION, 'utf8');
    const rollback = fs.readFileSync(HELPER_ROLLBACK, 'utf8');

    assert.match(sql, /create\s+or\s+replace\s+function\s+public\.rls_grants_preflight_check_policies\(p_table\s+text\)/i);
    assert.match(sql, /create\s+or\s+replace\s+function\s+public\.rls_grants_preflight_check_grants\(p_table\s+text\)/i);
    assert.ok((sql.match(/security\s+definer/ig) || []).length >= 2, 'both helper RPCs must be SECURITY DEFINER');
    assert.ok((sql.match(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/ig) || []).length >= 2, 'both helper RPCs must pin search_path');
    assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.rls_grants_preflight_check_policies\(text\)\s+from\s+public,\s*anon,\s*authenticated/i);
    assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.rls_grants_preflight_check_policies\(text\)\s+to\s+service_role/i);
    assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.rls_grants_preflight_check_grants\(text\)\s+from\s+public,\s*anon,\s*authenticated/i);
    assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.rls_grants_preflight_check_grants\(text\)\s+to\s+service_role/i);
    assert.match(sql, /where\s+n\.nspname\s*=\s*'public'[\s\S]*c\.relkind\s*=\s*'r'[\s\S]*c\.relname\s*=\s*p_table/i);
    assert.match(rollback, /drop\s+function\s+if\s+exists\s+public\.rls_grants_preflight_check_grants\(text\)/i);
    assert.match(rollback, /drop\s+function\s+if\s+exists\s+public\.rls_grants_preflight_check_policies\(text\)/i);
  });
});
