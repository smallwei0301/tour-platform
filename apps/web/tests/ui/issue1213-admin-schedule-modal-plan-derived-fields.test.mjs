// Issue #1213 — admin schedule-create modal pre-populates duration / base_price.
// Source-contract guard that future refactors don't silently regress the
// plan→endHH / plan→base_price wiring.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(__dirname, '../../app/admin/activities/[id]/edit/page.tsx');

test('V2ActivityPlan carries duration_minutes (so the modal can seed endHH)', async () => {
  const src = await readFile(PAGE, 'utf8');
  assert.match(src, /interface\s+V2ActivityPlan\b/);
  assert.match(src, /duration_minutes\?:\s*number/);
});

test('admin modal imports addMinutesToHHMM from src/lib/hhmm', async () => {
  const src = await readFile(PAGE, 'utf8');
  assert.match(src, /import\s*{\s*addMinutesToHHMM\s*}\s*from\s*['"][^'"]*lib\/hhmm['"]/);
});

test('plan-change effect seeds endHH from startHH + duration_minutes', async () => {
  const src = await readFile(PAGE, 'utf8');
  // Look for the literal seeding call inside the useEffect on [planId]. The
  // regex is wide enough to survive small whitespace/style changes.
  assert.match(
    src,
    /setEndHH\(\s*addMinutesToHHMM\(\s*startHH\s*,\s*selectedPlan\.duration_minutes\s*\)\s*\)/,
  );
});

test('plan-change effect still seeds capacity + minParticipants (#1196 guard)', async () => {
  const src = await readFile(PAGE, 'utf8');
  assert.match(src, /setCapacity\(\s*String\(selectedPlan\.max_participants\)\s*\)/);
  assert.match(src, /setMinParticipants\(\s*String\(selectedPlan\.min_participants\)\s*\)/);
});

test('modal surfaces base_price next to the selected plan (echo, not editable)', async () => {
  const src = await readFile(PAGE, 'utf8');
  // Two render branches — auto-applied 1-plan + ≥2 plans dropdown — both
  // should show the per-person price. Look for the literal "每人 NT$" string
  // appearing at least twice.
  const matches = src.match(/每人\s*NT\$\s*\$?/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected ≥2 "每人 NT$" price echoes; saw ${matches.length}`,
  );
  // And it must read from base_price, not be a hard-coded number.
  assert.match(src, /base_price\.toLocaleString\(\)/);
});

test('initial endHH defaults seed from plan when exactly 1 plan is auto-applied', async () => {
  // We don't snapshot the exact tokens — just check that `initialPlan?.duration_minutes`
  // contributes to the initial endHH so single-plan activities get a sensible
  // default before the operator touches the dropdown.
  const src = await readFile(PAGE, 'utf8');
  assert.match(src, /initialPlan\?\.duration_minutes/);
  assert.match(src, /useState\(\s*initialEndHH\s*\)/);
});
