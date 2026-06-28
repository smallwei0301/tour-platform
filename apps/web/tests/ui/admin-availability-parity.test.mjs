// Source-contract: the admin guide availability form is aligned with the guide
// self-service form — same fields the guide has (effective date range, dynamic
// re-emit toggle, plan participants, season-conflict hint, richer rule cards).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

const ADMIN = read('app/admin/guides/[guideId]/availability/page.tsx');
const GUIDE = read('app/guide/availability/page.tsx');
const PLANS_API = read('app/api/v2/admin/guides/[guideId]/activity-plans/route.ts');

test('admin form imports the same season-conflict helper as the guide form', () => {
  assert.match(ADMIN, /describeRuleSeasonConflict/);
  assert.match(GUIDE, /describeRuleSeasonConflict/);
});

test('admin form has the dynamic re-emit toggle (in state + checkbox)', () => {
  assert.match(ADMIN, /use_dynamic_reemit: false/); // form default
  assert.match(ADMIN, /use_dynamic_reemit: rule\.use_dynamic_reemit \?\? false/); // edit-populate
  assert.match(ADMIN, /checked=\{ruleForm\.use_dynamic_reemit\}/); // checkbox
  assert.match(ADMIN, /啟用動態時段/);
});

test('admin form has weekly effective date-range inputs (生效起日/迄日)', () => {
  assert.match(ADMIN, /生效起日（可空）/);
  assert.match(ADMIN, /生效迄日（可空）/);
  assert.match(ADMIN, /admin-avail-start-date/);
  assert.match(ADMIN, /admin-avail-end-date/);
});

test('admin form shows plan participants + season-conflict block', () => {
  assert.match(ADMIN, /formatParticipants/);
  assert.match(ADMIN, /ruleSeasonConflict/);
});

test('admin activity-plans API returns participants for the selector/cards', () => {
  assert.match(PLANS_API, /min_participants/);
  assert.match(PLANS_API, /max_participants/);
  assert.match(PLANS_API, /minParticipants: p\.min_participants/);
  assert.match(PLANS_API, /maxParticipants: p\.max_participants/);
});
