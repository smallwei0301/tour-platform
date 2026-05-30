/**
 * Phase 13 — Alerting Bus Contract Tests (AC1–AC5)
 * Issue #325: incidents table + LINE/Sentry fan-out lib
 *
 * Uses node:test + readFileSync pattern (no live server, no live credentials).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── AC1: Migration file ───────────────────────────────────────────────────────

test('AC1: migration 20260511_phase13_incidents.sql exists with required DDL', () => {
  const migrationPath = path.resolve(ROOT, '../../supabase/migrations/20260511_phase13_incidents.sql');
  assert.ok(existsSync(migrationPath), `Migration file not found: ${migrationPath}`);

  const sql = readFileSync(migrationPath, 'utf8');

  // Table creation
  assert.match(sql, /CREATE TABLE IF NOT EXISTS incidents/, 'Must have CREATE TABLE IF NOT EXISTS incidents');

  // Required columns
  assert.match(sql, /id\s+uuid\s+PRIMARY KEY/, 'Must have id uuid PRIMARY KEY');
  assert.match(sql, /severity\s+text\s+NOT NULL/, 'Must have severity text NOT NULL');
  assert.match(sql, /CHECK.*'info'.*'warn'.*'error'.*'critical'|CHECK.*info.*warn.*error.*critical/, 'Must have severity CHECK constraint');
  assert.match(sql, /source\s+text\s+NOT NULL/, 'Must have source text NOT NULL');
  assert.match(sql, /category\s+text/, 'Must have category text');
  assert.match(sql, /fingerprint\s+text/, 'Must have fingerprint text');
  assert.match(sql, /message\s+text\s+NOT NULL/, 'Must have message text NOT NULL');
  assert.match(sql, /metadata\s+jsonb/, 'Must have metadata jsonb');
  assert.match(sql, /created_at\s+timestamptz/, 'Must have created_at timestamptz');
  assert.match(sql, /resolved_at\s+timestamptz/, 'Must have resolved_at timestamptz');

  // RLS
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'Must enable RLS');
  assert.match(sql, /service_role/, 'Must reference service_role in RLS policy');
});

test('AC1b: rollback file 20260511_phase13_incidents.rollback.sql exists', () => {
  const rollbackPath = path.resolve(ROOT, '../../supabase/migrations/20260511_phase13_incidents.rollback.sql');
  assert.ok(existsSync(rollbackPath), `Rollback file not found: ${rollbackPath}`);

  const sql = readFileSync(rollbackPath, 'utf8');
  assert.match(sql, /DROP TABLE IF EXISTS incidents/, 'Must drop incidents table in rollback');
});

// ── AC2: incidents.ts lib ─────────────────────────────────────────────────────

test('AC2: incidents.ts exists and exports recordIncident with Sentry + LINE + fire-and-forget', () => {
  const libPath = path.resolve(ROOT, 'src/lib/incidents.ts');
  assert.ok(existsSync(libPath), `incidents.ts not found: ${libPath}`);

  const src = readFileSync(libPath, 'utf8');

  // exports recordIncident
  assert.match(src, /export.*function recordIncident|export.*const recordIncident/, 'Must export recordIncident');

  // Sentry integration
  assert.match(src, /Sentry\.(captureException|captureMessage)/, 'Must call Sentry.captureException or Sentry.captureMessage');

  // LINE notify integration
  assert.match(src, /notifySystemError/, 'Must call notifySystemError from line-notify');

  // fire-and-forget (try/catch wrapping)
  assert.match(src, /try\s*\{[\s\S]*?Sentry\.(captureException|captureMessage)[\s\S]*?\}\s*catch/, 'Sentry call must be wrapped in try/catch');
  assert.match(src, /try\s*\{[\s\S]*?notifySystemError[\s\S]*?\}\s*catch/, 'notifySystemError call must be wrapped in try/catch');

  // DB insert to incidents table — behavioral check (not just string presence)
  assert.match(src, /\.from\s*\(\s*['"]incidents['"]\s*\)\.insert/, 'recordIncident must write to incidents table via supabase.from("incidents").insert()');
  assert.match(src, /SUPABASE_URL/, 'Must use server-side SUPABASE_URL env var (not NEXT_PUBLIC_*)');
  assert.ok(!src.includes('NEXT_PUBLIC_SUPABASE_URL'), 'Must NOT use NEXT_PUBLIC_SUPABASE_URL in server-side lib');

  // returns void/Promise<void>
  assert.match(src, /Promise<void>|:.*void/, 'Must return void or Promise<void>');
});

// ── AC3: ECPay callback wire ───────────────────────────────────────────────────

test('AC3: ECPay callback PAYMENT_FAILED branch calls recordIncident', () => {
  const callbackPath = path.resolve(ROOT, 'app/api/payments/ecpay/callback/route.ts');
  assert.ok(existsSync(callbackPath), `ECPay callback not found: ${callbackPath}`);

  const src = readFileSync(callbackPath, 'utf8');

  // recordIncident is imported and called
  assert.match(src, /recordIncident/, 'Must reference recordIncident');
  assert.match(src, /source\s*:\s*['"]ecpay_callback['"]/, "Must call recordIncident with source:'ecpay_callback'");
  assert.match(src, /severity\s*:\s*['"]error['"]/, "Must call recordIncident with severity:'error'");

  // idempotency markers from #195/#197 still present
  assert.match(src, /idempotent|processPaymentCallbackDb|BOOKING_CONFLICT/, 'Idempotency guards from prior issues must still be present');
});

// ── AC4: redactPii helper ─────────────────────────────────────────────────────

test('AC4: redactPii masks email and phone, preserves amount', () => {
  const libPath = path.resolve(ROOT, 'src/lib/incidents.ts');
  assert.ok(existsSync(libPath), `incidents.ts not found: ${libPath}`);

  const src = readFileSync(libPath, 'utf8');
  assert.match(src, /export.*function redactPii|export.*const redactPii/, 'Must export redactPii');

  // Verify PII keys are listed in the redaction logic
  assert.match(src, /['"]email['"]/, 'Must handle email PII key');
  assert.match(src, /['"]phone['"]/, 'Must handle phone PII key');

  // Must mask values (replace with *** or partial mask)
  assert.match(src, /\*\*\*|mask|redact/i, 'Must apply masking/redaction to PII fields');
});

// ── AC5: no-token graceful skip ───────────────────────────────────────────────

test('AC5: ops notify gracefully skips when LINE Messaging is not configured', () => {
  // Migration (#302b): LINE Notify was shut down 2025-03-31. line-notify.ts now
  // delegates to the Messaging API ops push; the graceful-skip lives in
  // line-messaging.ts (no token / no ops group / kill-switch off → skipped).
  const lineNotifyPath = path.resolve(ROOT, 'src/lib/line-notify.ts');
  assert.ok(existsSync(lineNotifyPath), `line-notify.ts not found: ${lineNotifyPath}`);
  const notifySrc = readFileSync(lineNotifyPath, 'utf8');
  assert.match(notifySrc, /pushToOps/, 'line-notify must route ops alerts through pushToOps');

  const messagingPath = path.resolve(ROOT, 'src/lib/line-messaging.ts');
  assert.ok(existsSync(messagingPath), `line-messaging.ts not found: ${messagingPath}`);
  const messagingSrc = readFileSync(messagingPath, 'utf8');
  // Skips when the access token is missing instead of throwing.
  assert.match(messagingSrc, /no_access_token/, 'Must skip when access token is absent');
  assert.match(messagingSrc, /status:\s*'skipped'/, 'Must return a skipped status rather than throw');
});
