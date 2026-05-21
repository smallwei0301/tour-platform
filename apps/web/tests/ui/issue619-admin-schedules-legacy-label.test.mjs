import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('guide schedules page is explicitly legacy-only and points V2 users to /guide/availability', async () => {
  const src = await readSource('app/guide/schedules/page.tsx');

  assert.match(src, /Legacy\s*固定場次管理|舊制快照|備援流程/, 'must clearly label this page as legacy/fallback fixed-schedule management');
  assert.match(src, /activity_schedules/, 'must explicitly mention activity_schedules legacy scope');
  assert.match(src, /不會建立\s*V2\s*導遊可售時段規則/, 'must clearly state this page does not create V2 availability rules');
  assert.match(src, /href="\/guide\/availability"/, 'must link V2 users to /guide/availability');
  assert.match(src, /source of truth/, 'must describe /guide/availability as the V2 source of truth');
});
