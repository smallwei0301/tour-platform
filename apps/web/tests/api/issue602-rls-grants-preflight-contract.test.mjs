/**
 * Issue #602: Sensitive-table RLS/grants preflight — contract tests
 * Static inspection only — no live Supabase connection required.
 *
 * AC1: Script exists at scripts/security/rls-grants-preflight.mjs
 * AC2: SENSITIVE_TABLES list covers all required tables from the issue
 * AC3: FORBIDDEN_ROLES includes anon, authenticated, public
 * AC4: Script contains no hardcoded credentials
 * AC5: Script has --help / usage documentation
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/security/rls-grants-preflight.mjs');

const REQUIRED_SENSITIVE_TABLES = [
  'payment_events',
  'refund_requests',
  'payments',
  'payouts',
  'guide_balances',
  'settlement_rules',
  'soft_launch_controls',
];

const REQUIRED_FORBIDDEN_ROLES = ['anon', 'authenticated', 'public'];

// Patterns that would indicate hardcoded credentials in source.
// Real Supabase URLs are *.supabase.co; real keys are long JWT-like strings.
const HARDCODED_CREDENTIAL_PATTERNS = [
  /https:\/\/[a-z]{20,}\.supabase\.co/i,          // real Supabase project URL
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT token
  /service_role['":\s]+[A-Za-z0-9._-]{40,}/i,     // inline service_role key value
];

function readScript() {
  assert.ok(fs.existsSync(SCRIPT_PATH), `Script must exist at: ${SCRIPT_PATH}`);
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}

describe('Issue 602 RLS/grants preflight — contract', () => {
  it('AC1: script file exists at scripts/security/rls-grants-preflight.mjs', () => {
    assert.ok(fs.existsSync(SCRIPT_PATH), `Missing script: ${SCRIPT_PATH}`);
  });

  it('AC2: SENSITIVE_TABLES array includes all required tables', () => {
    const source = readScript();

    // Extract the SENSITIVE_TABLES array literal from source.
    // Look for the array assigned to SENSITIVE_TABLES const.
    const match = source.match(/const\s+SENSITIVE_TABLES\s*=\s*\[([^\]]+)\]/s);
    assert.ok(match, 'SENSITIVE_TABLES constant must be defined in script');

    const arrayBody = match[1];

    for (const table of REQUIRED_SENSITIVE_TABLES) {
      assert.ok(
        arrayBody.includes(`'${table}'`) || arrayBody.includes(`"${table}"`),
        `SENSITIVE_TABLES must include '${table}'`,
      );
    }
  });

  it('AC2: SENSITIVE_TABLES also covers optional tables orders and bookings', () => {
    const source = readScript();
    const match = source.match(/const\s+SENSITIVE_TABLES\s*=\s*\[([^\]]+)\]/s);
    assert.ok(match, 'SENSITIVE_TABLES constant must be defined in script');
    const arrayBody = match[1];

    // orders and bookings are listed as "if exists" in the issue — still check they're present.
    for (const table of ['orders', 'bookings']) {
      assert.ok(
        arrayBody.includes(`'${table}'`) || arrayBody.includes(`"${table}"`),
        `SENSITIVE_TABLES should include '${table}' (check-if-exists table)`,
      );
    }
  });

  it('AC3: FORBIDDEN_ROLES includes anon, authenticated, and public', () => {
    const source = readScript();

    const match = source.match(/const\s+FORBIDDEN_ROLES\s*=\s*\[([^\]]+)\]/s);
    assert.ok(match, 'FORBIDDEN_ROLES constant must be defined in script');

    const arrayBody = match[1];

    for (const role of REQUIRED_FORBIDDEN_ROLES) {
      assert.ok(
        arrayBody.includes(`'${role}'`) || arrayBody.includes(`"${role}"`),
        `FORBIDDEN_ROLES must include '${role}'`,
      );
    }
  });

  it('AC4: script does not contain hardcoded Supabase credentials', () => {
    const source = readScript();

    for (const pattern of HARDCODED_CREDENTIAL_PATTERNS) {
      assert.ok(
        !pattern.test(source),
        `Script must not contain hardcoded credentials matching: ${pattern}`,
      );
    }
  });

  it('AC4: script reads credentials exclusively from environment variables', () => {
    const source = readScript();

    // Must reference process.env.SUPABASE_URL and process.env.SUPABASE_SERVICE_ROLE_KEY.
    assert.match(source, /process\.env\.SUPABASE_URL/, 'Must read SUPABASE_URL from process.env');
    assert.match(
      source,
      /process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
      'Must read SUPABASE_SERVICE_ROLE_KEY from process.env',
    );
  });

  it('AC5: script has --help flag and usage message', () => {
    const source = readScript();

    // Source must mention --help.
    assert.match(source, /--help/i, 'Script source must document --help flag');

    // Running with --help should exit 0 and print usage.
    const result = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 0, '--help must exit with code 0');
    assert.match(result.stdout, /SUPABASE_URL/i, '--help output must mention SUPABASE_URL');
    assert.match(result.stdout, /SUPABASE_SERVICE_ROLE_KEY/i, '--help output must mention SUPABASE_SERVICE_ROLE_KEY');
  });

  it('AC5: script exits non-zero when env vars are missing', () => {
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      env,
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.notEqual(result.status, 0, 'Script must exit non-zero when env vars are absent');
  });

  it('AC5: --json flag is documented in script source', () => {
    const source = readScript();
    assert.match(source, /--json/i, 'Script must document and support --json flag');
  });
});
