/**
 * Issue #1072 — Admin Q&A 「待審核」 tab 看不到旅客提問
 *
 * Root cause: DB CHECK constraint enforces status IN
 * ('pending_moderation', 'approved', 'rejected'); traveler POST writes
 * 'pending_moderation'; admin UI was filtering by 'pending'.
 *
 * Fix strategy (TDD, backend slice):
 *  - Extract pure helper `normalizeAdminQAStatusFilter` to alias 'pending'
 *    → 'pending_moderation' (back-compat for old bookmarks) and pass
 *    through canonical values unchanged.
 *  - Wire helper into GET /api/admin/qa before .eq('status', ...).
 *
 * Frontend correctness is covered by Playwright spec
 *   apps/web/e2e/issue1072-admin-qa-pending-tab.spec.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { normalizeAdminQAStatusFilter } from '../../src/lib/admin-qa-status.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_QA_ROUTE = join(__dirname, '../../app/api/admin/qa/route.ts');
const ADMIN_QA_PAGE = join(__dirname, '../../app/admin/qa/page.tsx');

// --- Cycle A1: helper behaviour --------------------------------------------

test('normalizeAdminQAStatusFilter: aliases legacy "pending" to canonical', () => {
  assert.equal(normalizeAdminQAStatusFilter('pending'), 'pending_moderation');
});

test('normalizeAdminQAStatusFilter: passes canonical "pending_moderation" through', () => {
  assert.equal(
    normalizeAdminQAStatusFilter('pending_moderation'),
    'pending_moderation',
  );
});

test('normalizeAdminQAStatusFilter: passes "approved" through', () => {
  assert.equal(normalizeAdminQAStatusFilter('approved'), 'approved');
});

test('normalizeAdminQAStatusFilter: passes "rejected" through', () => {
  assert.equal(normalizeAdminQAStatusFilter('rejected'), 'rejected');
});

test('normalizeAdminQAStatusFilter: preserves empty string (caller skips .eq)', () => {
  assert.equal(normalizeAdminQAStatusFilter(''), '');
});

test('normalizeAdminQAStatusFilter: preserves undefined', () => {
  assert.equal(normalizeAdminQAStatusFilter(undefined), undefined);
});

// --- Cycle A2: admin GET wires the helper before .eq -----------------------

test('admin Q&A route imports normalizeAdminQAStatusFilter', () => {
  const src = readFileSync(ADMIN_QA_ROUTE, 'utf8');
  assert.match(
    src,
    /normalizeAdminQAStatusFilter/,
    'GET /api/admin/qa must import normalizeAdminQAStatusFilter from src/lib/admin-qa-status.mjs',
  );
});

test('admin Q&A route normalizes status before applying .eq()', () => {
  const src = readFileSync(ADMIN_QA_ROUTE, 'utf8');
  const normalizeIdx = src.indexOf('normalizeAdminQAStatusFilter(');
  const eqStatusIdx = src.indexOf(".eq('status'");
  assert.ok(normalizeIdx >= 0, 'expected a normalize call');
  assert.ok(eqStatusIdx >= 0, "expected .eq('status', …) usage");
  assert.ok(
    normalizeIdx < eqStatusIdx,
    'normalize must happen before .eq() so the canonical value is sent to Supabase',
  );
});

// --- Cycle B (source-contract for the admin page) --------------------------
// Locks the page to the canonical pending status so future edits cannot
// silently regress the bug. The visible '待審核' label is also asserted to
// stay put.

test('admin Q&A page: TS union uses canonical pending_moderation', () => {
  const src = readFileSync(ADMIN_QA_PAGE, 'utf8');
  assert.match(
    src,
    /status:\s*'pending_moderation'\s*\|\s*'approved'\s*\|\s*'rejected'/,
    "QAEntry.status union must be 'pending_moderation' | 'approved' | 'rejected'",
  );
});

test('admin Q&A page: default filter is pending_moderation', () => {
  const src = readFileSync(ADMIN_QA_PAGE, 'utf8');
  assert.match(
    src,
    /useState\(\s*'pending_moderation'\s*\)/,
    "default statusFilter must be 'pending_moderation'",
  );
});

test('admin Q&A page: pending tab uses canonical value and keeps 待審核 label', () => {
  const src = readFileSync(ADMIN_QA_PAGE, 'utf8');
  assert.match(
    src,
    /\{\s*value:\s*'pending_moderation'\s*,\s*label:\s*'待審核'\s*\}/,
    "tab entry must be { value: 'pending_moderation', label: '待審核' }",
  );
});

test('admin Q&A page: status equality checks use canonical value', () => {
  const src = readFileSync(ADMIN_QA_PAGE, 'utf8');
  const matches = src.match(/q\.status\s*===\s*'pending_moderation'/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected at least 2 'q.status === pending_moderation' checks (pendingCount + conditional render), found ${matches.length}`,
  );
});

test('admin Q&A page: no stale "pending" status literal remains', () => {
  const src = readFileSync(ADMIN_QA_PAGE, 'utf8');
  // Match a 'pending' literal that is NOT followed by '_' (i.e. not '_moderation').
  // This catches accidental reintroductions of the legacy value.
  const stale = src.match(/'pending'(?!_)/g) ?? [];
  assert.equal(
    stale.length,
    0,
    `found ${stale.length} stale 'pending' literal(s); the canonical value is 'pending_moderation'`,
  );
});
