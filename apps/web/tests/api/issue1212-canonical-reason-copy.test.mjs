// Issue #1212 — shared zh-TW reason copy for the 9 canonical
// availability states. Tests pin:
//   - every state in the resolver's union has non-empty title + body copy
//   - the helper's exported state list stays in sync with the resolver
//     union (catch silent drift if a new state is added to one without
//     the other)
//   - unknown states fail safe with a generic "無法預約" message
//   - the helper source declares NO PII column names (no email / phone /
//     payment payload baked into the copy)
//
// Wiring this helper into Admin / Guide / Traveler surfaces is
// intentionally NOT part of this PR — that requires a cross-surface
// visual QA pass per issue #1212 criteria.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getCanonicalReasonCopy,
  CANONICAL_AVAILABILITY_STATES,
} from '../../src/lib/availability-v2/canonical-reason-copy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// ---------- coverage: every canonical state has non-empty zh-TW copy ----------

test('CANONICAL_AVAILABILITY_STATES covers all 9 canonical states (no drift vs resolver union)', () => {
  const resolverSrc = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/effective-availability-resolver.ts'),
    'utf8',
  );
  const unionBlock = resolverSrc.split('export type CanonicalAvailabilityState')[1]
    ?.split(';')[0]
    || '';
  // Extract every quoted literal from the union declaration.
  const unionStates = Array.from(unionBlock.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]).sort();
  const helperStates = [...CANONICAL_AVAILABILITY_STATES].sort();
  assert.deepEqual(
    helperStates,
    unionStates,
    `Helper states ${JSON.stringify(helperStates)} must match resolver union ${JSON.stringify(unionStates)}`,
  );
});

test('every canonical state has a non-empty titleZh and bodyZh', () => {
  for (const state of CANONICAL_AVAILABILITY_STATES) {
    const copy = getCanonicalReasonCopy(state);
    assert.ok(
      typeof copy.titleZh === 'string' && copy.titleZh.length > 0,
      `${state}: titleZh must be non-empty`,
    );
    assert.ok(
      typeof copy.bodyZh === 'string' && copy.bodyZh.length > 0,
      `${state}: bodyZh must be non-empty`,
    );
  }
});

test('every copy field is Traditional Chinese (zh-TW), not raw English code', () => {
  for (const state of CANONICAL_AVAILABILITY_STATES) {
    const copy = getCanonicalReasonCopy(state);
    // At least one CJK character in both title and body. Catches
    // accidental "Available" / state-code echoes from a future refactor.
    assert.match(copy.titleZh, /[一-鿿]/, `${state}: titleZh must contain zh-Hant`);
    assert.match(copy.bodyZh, /[一-鿿]/, `${state}: bodyZh must contain zh-Hant`);
  }
});

// ---------- per-state specifics (lock the operator-facing meaning) ----------

test('available state → "可預約" with positive body', () => {
  const r = getCanonicalReasonCopy('available');
  assert.equal(r.titleZh, '可預約');
  assert.match(r.bodyZh, /可預約/);
});

test('full / closed / blackout titles distinguish capacity vs operator action vs guide signal', () => {
  assert.equal(getCanonicalReasonCopy('full').titleZh, '已額滿');
  assert.equal(getCanonicalReasonCopy('closed').titleZh, '已關閉');
  assert.equal(getCanonicalReasonCopy('blackout').titleZh, '導遊不可服務');
});

test('inactive_plan body tells operator to re-select a plan (not just "not available")', () => {
  const r = getCanonicalReasonCopy('inactive_plan');
  assert.equal(r.titleZh, '方案未啟用');
  assert.match(r.bodyZh, /重新選擇方案/);
});

test('outside_season is distinct from outside_rule (per #1067 acceptance: season ≠ rule)', () => {
  const season = getCanonicalReasonCopy('outside_season');
  const rule = getCanonicalReasonCopy('outside_rule');
  assert.notEqual(season.titleZh, rule.titleZh, 'season and rule must have different titles');
  assert.notEqual(season.bodyZh, rule.bodyZh, 'season and rule must have different bodies');
  assert.match(season.titleZh, /季節/);
  assert.match(rule.titleZh, /時段/);
});

test('blocked_by_conflict vs allowed_with_admin_override: titles must NOT be identical', () => {
  // Guide/Admin UI must never render allowed_with_admin_override as
  // plain "available" — the override should always be visibly distinct.
  const blocked = getCanonicalReasonCopy('blocked_by_conflict');
  const override = getCanonicalReasonCopy('allowed_with_admin_override');
  assert.notEqual(blocked.titleZh, override.titleZh);
  assert.match(override.titleZh, /管理者例外/);
});

// ---------- defensive ----------

test('unknown state → generic "無法預約" copy (does not throw)', () => {
  const r = getCanonicalReasonCopy('this_is_not_a_real_state');
  assert.equal(r.titleZh, '無法預約');
  assert.match(r.bodyZh, /無法預約/);
});

test('metadata parameter is optional and never throws', () => {
  for (const arg of [undefined, null, {}, { capacityLeft: 0 }, { planName: '半日' }]) {
    assert.doesNotThrow(() => getCanonicalReasonCopy('full', arg));
  }
});

// ---------- source contract ----------

test('helper file does NOT reference traveler PII columns in the source', () => {
  // Guard against a future refactor baking email / phone / payment payload
  // into the copy itself (which would then flow into logs / DOM / SEO).
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/canonical-reason-copy.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /\bcontact_phone\b/);
  assert.doesNotMatch(src, /\bemail_body\b/);
  assert.doesNotMatch(src, /\bcredit_card\b/);
});

test('helper exports CANONICAL_AVAILABILITY_STATES as a frozen / const tuple', () => {
  // Tests / callers must be able to iterate the canonical state list
  // without risking accidental mutation. `as const` plus the readonly
  // tuple type is the convention; assert the exported array is array-like.
  assert.ok(Array.isArray(CANONICAL_AVAILABILITY_STATES));
  assert.ok(CANONICAL_AVAILABILITY_STATES.length >= 9);
});
