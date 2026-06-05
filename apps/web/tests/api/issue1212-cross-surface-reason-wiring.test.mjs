// Issue #1212 — verify the cross-surface Admin / Guide preview helper
// (`describePreviewReason`) routes ALL 9 canonical states through the
// shared `getCanonicalReasonCopy` helper instead of duplicating zh-TW
// copy. The label may stay admin/guide-flavoured because it's a UI chip;
// the description (the longer sentence operators read) must match what
// Traveler eventually surfaces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describePreviewReason } from '../../src/lib/availability-v2/canonical-availability-ui.ts';
import {
  getCanonicalReasonCopy,
  CANONICAL_AVAILABILITY_STATES,
} from '../../src/lib/availability-v2/canonical-reason-copy.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_FILE = path.resolve(__dirname, '../../src/lib/availability-v2/canonical-availability-ui.ts');

test('canonical-availability-ui.ts imports getCanonicalReasonCopy', async () => {
  const src = await readFile(UI_FILE, 'utf8');
  assert.match(
    src,
    /import\s*{\s*getCanonicalReasonCopy\s*}\s*from\s*['"][^'"]*canonical-reason-copy(\.ts)?['"]/,
  );
});

for (const state of CANONICAL_AVAILABILITY_STATES) {
  test(`describePreviewReason(${state}) returns the canonical bodyZh as its description`, () => {
    // No seasonGate metadata — so the canonical state path is exercised.
    const out = describePreviewReason({ previewCanonicalState: state, previewSeasonGate: null });
    const canonical = getCanonicalReasonCopy(state);
    assert.equal(out.description, canonical.bodyZh, `${state} description must match canonical bodyZh`);
    assert.ok(out.label && out.label.length > 0, `${state} label must be non-empty zh-TW string`);
  });
}

test('seasonGate metadata still wins for admin-config warnings (no_active_season)', () => {
  // Configuration hint: when admin has set no seasons, even if canonical
  // state happens to be outside_season the operator-facing actionable
  // advice is "configure seasons", not "pick another date".
  const out = describePreviewReason({
    previewCanonicalState: 'outside_season',
    previewSeasonGate: 'no_active_season',
  });
  assert.match(out.label, /尚未設定開放季節/);
  // This branch does NOT route through canonical helper because it's
  // an admin-config flavour, not a booking-reject reason.
  assert.notEqual(out.description, getCanonicalReasonCopy('outside_season').bodyZh);
});

test('seasonGate metadata wins for explicit_year_round and inside_season too', () => {
  const yr = describePreviewReason({
    previewCanonicalState: 'available',
    previewSeasonGate: 'explicit_year_round',
  });
  assert.match(yr.label, /全年開放/);
  assert.equal(yr.tone, 'success');

  const inside = describePreviewReason({
    previewCanonicalState: 'available',
    previewSeasonGate: 'inside_season',
  });
  assert.match(inside.label, /位於方案開放季節內/);
});

test('unknown state falls back via getCanonicalReasonCopy default branch', () => {
  const out = describePreviewReason({ previewCanonicalState: 'this_state_does_not_exist', previewSeasonGate: null });
  // getCanonicalReasonCopy('') returns the same default copy as the
  // unknown state branch — fallback must be the canonical default,
  // not arbitrary admin sugar.
  assert.equal(out.description, getCanonicalReasonCopy('').bodyZh);
});
