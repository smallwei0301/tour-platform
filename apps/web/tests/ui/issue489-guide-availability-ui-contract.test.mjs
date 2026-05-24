import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('availability page fetches guide-owned activity+plan options and sends activity_plan_id/effective dates in payload', async () => {
  const src = await readSource('app/guide/availability/page.tsx');

  assert.match(src, /fetch\('\/api\/guide\/activities-with-plans'\)/, 'must fetch /api/guide/activities-with-plans for guide-owned options');
  assert.match(src, /activity_plan_id/, 'rule payload must include activity_plan_id');
  assert.match(src, /effective_from/, 'rule payload must include effective_from');
  assert.match(src, /effective_to/, 'rule payload must include effective_to');
  assert.match(src, /type="date"/, 'single-day rule flow needs date input');
});

test('availability rules list renders human-readable activity/plan labels and Taiwan timezone text', async () => {
  const src = await readSource('app/guide/availability/page.tsx');

  assert.match(src, /activityTitle|activity_name/, 'list should render activity name label');
  assert.match(src, /planName|plan_name|activity_plans\?\.name/, 'list should render plan name label');
  assert.match(src, /台灣時間|Asia\/Taipei/, 'UI should clearly indicate timezone context');
});

test('guide schedules page keeps capacity min at bookedCount and surfaces server error path', async () => {
  const src = await readSource('app/guide/schedules/page.tsx');

  assert.match(src, /min=\{s\.bookedCount\}/, 'capacity input min must be bookedCount');
  assert.match(src, /json\?\.error\?\.message/, 'must surface server error message when capacity update rejected');
  assert.match(src, /open\/full\/cancelled|開放\s*\/\s*額滿\s*\/\s*已關閉/, 'status labels should clearly cover open/full/cancelled semantics');
  assert.match(src, /固定場次|activity_schedules/, 'open/close helper text should clarify it only manages fixed schedules');
});
