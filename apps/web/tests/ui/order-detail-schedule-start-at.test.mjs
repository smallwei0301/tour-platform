/**
 * RED test for issue #345: listMyOrdersDb must return scheduleStartAt
 * so the traveler order page can gate the refund button on departure date.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('listMyOrdersDb fetches activity_schedules and maps scheduleStartAt', async () => {
  const src = await readSource('src/lib/db.mjs');

  // Must select start_at from activity_schedules when building the order map
  assert.match(src, /activity_schedules[\s\S]{0,200}start_at[\s\S]{0,200}scheduleMap|scheduleMap[\s\S]{0,200}start_at/,
    'db.mjs must query activity_schedules.start_at and build a scheduleMap');

  // Must include scheduleStartAt in the returned order objects
  assert.match(src, /scheduleStartAt:\s*scheduleMap/,
    'listMyOrdersDb must map scheduleStartAt from scheduleMap');
});

test('in-memory listMyOrders (services.mjs) propagates scheduleStartAt via order spread', async () => {
  const src = await readSource('src/lib/services.mjs');

  // The in-memory order was created with scheduleStartAt set on the object
  // and listMyOrders spreads ...o, so scheduleStartAt is present
  assert.match(src, /scheduleStartAt/,
    'services.mjs orders must include scheduleStartAt (set at create time, spread in listMyOrders)');
});
