import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao summary route：auth＋envelope', async () => {
  const src = await read('app/api/v2/guide/midao/summary/route.ts');
  assert.match(src, /verifyGuideSession\(request\)/);
  assert.match(src, /jsonError\('UNAUTHORIZED'/);
  assert.match(src, /getMidaoSummaryDb\(session\.guideId\)/);
  assert.match(src, /handleRouteError/);
});

test('midao requests collection route：list 驗證 query、create 走 CSRF＋manual source', async () => {
  const src = await read('app/api/v2/guide/midao/requests/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+POST/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /jsonError\('INVALID_STATUS'/);
  assert.match(src, /listMidaoRequestsDb\(session\.guideId/);
  assert.match(src, /source: 'manual'/);
});

test('midao request item route：詳情 404＋狀態 PATCH 驗證轉換', async () => {
  const src = await read('app/api/v2/guide/midao/requests/[requestId]/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+PATCH/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /MIDAO_REQUEST_STATUSES\.includes\(body\.status\)/);
  assert.match(src, /getMidaoRequestDb\(session\.guideId, requestId\)/);
  assert.match(src, /updateMidaoRequestStatusDb\(session\.guideId, requestId, body\.status\)/);
  assert.match(src, /'NOT_FOUND' \? 404 : 409/);
});
