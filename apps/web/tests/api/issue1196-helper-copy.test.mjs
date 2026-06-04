/**
 * Issue #1196 — AC4: helper copy contract
 *
 * Source-contract tests that lock the zh-TW helper string explaining field
 * scope and precedence (plan status > season > availability rule >
 * blackout/conflict) into both the Admin and Guide UI files.
 *
 * These tests read the source files via fs.readFileSync and match for the
 * presence of specific zh-TW text — the same pattern used by issue1072.
 *
 * RED: text not yet present in the UI files.
 * GREEN: after adding the helper copy to the UI files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GUIDE_AVAILABILITY_PAGE = join(__dirname, '../../app/guide/availability/page.tsx');
const ADMIN_EDIT_PAGE = join(__dirname, '../../app/admin/activities/[id]/edit/page.tsx');

// ── Guide availability page helper copy ─────────────────────────────────────

test('GH-1196 AC4: Guide availability page contains zh-TW precedence helper copy', () => {
  const src = readFileSync(GUIDE_AVAILABILITY_PAGE, 'utf8');
  // Must contain a string explaining the precedence chain in zh-TW:
  // plan status > season > availability rule > blackout/conflict
  assert.match(
    src,
    /方案狀態.*?開放季節.*?時段規則.*?黑名單|方案狀態.*?季節.*?規則.*?衝突|優先順序.*?方案.*?季節.*?規則|plan.*?season.*?rule.*?conflict/i,
    'Guide availability page must contain zh-TW helper copy explaining precedence: plan status > season > availability rule > blackout/conflict',
  );
});

test('GH-1196 AC4: Guide availability page contains data-testid for precedence helper', () => {
  const src = readFileSync(GUIDE_AVAILABILITY_PAGE, 'utf8');
  assert.match(
    src,
    /data-testid="guide-availability-precedence-helper"/,
    'Guide availability page must have data-testid="guide-availability-precedence-helper"',
  );
});

test('GH-1196 AC4: Admin edit page contains zh-TW precedence helper copy in AddScheduleModal', () => {
  const src = readFileSync(ADMIN_EDIT_PAGE, 'utf8');
  // Must contain a string explaining field precedence
  assert.match(
    src,
    /方案狀態.*?開放季節.*?時段規則.*?黑名單|方案狀態.*?季節.*?規則.*?衝突|優先順序.*?方案.*?季節.*?規則|plan.*?season.*?rule.*?conflict/i,
    'Admin edit page must contain zh-TW helper copy explaining precedence: plan status > season > availability rule > blackout/conflict',
  );
});

test('GH-1196 AC4: Admin edit page contains data-testid for precedence helper', () => {
  const src = readFileSync(ADMIN_EDIT_PAGE, 'utf8');
  assert.match(
    src,
    /data-testid="admin-availability-precedence-helper"/,
    'Admin edit page must have data-testid="admin-availability-precedence-helper"',
  );
});
