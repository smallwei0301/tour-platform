/**
 * Unit tests for synthetic-health-probe.mjs exported helpers.
 * Issue #721 — fingerprint dedupe + secret sanitization.
 *
 * Run:
 *   node --test apps/web/tests/unit/synthetic-health-probe.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Resolve path relative to repo root (4 levels up from this file's directory)
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROBE_PATH = path.resolve(__dirname, '../../../../scripts/cron/synthetic-health-probe.mjs');

// We import with a fake NEXT_PUBLIC_VERCEL_URL set so the module guard doesn't
// call process.exit(0). The guard fires at top-level, so we must set it before import.
process.env.NEXT_PUBLIC_VERCEL_URL = 'https://probe-test.example.com';

const {
  buildFingerprint,
  sanitizeForIssueBody,
  buildIssueTitle,
  buildIssueBody,
  createOrUpdateIssue,
} = await import(PROBE_PATH);

// ---------------------------------------------------------------------------
// 1. buildFingerprint
// ---------------------------------------------------------------------------
test('buildFingerprint — stable output for consistent inputs', () => {
  const fp1 = buildFingerprint({
    checkName: 'api/health',
    endpoint: '/api/health',
    httpStatus: 503,
    errorMsg: 'expected { ok: true } but got ok=false',
  });
  const fp2 = buildFingerprint({
    checkName: 'api/health',
    endpoint: '/api/health',
    httpStatus: 503,
    errorMsg: 'expected { ok: true } but got ok=false',
  });
  assert.equal(fp1, fp2, 'Same inputs must produce same fingerprint');
});

test('buildFingerprint — normalizes check name to lowercase hyphens', () => {
  const fp = buildFingerprint({
    checkName: 'API/Health Check',
    endpoint: '/api/health',
    httpStatus: 500,
    errorMsg: '',
  });
  // The first segment should be lowercase with hyphens only
  const [checkSegment] = fp.split('|');
  assert.match(checkSegment, /^[a-z0-9-]+$/, 'Check name segment must be lowercase hyphens only');
});

test('buildFingerprint — strips ISO timestamps from error message', () => {
  const fp = buildFingerprint({
    checkName: 'root',
    endpoint: '/',
    httpStatus: 504,
    errorMsg: 'timeout at 2024-03-15T12:34:56.789Z retry',
  });
  const segments = fp.split('|');
  const errorSegment = segments[3];
  assert.doesNotMatch(errorSegment, /\d{4}-\d{2}-\d{2}t/i, 'ISO timestamp should be stripped');
});

test('buildFingerprint — strips version segments from error message', () => {
  const fp = buildFingerprint({
    checkName: 'root',
    endpoint: '/',
    httpStatus: 500,
    errorMsg: 'node 18.17.1 fetch error',
  });
  const segments = fp.split('|');
  const errorSegment = segments[3];
  assert.doesNotMatch(errorSegment, /\d+\.\d+\.\d+/, 'Version segment should be stripped');
});

test('buildFingerprint — truncates normalized error to 80 chars', () => {
  const longError = 'a'.repeat(200);
  const fp = buildFingerprint({
    checkName: 'root',
    endpoint: '/',
    httpStatus: 503,
    errorMsg: longError,
  });
  const errorSegment = fp.split('|')[3];
  assert.ok(errorSegment.length <= 80, `Error segment must be ≤80 chars, got ${errorSegment.length}`);
});

test('buildFingerprint — handles missing/falsy fields gracefully', () => {
  const fp = buildFingerprint({ checkName: '', endpoint: '', httpStatus: null, errorMsg: null });
  assert.ok(typeof fp === 'string', 'Must return a string even with empty inputs');
  assert.ok(fp.includes('|'), 'Must include pipe separators');
});

// ---------------------------------------------------------------------------
// 2. sanitizeForIssueBody
// ---------------------------------------------------------------------------
test('sanitizeForIssueBody — redacts Bearer tokens', () => {
  const input = 'Authorization: Bearer eyABC123.valid.token\nrest of text';
  const output = sanitizeForIssueBody(input);
  assert.doesNotMatch(output, /eyABC123/, 'Bearer token value must be redacted');
  assert.match(output, /\[REDACTED\]/, 'Must contain [REDACTED] placeholder');
});

test('sanitizeForIssueBody — redacts JWTs', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const output = sanitizeForIssueBody(`token: ${jwt}`);
  assert.doesNotMatch(output, /eyJhbGciOiJ/, 'JWT header must be redacted');
});

test('sanitizeForIssueBody — redacts postgres URLs', () => {
  const pgUrl = 'postgresql://user:password@db.example.com:5432/mydb';
  const output = sanitizeForIssueBody(`DB_URL=${pgUrl}`);
  assert.doesNotMatch(output, /password/, 'Postgres URL must be redacted');
  assert.match(output, /\[REDACTED\]/, 'Must contain [REDACTED]');
});

test('sanitizeForIssueBody — redacts ghp_ tokens', () => {
  const token = 'ghp_' + 'A'.repeat(36);
  const output = sanitizeForIssueBody(`GITHUB_TOKEN=${token}`);
  assert.doesNotMatch(output, new RegExp('ghp_' + 'A'.repeat(36)), 'ghp_ token must be redacted');
});

test('sanitizeForIssueBody — redacts email addresses', () => {
  const output = sanitizeForIssueBody('Contact: user.name+test@example.co.uk for details');
  assert.doesNotMatch(output, /user\.name/, 'Email must be redacted');
  assert.match(output, /\[REDACTED\]/, 'Must contain [REDACTED]');
});

test('sanitizeForIssueBody — truncates text longer than 120 lines', () => {
  const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
  const input = lines.join('\n');
  const output = sanitizeForIssueBody(input);
  const outputLines = output.split('\n');
  // 120 content lines + 1 truncation marker = 121
  assert.ok(outputLines.length <= 121, `Output must be ≤121 lines, got ${outputLines.length}`);
  assert.match(output, /\.\.\. \(truncated\)/, 'Must end with truncation marker');
});

test('sanitizeForIssueBody — does not truncate text at or under 120 lines', () => {
  const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
  const input = lines.join('\n');
  const output = sanitizeForIssueBody(input);
  assert.doesNotMatch(output, /\.\.\. \(truncated\)/, 'Should not truncate when exactly 120 lines');
});

test('sanitizeForIssueBody — handles empty string', () => {
  assert.equal(sanitizeForIssueBody(''), '', 'Empty string should return empty string');
});

// ---------------------------------------------------------------------------
// 3. buildIssueBody
// ---------------------------------------------------------------------------
test('buildIssueBody — contains fingerprint in output', () => {
  const failure = {
    label: 'api/health',
    target: 'https://example.com/api/health',
    status: 503,
    latencyMs: 1200,
    error: 'service unavailable',
  };
  const fingerprint = buildFingerprint({
    checkName: failure.label,
    endpoint: '/api/health',
    httpStatus: failure.status,
    errorMsg: failure.error,
  });
  const body = buildIssueBody({ failure, fingerprint, relatedClosed: [] });
  assert.match(body, new RegExp(fingerprint.replace(/[|]/g, '\\|')), 'Body must include the fingerprint');
});

test('buildIssueBody — contains no-secrets declaration', () => {
  const failure = {
    label: 'root',
    target: 'https://example.com/',
    status: 502,
    latencyMs: 300,
    error: null,
  };
  const fingerprint = 'root|/|502|';
  const body = buildIssueBody({ failure, fingerprint, relatedClosed: [] });
  assert.match(body, /No credentials or secrets should appear above/, 'Must include no-secrets declaration');
});

test('buildIssueBody — contains rerun command', () => {
  const failure = {
    label: 'root',
    target: 'https://example.com/',
    status: 503,
    latencyMs: 100,
    error: null,
  };
  const body = buildIssueBody({ failure, fingerprint: 'root|/|503|', relatedClosed: [] });
  assert.match(body, /synthetic-health-probe\.mjs/, 'Body must include rerun command');
});

test('buildIssueBody — lists related closed issues when provided', () => {
  const failure = {
    label: 'api/health',
    target: 'https://example.com/api/health',
    status: 500,
    latencyMs: 200,
    error: 'server error',
  };
  const body = buildIssueBody({
    failure,
    fingerprint: 'api-health|/api/health|500|server-error',
    relatedClosed: [42, 99],
  });
  assert.match(body, /#42/, 'Body must mention related issue #42');
  assert.match(body, /#99/, 'Body must mention related issue #99');
});

// ---------------------------------------------------------------------------
// 4. createOrUpdateIssue — dry-run mode
// ---------------------------------------------------------------------------
test('createOrUpdateIssue dry-run — returns { action: "dry-run" } without making fetch calls', async () => {
  const originalDryRun = process.env.DRY_RUN;
  process.env.DRY_RUN = '1';

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const failure = {
    label: 'root',
    target: 'https://probe-test.example.com/',
    status: 502,
    latencyMs: 150,
    ok: false,
    error: 'bad gateway',
  };

  const result = await createOrUpdateIssue({
    failure,
    token: 'ghp_' + 'X'.repeat(36),
    repo: 'owner/repo',
    fetchFn: mockFetch,
  });

  process.env.DRY_RUN = originalDryRun ?? '';

  assert.equal(result.action, 'dry-run', 'Must return action: "dry-run"');
  assert.equal(fetchCalled, false, 'Must not call fetch in dry-run mode');
});

// ---------------------------------------------------------------------------
// 5. createOrUpdateIssue — safe-failure when no token
// ---------------------------------------------------------------------------
test('createOrUpdateIssue safe-failure — no GITHUB_TOKEN returns { skipped: true }', async () => {
  const originalDryRun = process.env.DRY_RUN;
  process.env.DRY_RUN = '';

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const failure = {
    label: 'api/health',
    target: 'https://probe-test.example.com/api/health',
    status: 503,
    latencyMs: 5000,
    ok: false,
    error: 'timeout',
  };

  const result = await createOrUpdateIssue({
    failure,
    token: '',        // no token
    repo: 'owner/repo',
    fetchFn: mockFetch,
  });

  process.env.DRY_RUN = originalDryRun ?? '';

  assert.equal(result.skipped, true, 'Must return { skipped: true } when token is missing');
  assert.equal(fetchCalled, false, 'Must not call fetch when token is missing');
});

test('createOrUpdateIssue safe-failure — no GITHUB_REPOSITORY returns { skipped: true }', async () => {
  const originalDryRun = process.env.DRY_RUN;
  process.env.DRY_RUN = '';

  const failure = {
    label: 'root',
    target: 'https://probe-test.example.com/',
    status: 504,
    latencyMs: 5100,
    ok: false,
    error: 'gateway timeout',
  };

  const result = await createOrUpdateIssue({
    failure,
    token: 'ghp_' + 'X'.repeat(36),
    repo: '',         // no repo
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });

  process.env.DRY_RUN = originalDryRun ?? '';

  assert.equal(result.skipped, true, 'Must return { skipped: true } when repo is missing');
});
