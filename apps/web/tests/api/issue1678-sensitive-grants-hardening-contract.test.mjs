/**
 * Issue #1678 — sensitive-table grants hardening + preflight contract
 *
 * Static source contract only. No live DB access required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/security/rls-grants-preflight.mjs');
const MIGRATION_PATH = path.join(REPO_ROOT, 'supabase/migrations/20260709_issue1678_sensitive_table_grants_hardening.sql');
const ROLLBACK_PATH = path.join(REPO_ROOT, 'supabase/migrations/20260709_issue1678_sensitive_table_grants_hardening.rollback.sql');

const SERVICE_ONLY_TABLES = [
  'refund_requests',
  'payouts',
  'guide_balances',
  'settlement_rules',
  'orders',
  'bookings',
  'users',
  'traveler_profiles',
  'guide_applications',
];

const PUBLIC_READ_TABLES = ['soft_launch_controls'];

function readUtf8(filePath) {
  assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue 1678 migration files exist', () => {
  it('creates canonical migration', () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), `Missing migration: ${MIGRATION_PATH}`);
  });

  it('creates canonical rollback', () => {
    assert.ok(fs.existsSync(ROLLBACK_PATH), `Missing rollback: ${ROLLBACK_PATH}`);
  });
});

describe('Issue 1678 migration hardens service-only sensitive tables', () => {
  it('revokes broad anon/authenticated/public table grants for every service-only table', () => {
    const sql = readUtf8(MIGRATION_PATH);

    for (const table of SERVICE_ONLY_TABLES) {
      assert.match(
        sql,
        new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+anon,\\s*authenticated,\\s*public`, 'i'),
        `Migration must revoke broad grants for ${table}`,
      );
    }
  });

  it('re-grants service_role access for every service-only table', () => {
    const sql = readUtf8(MIGRATION_PATH);

    for (const table of SERVICE_ONLY_TABLES) {
      assert.match(
        sql,
        new RegExp(`GRANT\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+service_role`, 'i'),
        `Migration must preserve service_role access for ${table}`,
      );
    }
  });
});

describe('Issue 1678 migration preserves explicit public-read-only soft launch access', () => {
  it('revokes broad writes on soft_launch_controls but re-grants only SELECT to anon/authenticated', () => {
    const sql = readUtf8(MIGRATION_PATH);

    assert.match(
      sql,
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.soft_launch_controls\s+FROM\s+anon,\s*authenticated,\s*public/i,
      'Migration must clear existing broad grants on soft_launch_controls first',
    );
    assert.match(
      sql,
      /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.soft_launch_controls\s+TO\s+anon,\s*authenticated/i,
      'Migration must restore read-only soft_launch_controls access for anon/authenticated',
    );
    assert.doesNotMatch(
      sql,
      /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+public\.soft_launch_controls\s+TO\s+(?:anon|authenticated|public)/i,
      'Migration must not re-grant soft_launch_controls writes to public-facing roles',
    );
  });

  it('defines explicit anon/authenticated read-only policies for soft_launch_controls', () => {
    const sql = readUtf8(MIGRATION_PATH);

    assert.match(sql, /DROP POLICY IF EXISTS "soft_launch_controls: authenticated read" ON public\.soft_launch_controls/i);
    assert.match(sql, /DROP POLICY IF EXISTS "soft_launch_controls: anon read" ON public\.soft_launch_controls/i);
    assert.match(
      sql,
      /CREATE POLICY "soft_launch_controls: authenticated read" ON public\.soft_launch_controls\s+FOR SELECT TO authenticated USING \(true\)/i,
    );
    assert.match(
      sql,
      /CREATE POLICY "soft_launch_controls: anon read" ON public\.soft_launch_controls\s+FOR SELECT TO anon USING \(true\)/i,
    );
  });
});

describe('Issue 1678 rollback restores previous broad grants boundary', () => {
  it('re-grants authenticated CRUD on service-only legacy tables for rollback symmetry', () => {
    const sql = readUtf8(ROLLBACK_PATH);

    for (const table of SERVICE_ONLY_TABLES) {
      assert.match(
        sql,
        new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+authenticated`, 'i'),
        `Rollback must restore legacy authenticated CRUD for ${table}`,
      );
    }
  });

  it('restores soft_launch_controls authenticated CRUD and anon SELECT while removing anon-read policy', () => {
    const sql = readUtf8(ROLLBACK_PATH);

    assert.match(sql, /DROP POLICY IF EXISTS "soft_launch_controls: anon read" ON public\.soft_launch_controls/i);
    assert.match(
      sql,
      /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.soft_launch_controls\s+TO\s+anon/i,
      'Rollback must restore anon SELECT on soft_launch_controls',
    );
    assert.match(
      sql,
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.soft_launch_controls\s+TO\s+authenticated/i,
      'Rollback must restore legacy authenticated CRUD on soft_launch_controls',
    );
  });
});

describe('Issue 1678 preflight contract distinguishes service-only vs explicit public-read tables', () => {
  it('script tracks expanded sensitive-table list', () => {
    const source = readUtf8(SCRIPT_PATH);

    for (const table of [...SERVICE_ONLY_TABLES, ...PUBLIC_READ_TABLES]) {
      assert.match(
        source,
        new RegExp(`['\"]${table}['\"]`),
        `Preflight script must include ${table} in its table contract`,
      );
    }
  });

  it('script has explicit public-read config-table allowlist and keeps writes forbidden', () => {
    const source = readUtf8(SCRIPT_PATH);

    assert.match(source, /PUBLIC_READ_CONFIG_TABLES/i, 'Script must declare an explicit public-read allowlist');
    assert.match(source, /soft_launch_controls/, 'soft_launch_controls must be the explicit public-read table');
    assert.match(source, /forbiddenPrivileges\s*=\s*\['SELECT',\s*'INSERT',\s*'UPDATE',\s*'DELETE'\]/, 'Script must still reason about all broad grants');
    assert.match(source, /privilege\s*===\s*'SELECT'/, 'Script must branch on SELECT-specific allowlisting');
    assert.match(source, /row\.cmd\s*===\s*'SELECT'/, 'Script must branch on SELECT-only policy allowlisting');
  });

  it('issue602 source contract also covers the GH-1678 table additions', () => {
    const source = readUtf8(path.join(REPO_ROOT, 'apps/web/tests/api/issue602-rls-grants-preflight-contract.test.mjs'));

    for (const table of ['users', 'traveler_profiles', 'guide_applications']) {
      assert.match(
        source,
        new RegExp(`['\"]${table}['\"]`),
        `Issue 602 contract test must now include ${table}`,
      );
    }
  });
});
