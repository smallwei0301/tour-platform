/**
 * Contract tests for Issue #638: Readiness live-state snapshot mechanism.
 *
 * Static checks — no network calls, no gh CLI required.
 * Verifies that all deliverables are present and correctly wired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..'); // apps/web → tour-platform

const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'readiness', 'generate-live-state-snapshot.mjs');
const OUTPUT_PATH = resolve(REPO_ROOT, 'docs', 'operations', 'reports', 'readiness-live-state-latest.md');
const PKG_PATH = resolve(REPO_ROOT, 'package.json');

// ── AC1: Script file exists ─────────────────────────────────────────────────

test('script file exists at scripts/readiness/generate-live-state-snapshot.mjs', () => {
  assert.ok(
    existsSync(SCRIPT_PATH),
    `Expected script at ${SCRIPT_PATH} — run: node scripts/readiness/generate-live-state-snapshot.mjs`
  );
});

// ── AC2: Script uses gh issue list ─────────────────────────────────────────

test('script source references gh issue list', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(
    src.includes('gh issue list'),
    'Script must call `gh issue list` to fetch open issues'
  );
});

// ── AC3: Script references the canonical output path ───────────────────────

test('script outputs to docs/operations/reports/readiness-live-state-latest.md', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(
    src.includes('readiness-live-state-latest.md'),
    'Script must reference the canonical output file name'
  );
});

// ── AC4: package.json has readiness:snapshot script ────────────────────────

test('package.json has readiness:snapshot script', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  assert.ok(
    pkg.scripts && typeof pkg.scripts['readiness:snapshot'] === 'string',
    'package.json must define scripts["readiness:snapshot"]'
  );
  assert.ok(
    pkg.scripts['readiness:snapshot'].includes('generate-live-state-snapshot.mjs'),
    'readiness:snapshot must invoke generate-live-state-snapshot.mjs'
  );
});

// ── AC5: Initial snapshot file was generated ───────────────────────────────

test('initial snapshot file exists at docs/operations/reports/readiness-live-state-latest.md', () => {
  assert.ok(
    existsSync(OUTPUT_PATH),
    `Expected snapshot at ${OUTPUT_PATH} — run: npm run readiness:snapshot`
  );
});

test('snapshot file contains auto-generated notice', () => {
  const content = readFileSync(OUTPUT_PATH, 'utf8');
  assert.ok(
    content.includes('auto-generated'),
    'Snapshot must include the auto-generated notice'
  );
});

test('snapshot file contains Query timestamp', () => {
  const content = readFileSync(OUTPUT_PATH, 'utf8');
  assert.ok(
    content.includes('Query timestamp') || content.includes('timestamp'),
    'Snapshot must include a query timestamp'
  );
});

test('snapshot file contains Commit SHA', () => {
  const content = readFileSync(OUTPUT_PATH, 'utf8');
  assert.ok(
    content.includes('Commit SHA') || content.includes('Commit'),
    'Snapshot must include the commit SHA'
  );
});
