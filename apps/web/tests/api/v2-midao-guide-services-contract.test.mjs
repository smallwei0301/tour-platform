import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao services collection route：list auth＋create 驗證與 publish 旗標', async () => {
  const src = await read('app/api/v2/guide/midao/services/route.ts');
  assert.match(src, /verifyGuideSession\(request\)/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /listMidaoServicesDb\(session\.guideId\)/);
  assert.match(src, /createMidaoServiceDb\(session\.guideId, norm\.value, \{ publish: body\.publish === true \}\)/);
});

test('midao services item route：PATCH 新契約＋404/400 分流', async () => {
  const src = await read('app/api/v2/guide/midao/services/[activityId]/route.ts');
  assert.match(src, /export\s+async\s+function\s+PATCH/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /updateMidaoServiceDb\(session\.guideId, activityId, body\)/);
  assert.match(src, /result\.code === 'NOT_FOUND' \? 404 : 400/);
});
