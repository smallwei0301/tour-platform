// Locks the one state-machine change for 三種預約模式：draft → confirmed becomes
// a legal transition (so instant/scheduled bookings can auto-confirm on payment),
// while every other transition stays exactly as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  join(__dirname, '../../src/lib/booking-state.ts'),
  'utf8',
);

test('VALID_TRANSITIONS.draft allows pending_confirmation, confirmed and cancelled', () => {
  const m = SRC.match(/draft:\s*\[([^\]]*)\]/);
  assert.ok(m, 'draft transition entry must exist');
  const targets = m[1]
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
  assert.deepEqual(new Set(targets), new Set(['pending_confirmation', 'confirmed', 'cancelled']));
});

test('pending_confirmation transitions are unchanged', () => {
  const m = SRC.match(/pending_confirmation:\s*\[([^\]]*)\]/);
  assert.ok(m, 'pending_confirmation transition entry must exist');
  const targets = m[1]
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
  assert.deepEqual(
    new Set(targets),
    new Set(['confirmed', 'cancelled', 'reschedule_requested']),
  );
});

test('terminal states remain terminal', () => {
  for (const terminal of ['completed', 'cancelled', 'no_show']) {
    const m = SRC.match(new RegExp(`${terminal}:\\s*\\[([^\\]]*)\\]`));
    assert.ok(m, `${terminal} entry must exist`);
    const targets = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    assert.equal(targets.length, 0, `${terminal} must have no outgoing transitions`);
  }
});

test('auto_confirm action maps to confirmed', () => {
  assert.match(SRC, /auto_confirm:\s*'confirmed'/);
});
