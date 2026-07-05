/**
 * #1614 — api-response helper 單測：
 * jsonOk/jsonError 的 status、content-type、body shape 必須與既有
 * successV2/errorV2 envelope 逐欄一致（helper 只包裝、不改形狀）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonOk, jsonError } from '../../src/lib/api-response.ts';
import { successV2, errorV2 } from '../../src/lib/api.ts';

test('jsonOk：預設 200、application/json、body 與 successV2 逐欄一致', async () => {
  const res = jsonOk({ id: 'a1', totalTwd: 1200 });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await res.json(), successV2({ id: 'a1', totalTwd: 1200 }));
});

test('jsonOk：可用 init 自訂 status 與 headers（201＋自訂 header 透傳）', async () => {
  const res = jsonOk({ created: true }, { status: 201, headers: { 'x-request-id': 'req-1' } });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('x-request-id'), 'req-1');
  assert.deepEqual(await res.json(), successV2({ created: true }));
});

test('jsonError：status 與 body 與 errorV2 逐欄一致', async () => {
  const res = jsonError('VALIDATION_ERROR', 'Invalid bookingId', 400);
  assert.equal(res.status, 400);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await res.json(), errorV2('VALIDATION_ERROR', 'Invalid bookingId'));
});

test('jsonError：init 透傳但 status 參數優先（明確參數勝過 init.status）', async () => {
  const res = jsonError('NOT_FOUND', 'Booking not found', 404, {
    status: 200, // 故意衝突 — 明確的 status 參數必須贏
    headers: { 'cache-control': 'no-store' },
  });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), errorV2('NOT_FOUND', 'Booking not found'));
});
