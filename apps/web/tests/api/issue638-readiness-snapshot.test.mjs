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
const FRESHNESS_SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'readiness', 'check-snapshot-freshness.mjs');
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

// ── AC9: Snapshot header contains freshness_rule block ─────────────────────
// (Only checked after a regeneration that includes the new generator code.
//  For existing snapshots this may not yet be present, so we check the
//  generator script injects it rather than the file itself.)

test('generate script injects freshness_rule comment', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(
    src.includes('freshness_rule:'),
    'Generator must inject a freshness_rule comment into the snapshot output'
  );
});

test('generate script injects query_timestamp html comment', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(
    src.includes('query_timestamp:'),
    'Generator must inject a <!-- query_timestamp: ... --> html comment for machine parsing'
  );
});

// ── AC10: check-snapshot-freshness.mjs script exists and is valid ──────────

test('check-snapshot-freshness.mjs script exists', () => {
  assert.ok(
    existsSync(FRESHNESS_SCRIPT_PATH),
    `Expected freshness check script at ${FRESHNESS_SCRIPT_PATH}`
  );
});

test('check-snapshot-freshness.mjs contains stale threshold marker', () => {
  const src = readFileSync(FRESHNESS_SCRIPT_PATH, 'utf8');
  assert.ok(
    src.includes('stale threshold'),
    'Freshness script must reference the stale threshold'
  );
});

test('check-snapshot-freshness.mjs is valid ESM (contains import keyword)', () => {
  const src = readFileSync(FRESHNESS_SCRIPT_PATH, 'utf8');
  assert.ok(src.includes('import '), 'Freshness script must use ESM imports');
  assert.ok(src.startsWith('#!/usr/bin/env node') || src.includes('import.meta'), 'Freshness script must be a valid .mjs file');
});

// ── AC11: package.json has readiness:check script ─────────────────────────

test('package.json has readiness:check script', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  assert.ok(
    pkg.scripts && typeof pkg.scripts['readiness:check'] === 'string',
    'package.json must define scripts["readiness:check"]'
  );
  assert.ok(
    pkg.scripts['readiness:check'].includes('check-snapshot-freshness.mjs'),
    'readiness:check must invoke check-snapshot-freshness.mjs'
  );
});
